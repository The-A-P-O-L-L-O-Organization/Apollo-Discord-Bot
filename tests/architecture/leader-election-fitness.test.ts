import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FencingTokenManager } from '../../src/gateway/fencing.js';
import {
    defaultLeaderElectionConfig,
    startHeartbeat,
    stopHeartbeat,
    tryAcquireLock,
    type LeaderRedis
} from '../../src/gateway/leader.js';
import type { RedisClient } from '../../src/utils/redisCluster.js';

type ScriptOp = 'acquire' | 'release' | 'heartbeat';

function classifyScript(body: string): ScriptOp {
    if (body.includes('INCR')) {
        return 'acquire';
    }
    if (body.includes('DEL')) {
        return 'release';
    }
    return 'heartbeat';
}

class FakeRedis {
    private kv = new Map<string, string>();
    private scripts = new Map<string, ScriptOp>();
    public setCalls = 0;

    async incr(key: string): Promise<number> {
        const next = Number(this.kv.get(key) ?? '0') + 1;
        this.kv.set(key, String(next));
        return next;
    }

    async get(key: string): Promise<string | null> {
        return this.kv.get(key) ?? null;
    }

    async set(key: string, value: string, ...args: unknown[]): Promise<string | null> {
        this.setCalls += 1;
        if (args.includes('NX') && this.kv.has(key)) {
            return null;
        }
        if (args.includes('XX') && !this.kv.has(key)) {
            return null;
        }
        this.kv.set(key, value);
        return 'OK';
    }

    async del(key: string): Promise<number> {
        return this.kv.delete(key) ? 1 : 0;
    }

    async script(command: string, body: string): Promise<string> {
        if (command !== 'LOAD') {
            throw new Error(`unsupported script command ${command}`);
        }
        const sha = `fake-sha-${classifyScript(body)}`;
        this.scripts.set(sha, classifyScript(body));
        return sha;
    }

    async evalsha(sha: string, _numKeys: number, ...args: string[]): Promise<number> {
        const op = this.scripts.get(sha);
        if (!op) {
            throw new Error('NOSCRIPT no matching script');
        }
        return this.runOp(op, args);
    }

    async eval(body: string, _numKeys: number, ...args: string[]): Promise<number> {
        return this.runOp(classifyScript(body), args);
    }

    private runOp(op: ScriptOp, args: string[]): number {
        const counterKey = args[0] ?? '';
        const lockKey = args[1] ?? '';
        const podId = args[2] ?? '';
        if (op === 'acquire') {
            const token = Number(this.kv.get(counterKey) ?? '0') + 1;
            this.kv.set(counterKey, String(token));
            if (!this.kv.has(lockKey)) {
                this.kv.set(lockKey, podId);
                return token;
            }
            return 0;
        }
        if (op === 'release') {
            const token = args[3] ?? '';
            if (this.kv.get(lockKey) === podId && this.kv.get(counterKey) === token) {
                this.kv.delete(lockKey);
                return 1;
            }
            return 0;
        }
        if (this.kv.get(lockKey) === podId) {
            this.kv.set(lockKey, podId);
            return 1;
        }
        return 0;
    }

    async quit(): Promise<string> {
        return 'OK';
    }
}

const LOCK_KEY = 'apollo:gateway:leader:global';
const COUNTER_KEY = 'apollo:gateway:fencing:counter';

function createManager(redis: FakeRedis): FencingTokenManager {
    return new FencingTokenManager(redis as unknown as RedisClient, {
        lockKey: LOCK_KEY,
        ttlMs: 10000,
        counterKey: COUNTER_KEY
    });
}

describe('Leader election fitness functions', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        stopHeartbeat();
        vi.useRealTimers();
    });

    it('fencing token increases monotonically across leadership changes', async () => {
        const redis = new FakeRedis();
        const first = createManager(redis);
        const second = createManager(redis);
        await first.initialize();
        await second.initialize();

        const tokenRaw = await first.acquireLockWithFencingToken('pod-1');
        expect(tokenRaw).not.toBeNull();
        const tokenOne = tokenRaw as number;
        expect(tokenOne).toBeGreaterThan(0);

        expect(await first.releaseLock('pod-1', tokenOne)).toBe(true);

        const tokenTwoRaw = await second.acquireLockWithFencingToken('pod-2');
        expect(tokenTwoRaw).not.toBeNull();
        expect(tokenTwoRaw as number).toBeGreaterThan(tokenOne);

        expect(await first.releaseLock('pod-1', tokenOne)).toBe(false);
    });

    it('only one pod holds the lock at a time (no split-brain)', async () => {
        const redis = new FakeRedis();
        const manager = createManager(redis);
        await manager.initialize();

        const holder = await manager.acquireLockWithFencingToken('pod-1');
        expect(holder).not.toBeNull();
        expect(await manager.acquireLockWithFencingToken('pod-2')).toBeNull();
        expect(await redis.get(LOCK_KEY)).toBe('pod-1');

        const plain = redis as unknown as LeaderRedis;
        expect(await tryAcquireLock(plain, 'apollo:gateway:leader:probe', 'pod-1', 10000)).toBe(true);
        expect(await tryAcquireLock(plain, 'apollo:gateway:leader:probe', 'pod-2', 10000)).toBe(false);
    });

    it('failover completes within the 30s budgeted window', async () => {
        const config = defaultLeaderElectionConfig();
        expect(config.lockTtl).toBeLessThanOrEqual(10000);
        expect(config.lockTtl / 3).toBeLessThan(30000);
        expect(config.lockTtl + config.retryInterval).toBeLessThan(30000);

        const redis = new FakeRedis();
        const plain = redis as unknown as LeaderRedis;
        const key = 'apollo:gateway:leader:failover-probe';
        expect(await tryAcquireLock(plain, key, 'pod-1', 9000)).toBe(true);
        const stop = startHeartbeat(plain, key, 'pod-1', 9000);
        const callsBefore = redis.setCalls;
        await vi.advanceTimersByTimeAsync(3000);
        expect(redis.setCalls).toBeGreaterThan(callsBefore);
        stop();
    });
});
