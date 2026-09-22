import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import { InterlinkConnectClient, generateNonce } from '../../src/plugins/interlink/connectClient.js';
import type { Envelope } from '../../src/generated/interlink/interlink/v1/interlink_pb.js';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const GO_MODULE_DIR = resolve(__dirname, '../../services/interlink');
const BINARY_PATH = join(tmpdir(), `interlink-testharness-${process.pid}`);
const AUTH_KEY = randomBytes(32).toString('hex');

let harness: ChildProcess | null = null;
let baseUrl = '';
let client: InterlinkConnectClient | null = null;
const botId = `integration-bot-${Date.now().toString(36)}`;

function testClient(): InterlinkConnectClient {
    if (!client) {
        throw new Error('Interlink client not initialized');
    }
    return client;
}

async function waitForReady(proc: ChildProcess, timeoutMs = 30000): Promise<string> {
    let output = '';
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) {
            throw new Error(`Test harness exited early with code ${proc.exitCode}: ${output}`);
        }
        const newlineIndex = output.indexOf('\n');
        if (newlineIndex !== -1) {
            const line = output.slice(0, newlineIndex).trim();
            if (line.startsWith('READY ')) {
                return line.slice('READY '.length);
            }
            output = output.slice(newlineIndex + 1);
        }
        const [chunk] = (await Promise.race([
            once(proc.stdout!, 'data').then((args) => args as [Buffer]),
            new Promise((resolve) => setTimeout(() => resolve([null]), 100))
        ])) as [Buffer | null];
        if (chunk) {
            output += chunk.toString();
        }
    }
    throw new Error(`Timed out waiting for test harness READY (got: ${output})`);
}

async function collectFirst(stream: AsyncIterable<Envelope>, timeoutMs = 10000): Promise<Envelope> {
    const iterator = stream[Symbol.asyncIterator]();
    try {
        const result = await Promise.race([
            iterator.next(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs))
        ]) as IteratorResult<Envelope>;
        if (result.done) {
            throw new Error('Stream closed before delivering a message');
        }
        return result.value;
    } finally {
        await iterator.return?.();
    }
}

describe('Interlink Go Service Integration', () => {
    beforeAll(async () => {
        await execFileAsync('go', ['build', '-o', BINARY_PATH, './testharness'], {
            cwd: GO_MODULE_DIR,
            env: { ...process.env, CGO_ENABLED: '0' }
        });
        harness = spawn(BINARY_PATH, [], {
            env: { ...process.env, INTERLINK_TEST_AUTH_KEY: AUTH_KEY },
            stdio: ['ignore', 'pipe', 'inherit']
        });
        baseUrl = await waitForReady(harness);
        client = new InterlinkConnectClient({ baseUrl, botId, authKey: AUTH_KEY });
    }, 120000);

    afterAll(async () => {
        if (harness) {
            harness.kill('SIGTERM');
            try {
                await Promise.race([
                    once(harness, 'exit'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Harness shutdown timeout')), 5000))
                ]);
            } catch {
                harness.kill('SIGKILL');
            }
            harness = null;
        }
        await rm(BINARY_PATH, { force: true });
    });

    it('registers, heartbeats, and reports bot info', async () => {
        const reg = await testClient().registerBot({
            botId,
            publicKey: 'test-public-key',
            endpoint: baseUrl,
            capabilities: { test: 'true' },
            maxConcurrentStreams: 10
        });
        expect(reg.success).toBe(true);
        expect(reg.botId).toBe(botId);

        const hb = await testClient().heartbeat({ botId, timestamp: BigInt(Date.now()) });
        expect(hb.alive).toBe(true);

        const info = await testClient().getBotInfo(botId);
        expect(info.botId).toBe(botId);
        expect(info.online).toBe(true);
    });

    it('lists bots including self', async () => {
        const response = await testClient().listBots();
        expect(response.bots.some((b) => b.botId === botId)).toBe(true);
    });

    it('sends and receives via subscribe', async () => {
        const messageId = `msg-${randomBytes(8).toString('hex')}`;
        const pending = collectFirst(testClient().subscribe(botId));
        await new Promise((resolve) => setTimeout(resolve, 500));

        const sendResponse = await testClient().send({
            protocol: 'apollo.interlink.v1',
            version: '1.0',
            type: 'message',
            source: botId,
            target: botId,
            id: messageId,
            timestamp: BigInt(Date.now()),
            nonce: generateNonce(),
            payload: new TextEncoder().encode('hello')
        });
        expect(sendResponse.accepted).toBe(true);
        expect(sendResponse.messageId).toBe(messageId);

        const received = await pending;
        expect(received.id).toBe(messageId);
        expect(Buffer.from(received.payload).toString('utf8')).toBe('hello');
    });

    it('round-trips a bidirectional stream', async () => {
        const bidiBot = `bidi-bot-${randomBytes(4).toString('hex')}`;
        const reg = await testClient().registerBot({
            botId: bidiBot,
            publicKey: 'test-public-key',
            endpoint: baseUrl,
            capabilities: { test: 'true' },
            maxConcurrentStreams: 10
        });
        expect(reg.success).toBe(true);

        const messageId = `bidi-${randomBytes(8).toString('hex')}`;
        async function* input() {
            yield {
                protocol: 'apollo.interlink.v1',
                version: '1.0',
                type: 'message',
                source: bidiBot,
                target: bidiBot,
                id: messageId,
                timestamp: BigInt(Date.now()),
                nonce: generateNonce(),
                payload: new TextEncoder().encode('bidi-hello')
            };
        }
        const received = await collectFirst(testClient().connect(input()));
        expect(received.id).toBe(messageId);
        expect(Buffer.from(received.payload).toString('utf8')).toBe('bidi-hello');

        const unreg = await testClient().unregisterBot(bidiBot);
        expect(unreg.success).toBe(true);
    });

    it('rejects requests signed with the wrong key', async () => {
        const badClient = new InterlinkConnectClient({ baseUrl, botId, authKey: 'wrong-key' });
        await expect(badClient.listBots()).rejects.toThrow(/unauthenticated/i);
    });

    it('unregisters and disappears from the listing', async () => {
        const response = await testClient().unregisterBot(botId);
        expect(response.success).toBe(true);

        const listing = await testClient().listBots();
        expect(listing.bots.some((b) => b.botId === botId)).toBe(false);
    });
});
