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
import { issueInterlinkToken } from './auth.js';
import { injectTraceContext } from '../../observability/otel.js';
import { context } from '@opentelemetry/api';

export const INTERLINK_AUTH_SCHEME = 'HMAC-SHA256';
export const INTERLINK_AUTH_SCHEME_JWT = 'Bearer';
export const INTERLINK_TIMESTAMP_HEADER = 'X-Interlink-Timestamp';
export const INTERLINK_NONCE_HEADER = 'X-Interlink-Nonce';
export const INTERLINK_BOT_HEADER = 'X-Interlink-Bot';

export type InterlinkServiceClient = Client<typeof InterlinkService>;

export interface InterlinkConnectClientOptions {
    baseUrl?: string;
    botId?: string;
    authKey?: string;
    capabilities?: Record<string, string>;
    client?: InterlinkServiceClient;
    useJwt?: boolean;
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
    private readonly capabilities: Record<string, string>;
    private readonly useJwt: boolean;
    private jwtToken: string | null = null;
    private jwtExpiry: number = 0;

    constructor(options: InterlinkConnectClientOptions = {}) {
        this.botId = options.botId ?? config.discord.clientId ?? '';
        this.authKey = options.authKey ?? config.interlink.authKey ?? '';
        this.capabilities = options.capabilities ?? { commands: 'true', events: 'true' };
        this.useJwt = options.useJwt ?? Boolean(config.interlink.jwtSecret);
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

    private async ensureJwtToken(): Promise<string> {
        if (!this.useJwt) {
            return '';
        }
        const now = Date.now();
        if (this.jwtToken && this.jwtExpiry > now + 60000) { // 1 min buffer
            return this.jwtToken;
        }
        this.jwtToken = await issueInterlinkToken(this.botId, this.capabilities);
        // Parse expiry from token
        const parts = this.jwtToken.split('.');
        if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            this.jwtExpiry = payload.exp * 1000;
        }
        return this.jwtToken;
    }

    private async headersFor<Desc extends DescMessage>(procedure: string, body: HashedBody<Desc> | null): Promise<Record<string, string>> {
        const timestamp = Date.now().toString();
        const nonce = generateNonce();
        const bodyHash = body === null ? emptyBodyHash() : bodyHashOf(body.schema, body.message);

        const headers: Record<string, string> = {
            [INTERLINK_TIMESTAMP_HEADER]: timestamp,
            [INTERLINK_NONCE_HEADER]: nonce,
            [INTERLINK_BOT_HEADER]: extractBotId(body?.message) || this.botId
        };

        // Inject trace context for cross-service tracing
        injectTraceContext(context.active(), headers);

        if (this.useJwt) {
            const jwtToken = await this.ensureJwtToken();
            if (jwtToken) {
                headers['Authorization'] = `${INTERLINK_AUTH_SCHEME_JWT} ${jwtToken}`;
            } else {
                // Fallback to HMAC if JWT fails
                headers['Authorization'] = `${INTERLINK_AUTH_SCHEME} ${signRequest(this.authKey, procedure, timestamp, nonce, bodyHash)}`;
            }
        } else {
            headers['Authorization'] = `${INTERLINK_AUTH_SCHEME} ${signRequest(this.authKey, procedure, timestamp, nonce, bodyHash)}`;
        }

        return headers;
    }

    private async callOptions<Desc extends DescMessage>(procedure: string, body: HashedBody<Desc> | null, options?: CallOptions): Promise<CallOptions> {
        const headers = await this.headersFor(procedure, body);
        return { ...options, headers };
    }

    async send(envelope: MessageInitShape<typeof EnvelopeSchema>, options?: CallOptions): Promise<SendResponse> {
        const message = create(EnvelopeSchema, envelope);
        const callOpts = await this.callOptions(procedureFor(InterlinkService.method.send.name), { schema: EnvelopeSchema, message }, options);
        return this.client.send(message, callOpts);
    }

    subscribe(botId: string, messageTypes: string[] = [], options?: CallOptions): AsyncIterable<Envelope> {
        const message = create(SubscribeRequestSchema, { botId, messageTypes });
        // For subscribe, we can't await in a sync function, so we'll use the HMAC path directly
        // or make subscribe async. For now, keep HMAC path for subscribe.
        const timestamp = Date.now().toString();
        const nonce = generateNonce();
        const bodyHash = bodyHashOf(SubscribeRequestSchema, message);
        const headers = {
            Authorization: `${INTERLINK_AUTH_SCHEME} ${signRequest(this.authKey, procedureFor(InterlinkService.method.subscribe.name), timestamp, nonce, bodyHash)}`,
            [INTERLINK_TIMESTAMP_HEADER]: timestamp,
            [INTERLINK_NONCE_HEADER]: nonce,
            [INTERLINK_BOT_HEADER]: this.botId
        };
        return this.client.subscribe(message, { ...options, headers });
    }

    connect(input: AsyncIterable<MessageInitShape<typeof EnvelopeSchema>>, options?: CallOptions): AsyncIterable<Envelope> {
        // For connect, we can't await in a sync function, so we'll use HMAC path
        const headers = {
            Authorization: `${INTERLINK_AUTH_SCHEME} ${signRequest(this.authKey, procedureFor(InterlinkService.method.connect.name), Date.now().toString(), generateNonce(), emptyBodyHash())}`,
            [INTERLINK_TIMESTAMP_HEADER]: Date.now().toString(),
            [INTERLINK_NONCE_HEADER]: generateNonce(),
            [INTERLINK_BOT_HEADER]: this.botId
        };
        return this.client.connect(withStreamIdentity(input), { ...options, headers });
    }

    async registerBot(request: MessageInitShape<typeof RegisterBotRequestSchema>, options?: CallOptions): Promise<RegisterBotResponse> {
        const message = create(RegisterBotRequestSchema, request);
        const callOpts = await this.callOptions(procedureFor(InterlinkService.method.registerBot.name), { schema: RegisterBotRequestSchema, message }, options);
        return this.client.registerBot(message, callOpts);
    }

    async heartbeat(request: MessageInitShape<typeof HeartbeatRequestSchema>, options?: CallOptions): Promise<HeartbeatResponse> {
        const message = create(HeartbeatRequestSchema, request);
        const callOpts = await this.callOptions(procedureFor(InterlinkService.method.heartbeat.name), { schema: HeartbeatRequestSchema, message }, options);
        return this.client.heartbeat(message, callOpts);
    }

    async unregisterBot(botId: string, options?: CallOptions): Promise<UnregisterBotResponse> {
        const message = create(UnregisterBotRequestSchema, { botId });
        const callOpts = await this.callOptions(procedureFor(InterlinkService.method.unregisterBot.name), { schema: UnregisterBotRequestSchema, message }, options);
        return this.client.unregisterBot(message, callOpts);
    }

    async listBots(options?: CallOptions): Promise<ListBotsResponse> {
        const message = create(ListBotsRequestSchema);
        const callOpts = await this.callOptions(procedureFor(InterlinkService.method.listBots.name), { schema: ListBotsRequestSchema, message }, options);
        return this.client.listBots(message, callOpts);
    }

    async getBotInfo(botId: string, options?: CallOptions): Promise<BotInfo> {
        const message = create(GetBotInfoRequestSchema, { botId });
        const callOpts = await this.callOptions(procedureFor(InterlinkService.method.getBotInfo.name), { schema: GetBotInfoRequestSchema, message }, options);
        return this.client.getBotInfo(message, callOpts);
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
