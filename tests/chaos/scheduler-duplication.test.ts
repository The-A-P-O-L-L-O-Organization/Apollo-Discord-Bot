import { describe, it, expect } from 'vitest';
import { acquireLock, withLock } from '../../src/utils/lock.js';
import type { RedisClient } from '../../src/utils/redisCluster.js';

const CHAOS_ENABLED = process.env['CHAOS_TESTS'] === '1';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class FakeRedis {
    private store = new Map<string, { value: string; expiresAt: number | null }>();

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
        return this.read(key);
    }

    async eval(_script: string, numKeys: number, ...args: string[]): Promise<number> {
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

    forceExpire(key: string): void {
        this.store.delete(key);
    }
}

describe.skipIf(!CHAOS_ENABLED)('chaos: scheduler duplication', () => {
    it('grants exactly one winner per tick when two pods race', async () => {
        const redis = new FakeRedis();
        const client = redis as unknown as RedisClient;
        let executions = 0;

        for (let round = 0; round < 4; round += 1) {
            const results = await Promise.all([
                withLock(client, 'scheduler:reminders', 'pod-a', async () => {
                    await sleep(20);
                    executions += 1;
                    return 'pod-a';
                }, 5000),
                withLock(client, 'scheduler:reminders', 'pod-b', async () => {
                    await sleep(20);
                    executions += 1;
                    return 'pod-b';
                }, 5000)
            ]);
            const winners = results.filter((result) => result !== false);
            expect(winners.length).toBe(1);
        }

        expect(executions).toBe(4);
    });

    it('hands the scheduled task to the survivor after a mid-execution crash', async () => {
        const redis = new FakeRedis();
        const client = redis as unknown as RedisClient;
        let executions = 0;

        const held = await acquireLock(client, 'scheduler:giveaway', 'pod-a', 5000);
        expect(held).toBe(true);

        const blocked = await withLock(client, 'scheduler:giveaway', 'pod-b', async () => {
            executions += 1;
            return 'pod-b';
        }, 5000);
        expect(blocked).toBe(false);
        expect(executions).toBe(0);

        redis.forceExpire('apollo:lock:scheduler:giveaway');

        const recovered = await withLock(client, 'scheduler:giveaway', 'pod-b', async () => {
            executions += 1;
            return 'pod-b';
        }, 5000);
        expect(recovered).toBe('pod-b');
        expect(executions).toBe(1);
    });
});
