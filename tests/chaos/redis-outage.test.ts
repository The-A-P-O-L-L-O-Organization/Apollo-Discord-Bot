import { describe, it, expect } from 'vitest';
import { tryAcquireLock, releaseLock as releaseLeaderLock, GLOBAL_LEADER_LOCK_KEY } from '../../src/gateway/leader.js';
import { acquireLock, releaseLock } from '../../src/utils/lock.js';
import { EventBusImpl } from '../../src/core/EventBus.js';
import type { RedisClient } from '../../src/utils/redisCluster.js';

const CHAOS_ENABLED = process.env['CHAOS_TESTS'] === '1';

class FakeRedis {
    public available = true;
    private store = new Map<string, { value: string; expiresAt: number | null }>();

    private failIfDown(): void {
        if (!this.available) {
            throw new Error('ECONNREFUSED: simulated redis outage');
        }
    }

    private read(key: string): string | null {
        const entry = this.store.get(key);
        if (entry === undefined) {
            return null;
        }
        if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
        this.failIfDown();
        const upper = args.map((arg) => String(arg).toUpperCase());
        let ttl: number | null = null;
        const pxIndex = upper.indexOf('PX');
        if (pxIndex >= 0) {
            const raw = args[pxIndex + 1];
            if (typeof raw === 'number') {
                ttl = raw;
            }
        }
        const current = this.read(key);
        if (upper.includes('NX') && current !== null) {
            return null;
        }
        if (upper.includes('XX') && current === null) {
            return null;
        }
        this.store.set(key, { value, expiresAt: ttl === null ? null : Date.now() + ttl });
        return 'OK';
    }

    async get(key: string): Promise<string | null> {
        this.failIfDown();
        return this.read(key);
    }

    async eval(_script: string, numKeys: number, ...args: string[]): Promise<number> {
        this.failIfDown();
        const keys = args.slice(0, numKeys);
        const argv = args.slice(numKeys);
        const lockKey = keys[0] ?? '';
        const owner = argv[0] ?? '';
        if (this.read(lockKey) !== owner) {
            return 0;
        }
        this.store.delete(lockKey);
        return 1;
    }

    async quit(): Promise<'OK'> {
        return 'OK';
    }
}

interface BufferedJob {
    id: string;
    name: string;
}

class OutageAwareQueue {
    private buffer: BufferedJob[] = [];
    private seen = new Set<string>();
    public delivered: BufferedJob[] = [];

    constructor(private redis: FakeRedis) {}

    async add(job: BufferedJob): Promise<'queued' | 'buffered'> {
        if (!this.redis.available) {
            this.buffer.push(job);
            return 'buffered';
        }
        await this.redis.set(`job:${job.id}`, '1');
        this.deliver(job);
        return 'queued';
    }

    async recover(): Promise<number> {
        const pending = this.buffer.splice(0, this.buffer.length);
        let count = 0;
        for (const job of pending) {
            if (this.seen.has(job.id)) {
                continue;
            }
            this.deliver(job);
            count += 1;
        }
        return count;
    }

    private deliver(job: BufferedJob): void {
        if (this.seen.has(job.id)) {
            return;
        }
        this.seen.add(job.id);
        this.delivered.push(job);
    }
}

async function safeSchedulerTick(
    redis: FakeRedis,
    key: string,
    owner: string,
    fn: () => Promise<void>
): Promise<'executed' | 'skipped' | 'paused'> {
    const client = redis as unknown as RedisClient;
    try {
        const acquired = await acquireLock(client, key, owner, 5000);
        if (!acquired) {
            return 'skipped';
        }
        try {
            await fn();
            return 'executed';
        } finally {
            await releaseLock(client, key, owner);
        }
    } catch {
        return 'paused';
    }
}

class FakePub {
    public available = true;
    public messages: Array<{ channel: string; message: string }> = [];

    async publish(channel: string, message: string): Promise<number> {
        if (!this.available) {
            throw new Error('ECONNREFUSED: simulated redis outage');
        }
        this.messages.push({ channel, message });
        return 1;
    }
}

