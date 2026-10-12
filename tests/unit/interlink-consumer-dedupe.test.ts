import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/config.js', () => ({
    config: {
        interlink: {
            jwtSecret: '',
            enabled: true,
            grpcAddress: 'http://localhost:50052',
            authKey: 'test-auth-key-min-32-chars-long!!',
            publicKey: '',
            discord: { clientId: 'test-bot' }
        },
        discord: { clientId: 'test-bot' }
    }
}));

vi.mock('../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn(),
    closeLockRedis: vi.fn(),
    withLock: vi.fn()
}));

import { getLockRedis } from '../../src/utils/lock.js';
import { NonceStore } from '../../src/queue/nonceStore.js';
import { EventBusImpl } from '../../src/core/EventBus.js';
import InterlinkPlugin, {
    buildConsumerNonce,
    CONSUMER_DEDUPE_TTL_SECONDS,
    CONSUMER_DEDUPE_KEY_PREFIX,
    CONSUMER_NONCE_TIMESTAMP
} from '../../src/plugins/interlink/plugin.js';

const mockGetLockRedis = vi.mocked(getLockRedis);

class FakeRedis {
    store = new Map<string, number>();
    evalCalls: unknown[][] = [];
    evalshaCalls: unknown[][] = [];

    async script(): Promise<string> {
        return 'fake-sha';
    }

    async eval(_script: string, _numKeys: number, key: string, ttl: string): Promise<number> {
        this.evalCalls.push([_script, _numKeys, key, ttl]);
        return this.setNxEx(key, ttl);
    }

    async evalsha(_sha: string, _numKeys: number, key: string, ttl: string): Promise<number> {
        this.evalshaCalls.push([_sha, _numKeys, key, ttl]);
        return this.setNxEx(key, ttl);
    }

    async quit(): Promise<void> {
        return undefined;
    }

    private setNxEx(key: string, ttlSeconds: string): number {
        const now = Date.now();
        const expiresAt = this.store.get(key);
        if (expiresAt !== undefined && now < expiresAt) {
            return 0;
        }
        this.store.set(key, now + Number(ttlSeconds) * 1000);
        return 1;
    }
}

interface TestEnvelope {
    protocol: string;
    version: string;
    type: string;
    source: string;
    target: string;
    id: string;
    timestamp: number;
    nonce: string;
    payload: unknown;
}

function makeEnvelope(overrides: Partial<TestEnvelope> = {}): TestEnvelope {
    return {
        protocol: 'apollo.interlink.v1',
        version: '1.0',
        type: 'event',
        source: 'bot-a',
        target: 'test-bot',
        id: 'msg-1',
        timestamp: Date.now(),
        nonce: 'nonce-abc-123',
        payload: { event: 'memberJoin', data: {} },
        ...overrides
    };
}

function makePlugin() {
    const bus = new EventBusImpl();
    const originalEmit = bus.emit.bind(bus);
    const emit = vi.fn((event: string, payload: unknown) => originalEmit(event, payload));
    bus.emit = emit as typeof bus.emit;
    const manager = { bus, registerSocketHandler: vi.fn() } as never;
    const plugin = new InterlinkPlugin({} as never, manager);
    return { plugin, emit };
}

async function makeStore(fake: FakeRedis, ttlSeconds = CONSUMER_DEDUPE_TTL_SECONDS): Promise<NonceStore> {
    const store = new NonceStore(fake as never, {
        ttlSeconds,
        keyPrefix: CONSUMER_DEDUPE_KEY_PREFIX
    });
    await store.initialize();
    return store;
}

