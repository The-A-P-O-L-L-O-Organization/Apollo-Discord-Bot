import { randomBytes } from 'node:crypto';import { createClient, type CallOptions, type Client } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Message, type AnyMessage, type FieldList, type PartialMessage } from '@bufbuild/protobuf';
import { InterlinkService } from '../../generated/interlink/interlink/v1/interlink_connect.js';
import {
    Envelope,
    GetBotInfoRequest,
    HeartbeatRequest,
    ListBotsRequest,
    RegisterBotRequest,
    SubscribeRequest,
    UnregisterBotRequest,
    type BotInfo,
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

export function emptyBodyHash(): string {
    return bytesToHex(sha256(new Uint8Array(0)));
}

export function bodyHashOf(message: AnyMessage): string {
    const normalized = message.clone();
    sortMapFields(normalized);
    return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(normalized.toJson()))));
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
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Message) && !(value instanceof Uint8Array);
}

function sortMapFields(message: AnyMessage): void {
    const record = message as unknown as Record<string, unknown>;
    const fields = (message.constructor as unknown as { fields: FieldList }).fields.list();
    for (const field of fields) {
        const value = record[field.localName];
        if (field.kind === 'map' && isMapRecord(value)) {
            const sorted: Record<string, unknown> = {};
            for (const key of Object.keys(value).sort()) {
                const entry = value[key];
                sorted[key] = entry;
                if (entry instanceof Message) {
                    sortMapFields(entry);
                }
            }
            record[field.localName] = sorted;
        } else if (value instanceof Message) {
            sortMapFields(value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                if (item instanceof Message) {
                    sortMapFields(item);
                }
            }
        }
    }
}

async function* withStreamIdentity(input: AsyncIterable<PartialMessage<Envelope>>): AsyncGenerator<Envelope> {
    for await (const partial of input) {
        const envelope = partial instanceof Envelope ? partial : new Envelope(partial);
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

    private headersFor(procedure: string, message: AnyMessage | null): Record<string, string> {
        const timestamp = Date.now().toString();
        const nonce = generateNonce();
        const bodyHash = message === null ? emptyBodyHash() : bodyHashOf(message);
        return {
            Authorization: `${INTERLINK_AUTH_SCHEME} ${signRequest(this.authKey, procedure, timestamp, nonce, bodyHash)}`,
            [INTERLINK_TIMESTAMP_HEADER]: timestamp,
            [INTERLINK_NONCE_HEADER]: nonce,
            [INTERLINK_BOT_HEADER]: extractBotId(message) || this.botId
        };
    }

    private callOptions(procedure: string, message: AnyMessage | null, options?: CallOptions): CallOptions {
        return { ...options, headers: this.headersFor(procedure, message) };
    }

    async send(envelope: PartialMessage<Envelope>, options?: CallOptions): Promise<SendResponse> {
        const message = new Envelope(envelope);
        return this.client.send(message, this.callOptions(procedureFor(InterlinkService.methods.send.name), message, options));
    }

    subscribe(botId: string, messageTypes: string[] = [], options?: CallOptions): AsyncIterable<Envelope> {
        const message = new SubscribeRequest({ botId, messageTypes });
        return this.client.subscribe(message, this.callOptions(procedureFor(InterlinkService.methods.subscribe.name), message, options));
    }

    connect(input: AsyncIterable<PartialMessage<Envelope>>, options?: CallOptions): AsyncIterable<Envelope> {
        return this.client.connect(withStreamIdentity(input), this.callOptions(procedureFor(InterlinkService.methods.connect.name), null, options));
    }

    async registerBot(request: PartialMessage<RegisterBotRequest>, options?: CallOptions): Promise<RegisterBotResponse> {
        const message = new RegisterBotRequest(request);
        return this.client.registerBot(message, this.callOptions(procedureFor(InterlinkService.methods.registerBot.name), message, options));
    }

    async heartbeat(request: PartialMessage<HeartbeatRequest>, options?: CallOptions): Promise<HeartbeatResponse> {
        const message = new HeartbeatRequest(request);
        return this.client.heartbeat(message, this.callOptions(procedureFor(InterlinkService.methods.heartbeat.name), message, options));
    }

    async unregisterBot(botId: string, options?: CallOptions): Promise<UnregisterBotResponse> {
        const message = new UnregisterBotRequest({ botId });
        return this.client.unregisterBot(message, this.callOptions(procedureFor(InterlinkService.methods.unregisterBot.name), message, options));
    }

    async listBots(options?: CallOptions): Promise<ListBotsResponse> {
        const message = new ListBotsRequest();
        return this.client.listBots(message, this.callOptions(procedureFor(InterlinkService.methods.listBots.name), message, options));
    }

    async getBotInfo(botId: string, options?: CallOptions): Promise<BotInfo> {
        const message = new GetBotInfoRequest({ botId });
        return this.client.getBotInfo(message, this.callOptions(procedureFor(InterlinkService.methods.getBotInfo.name), message, options));
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