class FakeSub {
    public channels = new Set<string>();
    private listener: ((_channel: string, _message: string) => void) | null = null;

    async subscribe(channel: string): Promise<void> {
        this.channels.add(channel);
    }

    async unsubscribe(channel: string): Promise<void> {
        this.channels.delete(channel);
    }

    on(_event: 'message', listener: (_channel: string, _message: string) => void): void {
        this.listener = listener;
    }
}

describe.skipIf(!CHAOS_ENABLED)('chaos: redis outage', () => {
    it('pauses leader election during the outage and re-elects after recovery', async () => {
        const redis = new FakeRedis();
        const client = redis as unknown as RedisClient;

        const initial = await tryAcquireLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-a', 5000);
        expect(initial).toBe(true);

        redis.available = false;
        let electionDuringOutage: boolean | 'error' = 'error';
        try {
            electionDuringOutage = await tryAcquireLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-b', 5000);
        } catch {
            electionDuringOutage = 'error';
        }
        expect(electionDuringOutage).toBe('error');

        redis.available = true;
        expect(await redis.get(GLOBAL_LEADER_LOCK_KEY)).toBe('pod-a');

        await releaseLeaderLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-a');
        const reelect = await tryAcquireLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-b', 5000);
        expect(reelect).toBe(true);
        expect(await redis.get(GLOBAL_LEADER_LOCK_KEY)).toBe('pod-b');
    });

    it('buffers queue jobs during the outage and delivers exactly once on recovery', async () => {
        const redis = new FakeRedis();
        const queue = new OutageAwareQueue(redis);

        redis.available = false;
        expect(await queue.add({ id: 'job-a', name: 'process-command' })).toBe('buffered');
        expect(await queue.add({ id: 'job-a', name: 'process-command' })).toBe('buffered');
        expect(await queue.add({ id: 'job-b', name: 'process-command' })).toBe('buffered');
        expect(queue.delivered.length).toBe(0);

        redis.available = true;
        const recovered = await queue.recover();
        expect(recovered).toBe(2);
        expect(queue.delivered.map((job) => job.id)).toEqual(['job-a', 'job-b']);

        expect(await queue.add({ id: 'job-c', name: 'process-command' })).toBe('queued');
        expect(queue.delivered.map((job) => job.id)).toEqual(['job-a', 'job-b', 'job-c']);
    });

    it('pauses schedulers during the outage without duplicate execution on recovery', async () => {
        const redis = new FakeRedis();
        let executions = 0;
        const tick = (): Promise<'executed' | 'skipped' | 'paused'> => {
            return safeSchedulerTick(redis, 'scheduler:outage', 'pod-a', async () => {
                executions += 1;
            });
        };

        expect(await tick()).toBe('executed');
        expect(executions).toBe(1);

        redis.available = false;
        expect(await tick()).toBe('paused');
        expect(await tick()).toBe('paused');
        expect(executions).toBe(1);

        redis.available = true;
        expect(await tick()).toBe('executed');
        expect(executions).toBe(2);
    });

    it('keeps local EventBus delivery working while cross-pod publish fails, then recovers', async () => {
        const pub = new FakePub();
        const sub = new FakeSub();
        const bus = new EventBusImpl({});
        const received: unknown[] = [];
        bus.enableCrossPod(pub, sub, 'pod-chaos');
        bus.on('chaos.ping', async (message) => {
            received.push(message.payload);
        }, 'chaos-test');

        pub.available = false;
        await bus.emit('chaos.ping', { n: 1 });
        expect(received.length).toBe(1);
        const duringOutage = await bus.healthCheck();
        expect(duringOutage.publishedCount).toBe(0);
        expect(pub.messages.length).toBe(0);

        pub.available = true;
        await bus.emit('chaos.ping', { n: 2 });
        expect(received.length).toBe(2);
        const afterRecovery = await bus.healthCheck();
        expect(afterRecovery.publishedCount).toBe(1);
        expect(pub.messages.length).toBe(1);
        const first = pub.messages[0];
        expect(first?.channel).toBe('apollo:event:chaos.ping');
        expect(typeof first?.message).toBe('string');
    });
});