describe('interlink consumer deduplication', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
        mockGetLockRedis.mockResolvedValue(null);
    });

    it('uses 24-hour TTL, apollo:interlink:consumer: prefix, and fixed timestamp', () => {
        expect(CONSUMER_DEDUPE_TTL_SECONDS).toBe(86400);
        expect(CONSUMER_DEDUPE_KEY_PREFIX).toBe('apollo:interlink:consumer:');
        expect(CONSUMER_NONCE_TIMESTAMP).toBe(0);
        expect(buildConsumerNonce('n1', 'event')).toBe('n1:event');
    });

    it('skips the second delivery of the same envelope nonce', async () => {
        const fake = new FakeRedis();
        const { plugin, emit } = makePlugin();
        plugin.setConsumerDedupeForTests(await makeStore(fake));

        const envelope = makeEnvelope();
        await plugin._handleIncomingEnvelope(envelope as never);
        await plugin._handleIncomingEnvelope(envelope as never);

        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('processes different event types with the same nonce independently', async () => {
        const fake = new FakeRedis();
        const { plugin, emit } = makePlugin();
        plugin.setConsumerDedupeForTests(await makeStore(fake));

        await plugin._handleIncomingEnvelope(makeEnvelope({ type: 'event', nonce: 'shared-nonce' }) as never);
        await plugin._handleIncomingEnvelope(makeEnvelope({ type: 'command', nonce: 'shared-nonce' }) as never);

        expect(emit).toHaveBeenCalledTimes(2);
    });

    it('allows re-processing after TTL expiration', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const fake = new FakeRedis();
        const { plugin, emit } = makePlugin();
        plugin.setConsumerDedupeForTests(await makeStore(fake, 2));

        await plugin._handleIncomingEnvelope(makeEnvelope() as never);
        await plugin._handleIncomingEnvelope(makeEnvelope() as never);
        expect(emit).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date('2026-01-01T00:00:03Z'));
        await plugin._handleIncomingEnvelope(makeEnvelope() as never);
        expect(emit).toHaveBeenCalledTimes(2);
    });

    it('writes Redis keys with apollo:interlink:consumer: prefix', async () => {
        const fake = new FakeRedis();
        const { plugin } = makePlugin();
        plugin.setConsumerDedupeForTests(await makeStore(fake));

        await plugin._handleIncomingEnvelope(makeEnvelope({ nonce: 'key-check', type: 'event' }) as never);

        const allKeys = [...fake.evalCalls, ...fake.evalshaCalls].map((c) => String(c[2]));
        expect(allKeys.some((k) => k === 'apollo:interlink:consumer:key-check:event:0')).toBe(true);
    });

    it('processes envelopes when Redis is unavailable (fail-open)', async () => {
        mockGetLockRedis.mockResolvedValue(null);
        const { plugin, emit } = makePlugin();

        await plugin._handleIncomingEnvelope(makeEnvelope() as never);
        await plugin._handleIncomingEnvelope(makeEnvelope() as never);

        expect(emit).toHaveBeenCalledTimes(2);
    });

    it('processes envelopes with a missing nonce without claiming deduplication', async () => {
        const fake = new FakeRedis();
        const { plugin, emit } = makePlugin();
        plugin.setConsumerDedupeForTests(await makeStore(fake));

        await plugin._handleIncomingEnvelope(makeEnvelope({ nonce: '' }) as never);
        await plugin._handleIncomingEnvelope(makeEnvelope({ nonce: '' }) as never);

        expect(emit).toHaveBeenCalledTimes(2);
        expect(fake.evalCalls.length + fake.evalshaCalls.length).toBe(0);
    });

    it('dedupes redelivered ping envelopes', async () => {
        const fake = new FakeRedis();
        const { plugin, emit } = makePlugin();
        plugin.setConsumerDedupeForTests(await makeStore(fake));

        await plugin._handleIncomingEnvelope(makeEnvelope({ type: 'ping', nonce: 'ping-nonce' }) as never);
        await plugin._handleIncomingEnvelope(makeEnvelope({ type: 'ping', nonce: 'ping-nonce' }) as never);

        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('initializes the dedupe store from lock Redis and clears it on disable', async () => {
        const fake = new FakeRedis();
        mockGetLockRedis.mockResolvedValue(fake as never);
        const { plugin } = makePlugin();

        const store = await plugin.initializeConsumerDedupe();
        expect(store).not.toBeNull();
        expect(plugin.getConsumerDedupe()).toBe(store);

        await plugin.closeConsumerDedupe();
        expect(plugin.getConsumerDedupe()).toBeNull();
    });
});
