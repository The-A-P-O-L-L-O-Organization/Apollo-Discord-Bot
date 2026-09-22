import { describe, it, expect, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
    InterlinkConnectClient,
    bodyHashOf,
    canonicalString,
    emptyBodyHash,
    extractBotId,
    generateNonce,
    getInterlinkClient,
    procedureFor,
    resetInterlinkClient,
    signRequest,
    type InterlinkServiceClient
} from '../../../src/plugins/interlink/connectClient.js';
import { Envelope, ListBotsRequest, RegisterBotRequest, SendResponse } from '../../../src/generated/interlink/interlink/v1/interlink_pb.js';

const AUTH_KEY = 'test-auth-key';
const BOT_ID = 'test-bot';

function createMockClient() {
    return {
        send: vi.fn(),
        subscribe: vi.fn(),
        connect: vi.fn(),
        registerBot: vi.fn(),
        heartbeat: vi.fn(),
        unregisterBot: vi.fn(),
        listBots: vi.fn(),
        getBotInfo: vi.fn()
    };
}

function createClient(mock?: ReturnType<typeof createMockClient>): { client: InterlinkConnectClient; mock: ReturnType<typeof createMockClient> } {
    const m = mock ?? createMockClient();
    return { client: new InterlinkConnectClient({ botId: BOT_ID, authKey: AUTH_KEY, client: m as unknown as InterlinkServiceClient }), mock: m };
}

function expectedAuth(procedure: string, timestamp: string, nonce: string, bodyHash: string): string {
    const canonical = [procedure, timestamp, nonce, bodyHash].join('\n');
    return `HMAC-SHA256 ${createHmac('sha256', AUTH_KEY).update(canonical, 'utf8').digest('base64')}`;
}

function firstCallArg<T>(mockFn: { mock: { calls: unknown[][] } }): T {
    const call = mockFn.mock.calls[0];
    if (!call) {
        throw new Error('expected mock to have been called');
    }
    return call[0] as T;
}

function callHeaders(mockFn: { mock: { calls: unknown[][] } }): Record<string, string> {
    const call = mockFn.mock.calls[0];
    if (!call) {
        throw new Error('expected mock to have been called');
    }
    return (call[1] as { headers: Record<string, string> }).headers;
}

function header(headers: Record<string, string>, name: string): string {
    const value = headers[name];
    if (value === undefined) {
        throw new Error(`expected header ${name} to be set`);
    }
    return value;
}

