import { randomBytes } from 'node:crypto';
import { createClient, type CallOptions, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { clone, create, isMessage, toJson, type DescMessage, type MessageInitShape, type MessageShape } from '@bufbuild/protobuf';
import { InterlinkService } from '../../generated/interlink/interlink/v1/interlink_pb.js';
import {
    EnvelopeSchema,
    GetBotInfoRequestSchema,
    HeartbeatRequestSchema,
    ListBotsRequestSchema,
    RegisterBotRequestSchema,
    SubscribeRequestSchema,
    UnregisterBotRequestSchema,
    type BotInfo,
    type Envelope,
    type HeartbeatResponse,
    type ListBotsResponse,
    type RegisterBotResponse,
    type SendResponse,
    type UnregisterBotResponse
} from '../../generated/interlink/interlink/v1/interlink_pb.js';
import { config } from '../../config/config.js';

export const INTERLINK_AUTH_SCHEME = 'HMAC-SHA256';
export const INTERLINK_TIMESTAMP_HEADER = 'X-Interlink-Timestamp';
export const INTERLINK_NONCE_HEADER = 'X-Interlink-Nonce';
export const INTERLINK_BOT_HEADER = 'X-Interlink-Bot';

export type InterlinkServiceClient = Client<typeof InterlinkService>;

export interface InterlinkConnectClientOptions {
    baseUrl?: string;
    botId?: string;
    authKey?: string;
    client?: InterlinkServiceClient;
}

interface HashedBody<Desc extends DescMessage> {
    schema: Desc;
    message: MessageShape<Desc>;
}

export function emptyBodyHash(): string {
    return bytesToHex(sha256(new Uint8Array(0)));
}

export function bodyHashOf<Desc extends DescMessage>(schema: Desc, message: MessageShape<Desc>): string {
    const normalized = clone(schema, message);
    sortMapFields(schema, normalized);
    return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(toJson(schema, normalized)))));
}

export function canonicalString(procedure: string, timestamp: string, nonce: string, bodyHash: string): string {
    return [procedure, timestamp, nonce, bodyHash].join('\n');
}

export function signRequest(authKey: string, procedure: string, timestamp: string, nonce: string, bodyHash: string): string {
    const signature = hmac(sha256, new TextEncoder().encode(authKey), new TextEncoder().encode(canonicalString(procedure, timestamp, nonce, bodyHash)));
    return Buffer.from(signature).toString('base64');
}

export function generateNonce(): string {
    return randomBytes(16).toString('hex');
}

export function extractBotId(message: unknown): string {
    if (typeof message !== 'object' || message === null) {
        return '';
    }
    const record = message as Record<string, unknown>;
    if (typeof record['source'] === 'string') {
        return record['source'];
    }
    if (typeof record['botId'] === 'string') {
        return record['botId'];
    }
    return '';
}

export function procedureFor(methodName: string): string {
    return `/${InterlinkService.typeName}/${methodName}`;
}

function isMapRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function sortMapFields<Desc extends DescMessage>(schema: Desc, message: MessageShape<Desc>): void {
    const record = message as unknown as Record<string, unknown>;
    for (const field of schema.fields) {
        const value = record[field.localName];
        if (field.fieldKind === 'map' && isMapRecord(value)) {
            const sorted: Record<string, unknown> = {};
            for (const key of Object.keys(value).sort()) {
                const entry = value[key];
                sorted[key] = entry;
                if (field.mapKind === 'message' && isMessage(entry, field.message)) {
                    sortMapFields(field.message, entry);
                }
            }
            record[field.localName] = sorted;
        } else if (field.fieldKind === 'message' && isMessage(value, field.message)) {
            sortMapFields(field.message, value);
        } else if (field.fieldKind === 'list' && field.listKind === 'message' && Array.isArray(value)) {
            for (const item of value) {
                if (isMessage(item, field.message)) {
                    sortMapFields(field.message, item);
                }
            }
        }
    }
}

async function* withStreamIdentity(input: AsyncIterable<MessageInitShape<typeof EnvelopeSchema>>): AsyncGenerator<Envelope> {
    for await (const partial of input) {
        const envelope = isMessage(partial, EnvelopeSchema) ? partial : create(EnvelopeSchema, partial);
        if (envelope.nonce === '') {
            envelope.nonce = generateNonce();
        }
        if (envelope.timestamp === BigInt(0)) {
            envelope.timestamp = BigInt(Date.now());
        }
        yield envelope;
    }
}

export class InterlinkConnectClient {
    private readonly client: InterlinkServiceClient;
    private readonly botId: string;
    private readonly authKey: string;