describe('Interlink ConnectRPC auth primitives', () => {
    it('builds the 4-part canonical string', () => {
        expect(canonicalString('proc', 'ts', 'nonce', 'hash')).toBe('proc\nts\nnonce\nhash');
    });

    it('computes EmptyBodyHash as sha256 of empty bytes', () => {
        expect(emptyBodyHash()).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('hashes an empty message as sha256 of {}', () => {
        const expected = createHash('sha256').update('{}', 'utf8').digest('hex');
        expect(bodyHashOf(new ListBotsRequest())).toBe(expected);
    });

    it('produces order-independent hashes for maps', () => {
        const first = new RegisterBotRequest({ botId: 'a', capabilities: { z: '1', a: '2', m: '3' } });
        const second = new RegisterBotRequest({ botId: 'a', capabilities: { m: '3', z: '1', a: '2' } });
        expect(bodyHashOf(first)).toBe(bodyHashOf(second));
    });

    it('matches node:crypto for signing', () => {
        const canonical = canonicalString('/interlink.v1.InterlinkService/Send', '123', 'abc', 'def');
        const expected = createHmac('sha256', AUTH_KEY).update(canonical, 'utf8').digest('base64');
        expect(signRequest(AUTH_KEY, '/interlink.v1.InterlinkService/Send', '123', 'abc', 'def')).toBe(expected);
    });

    it('generates unique 32-char hex nonces', () => {
        const nonces = new Set([generateNonce(), generateNonce(), generateNonce()]);
        expect(nonces.size).toBe(3);
        for (const nonce of nonces) {
            expect(nonce).toMatch(/^[0-9a-f]{32}$/);
        }
    });

    it('extracts bot identity from messages', () => {
        expect(extractBotId(new Envelope({ source: 'bot-a' }))).toBe('bot-a');
        expect(extractBotId(new RegisterBotRequest({ botId: 'bot-b' }))).toBe('bot-b');
        expect(extractBotId(new ListBotsRequest())).toBe('');
        expect(extractBotId(null)).toBe('');
    });

    it('builds full procedure names', () => {
        expect(procedureFor('Send')).toBe('/interlink.v1.InterlinkService/Send');
    });
});

describe('InterlinkConnectClient', () => {
    it('signs unary send with independently verifiable headers', async () => {
        const { client, mock } = createClient();
        mock.send.mockResolvedValue(new SendResponse({ accepted: true, messageId: 'm-1' }));
        const result = await client.send({ source: 'bot-x', type: 'ping', target: 'all', id: '1' });
        expect(result.accepted).toBe(true);
        const request = firstCallArg<Envelope>(mock.send);
        expect(request).toBeInstanceOf(Envelope);
        const headers = callHeaders(mock.send);
        const bodyHash = createHash('sha256').update(JSON.stringify(request.toJson()), 'utf8').digest('hex');
        expect(header(headers, 'Authorization')).toBe(expectedAuth('/interlink.v1.InterlinkService/Send', header(headers, 'X-Interlink-Timestamp'), header(headers, 'X-Interlink-Nonce'), bodyHash));
        expect(header(headers, 'X-Interlink-Timestamp')).toMatch(/^\d+$/);
        expect(header(headers, 'X-Interlink-Nonce')).toMatch(/^[0-9a-f]{32}$/);
        expect(header(headers, 'X-Interlink-Bot')).toBe('bot-x');
    });

    it('falls back to the client bot id for ListBots', async () => {
        const { client, mock } = createClient();
        mock.listBots.mockResolvedValue({ bots: [] });
        await client.listBots();
        const headers = callHeaders(mock.listBots);
        const bodyHash = createHash('sha256').update('{}', 'utf8').digest('hex');
        expect(header(headers, 'Authorization')).toBe(expectedAuth('/interlink.v1.InterlinkService/ListBots', header(headers, 'X-Interlink-Timestamp'), header(headers, 'X-Interlink-Nonce'), bodyHash));
        expect(header(headers, 'X-Interlink-Bot')).toBe(BOT_ID);
    });

    it('signs subscribe with the request body hash', async () => {
        const { client, mock } = createClient();
        async function* responses() {
            yield new Envelope({ source: 'bot-y' });
        }
        mock.subscribe.mockReturnValue(responses());
        const seen: Envelope[] = [];
        for await (const message of client.subscribe('bot-y', ['ping'])) {
            seen.push(message);
        }
        expect(seen).toHaveLength(1);
        const request = firstCallArg<{ botId: string; toJson(): unknown }>(mock.subscribe);
        expect(request.botId).toBe('bot-y');
        const headers = callHeaders(mock.subscribe);
        const bodyHash = createHash('sha256').update(JSON.stringify(request.toJson()), 'utf8').digest('hex');
        expect(header(headers, 'Authorization')).toBe(expectedAuth('/interlink.v1.InterlinkService/Subscribe', header(headers, 'X-Interlink-Timestamp'), header(headers, 'X-Interlink-Nonce'), bodyHash));
        expect(header(headers, 'X-Interlink-Bot')).toBe('bot-y');
    });

    it('signs connect with EmptyBodyHash and stamps stream envelopes', async () => {
        const { client, mock } = createClient();
        const stamped: Envelope[] = [];
        async function* responses(input: AsyncIterable<Envelope>) {
            for await (const envelope of input) {
                stamped.push(envelope);
                yield new Envelope({ source: 'remote' });
            }
        }
        mock.connect.mockImplementation(responses);
        async function* input() {
            yield new Envelope({ source: BOT_ID, type: 'ping' });
        }
        const seen: Envelope[] = [];
        for await (const message of client.connect(input())) {
            seen.push(message);
        }
        expect(seen).toHaveLength(1);
        const headers = callHeaders(mock.connect);
        expect(header(headers, 'Authorization')).toBe(expectedAuth('/interlink.v1.InterlinkService/Connect', header(headers, 'X-Interlink-Timestamp'), header(headers, 'X-Interlink-Nonce'), emptyBodyHash()));
        expect(stamped).toHaveLength(1);
        const outgoing = stamped[0] as Envelope;
        expect(outgoing.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(outgoing.timestamp !== BigInt(0)).toBe(true);
    });

    it('provides a resettable singleton', () => {
        resetInterlinkClient();
        const first = getInterlinkClient({ botId: BOT_ID, authKey: AUTH_KEY, client: createMockClient() as unknown as InterlinkServiceClient });
        expect(getInterlinkClient()).toBe(first);
        resetInterlinkClient();
        expect(getInterlinkClient({ botId: BOT_ID, authKey: AUTH_KEY, client: createMockClient() as unknown as InterlinkServiceClient })).not.toBe(first);
        resetInterlinkClient();
    });
});