    constructor(options: InterlinkConnectClientOptions = {}) {
        this.botId = options.botId ?? config.discord.clientId ?? '';
        this.authKey = options.authKey ?? config.interlink.authKey ?? '';
        if (options.client) {
            this.client = options.client;
            return;
        }
        const transport = createConnectTransport({
            baseUrl: options.baseUrl ?? config.interlink.grpcAddress,
            httpVersion: '2'
        });
        this.client = createClient(InterlinkService, transport);
    }

    private headersFor<Desc extends DescMessage>(procedure: string, body: HashedBody<Desc> | null): Record<string, string> {
        const timestamp = Date.now().toString();
        const nonce = generateNonce();
        const bodyHash = body === null ? emptyBodyHash() : bodyHashOf(body.schema, body.message);
        return {
            Authorization: `${INTERLINK_AUTH_SCHEME} ${signRequest(this.authKey, procedure, timestamp, nonce, bodyHash)}`,
            [INTERLINK_TIMESTAMP_HEADER]: timestamp,
            [INTERLINK_NONCE_HEADER]: nonce,
            [INTERLINK_BOT_HEADER]: extractBotId(body?.message) || this.botId
        };
    }

    private callOptions<Desc extends DescMessage>(procedure: string, body: HashedBody<Desc> | null, options?: CallOptions): CallOptions {
        return { ...options, headers: this.headersFor(procedure, body) };
    }

    async send(envelope: MessageInitShape<typeof EnvelopeSchema>, options?: CallOptions): Promise<SendResponse> {
        const message = create(EnvelopeSchema, envelope);
        return this.client.send(message, this.callOptions(procedureFor(InterlinkService.method.send.name), { schema: EnvelopeSchema, message }, options));
    }

    subscribe(botId: string, messageTypes: string[] = [], options?: CallOptions): AsyncIterable<Envelope> {
        const message = create(SubscribeRequestSchema, { botId, messageTypes });
        return this.client.subscribe(message, this.callOptions(procedureFor(InterlinkService.method.subscribe.name), { schema: SubscribeRequestSchema, message }, options));
    }

    connect(input: AsyncIterable<MessageInitShape<typeof EnvelopeSchema>>, options?: CallOptions): AsyncIterable<Envelope> {
        return this.client.connect(withStreamIdentity(input), this.callOptions(procedureFor(InterlinkService.method.connect.name), null, options));
    }

    async registerBot(request: MessageInitShape<typeof RegisterBotRequestSchema>, options?: CallOptions): Promise<RegisterBotResponse> {
        const message = create(RegisterBotRequestSchema, request);
        return this.client.registerBot(message, this.callOptions(procedureFor(InterlinkService.method.registerBot.name), { schema: RegisterBotRequestSchema, message }, options));
    }

    async heartbeat(request: MessageInitShape<typeof HeartbeatRequestSchema>, options?: CallOptions): Promise<HeartbeatResponse> {
        const message = create(HeartbeatRequestSchema, request);
        return this.client.heartbeat(message, this.callOptions(procedureFor(InterlinkService.method.heartbeat.name), { schema: HeartbeatRequestSchema, message }, options));
    }

    async unregisterBot(botId: string, options?: CallOptions): Promise<UnregisterBotResponse> {
        const message = create(UnregisterBotRequestSchema, { botId });
        return this.client.unregisterBot(message, this.callOptions(procedureFor(InterlinkService.method.unregisterBot.name), { schema: UnregisterBotRequestSchema, message }, options));
    }

    async listBots(options?: CallOptions): Promise<ListBotsResponse> {
        const message = create(ListBotsRequestSchema);
        return this.client.listBots(message, this.callOptions(procedureFor(InterlinkService.method.listBots.name), { schema: ListBotsRequestSchema, message }, options));
    }

    async getBotInfo(botId: string, options?: CallOptions): Promise<BotInfo> {
        const message = create(GetBotInfoRequestSchema, { botId });
        return this.client.getBotInfo(message, this.callOptions(procedureFor(InterlinkService.method.getBotInfo.name), { schema: GetBotInfoRequestSchema, message }, options));
    }

    async close(): Promise<void> {
        await Promise.resolve();
    }
}

let singletonClient: InterlinkConnectClient | null = null;

export function getInterlinkClient(options?: InterlinkConnectClientOptions): InterlinkConnectClient {
    singletonClient ??= new InterlinkConnectClient(options);
    return singletonClient;
}

export function resetInterlinkClient(): void {
    singletonClient = null;
}
