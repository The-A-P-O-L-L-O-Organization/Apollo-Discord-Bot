import { describe, it, expect, afterEach } from 'vitest';
import {
    tryAcquireLock,
    startHeartbeat,
    stopHeartbeat,
    GLOBAL_LEADER_LOCK_KEY,
    FENCING_COUNTER_KEY
} from '../../src/gateway/leader.js';
import { FencingTokenManager } from '../../src/gateway/fencing.js';
import type { RedisClient } from '../../src/utils/redisCluster.js';

const CHAOS_ENABLED = process.env['CHAOS_TESTS'] === '1';

function hashScript(text: string): string {
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        hash = (hash * 31 + code) | 0;
    }
    return `sha-${hash}`;
}

function parsePxTtl(args: Array<string | number>, upper: string[]): number | null {
    const pxIndex = upper.indexOf('PX');
    if (pxIndex < 0) {
        return null;
    }
    const raw = args[pxIndex + 1];
    if (typeof raw === 'number') {
        return raw;
    }
    if (typeof raw === 'string') {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class FakeRedis {
    private store = new Map<string, { value: string; expiresAt: number | null }>();
    private scripts = new Map<string, string>();
    public available = true;

    private failIfPartitioned(): void {
        if (!this.available) {
            throw new Error('ECONNREFUSED: simulated network partition');
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
        this.failIfPartitioned();
        const upper = args.map((arg) => String(arg).toUpperCase());
        const ttl = parsePxTtl(args, upper);
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
        this.failIfPartitioned();
        return this.read(key);
    }

    async del(...keys: string[]): Promise<number> {
        this.failIfPartitioned();
        let removed = 0;
        for (const key of keys) {
            if (this.read(key) !== null) {
                this.store.delete(key);
                removed += 1;
            }
        }
        return removed;
    }

    async incr(key: string): Promise<number> {
        this.failIfPartitioned();
        const current = this.read(key);
        const next = (current === null ? 0 : Number.parseInt(current, 10)) + 1;
        this.store.set(key, { value: String(next), expiresAt: null });
        return next;
    }

    async script(subcommand: string, text: string): Promise<string> {
        this.failIfPartitioned();
        if (subcommand.toUpperCase() !== 'LOAD') {
            throw new Error(`Unsupported SCRIPT subcommand: ${subcommand}`);
        }
        const sha = hashScript(text);
        this.scripts.set(sha, text);
        return sha;
    }

    async eval(scriptText: string, numKeys: number, ...args: string[]): Promise<number | null> {
        this.failIfPartitioned();
        return this.runScript(scriptText, args.slice(0, numKeys), args.slice(numKeys));
    }

    async evalsha(sha: string, numKeys: number, ...args: string[]): Promise<number | null> {
        this.failIfPartitioned();
        const scriptText = this.scripts.get(sha);
        if (scriptText === undefined) {
            throw new Error('NOSCRIPT No matching script. Please use EVAL.');
        }
        return this.runScript(scriptText, args.slice(0, numKeys), args.slice(numKeys));
    }

    async quit(): Promise<'OK'> {
        return 'OK';
    }

    forceExpire(key: string): void {
        this.store.delete(key);
    }

    private runScript(scriptText: string, keys: string[], argv: string[]): number | null {
        if (scriptText.includes('INCR')) {
            const counterKey = keys[0] ?? '';
            const lockKey = keys[1] ?? '';
            const podId = argv[0] ?? '';
            const ttl = Number.parseInt(argv[1] ?? '0', 10);
            const current = this.read(counterKey);
            const next = (current === null ? 0 : Number.parseInt(current, 10)) + 1;
            this.store.set(counterKey, { value: String(next), expiresAt: null });
            if (this.read(lockKey) !== null) {
                return 0;
            }
            this.store.set(lockKey, { value: podId, expiresAt: Date.now() + ttl });
            return next;
        }
        if (scriptText.includes('XX')) {
            const lockKey = keys[1] ?? '';
            const podId = argv[0] ?? '';
            const ttl = Number.parseInt(argv[2] ?? '0', 10);
            if (this.read(lockKey) !== podId) {
                return 0;
            }
            this.store.set(lockKey, { value: podId, expiresAt: Date.now() + ttl });
            return 1;
        }
        if (keys.length === 1) {
            const lockKey = keys[0] ?? '';
            const owner = argv[0] ?? '';
            if (this.read(lockKey) !== owner) {
                return 0;
            }
            this.store.delete(lockKey);
            return 1;
        }
        const counterKey = keys[0] ?? '';
        const lockKey = keys[1] ?? '';
        const podId = argv[0] ?? '';
        const token = Number.parseInt(argv[1] ?? 'NaN', 10);
        if (this.read(lockKey) !== podId) {
            return 0;
        }
        const currentToken = this.read(counterKey);
        if (currentToken === null || Number.parseInt(currentToken, 10) !== token) {
            return 0;
        }
        this.store.delete(lockKey);
        return 1;
    }
}

describe.skipIf(!CHAOS_ENABLED)('chaos: leader failover', () => {
    afterEach(() => {
        stopHeartbeat();
    });

    it('fails over to the follower after a network partition expires the lock', async () => {
        const redis = new FakeRedis();
        const client = redis as unknown as RedisClient;
        const ttlMs = 800;

        const leaderAcquired = await tryAcquireLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-leader', ttlMs);
        expect(leaderAcquired).toBe(true);
        const stopLeaderHeartbeat = startHeartbeat(client, GLOBAL_LEADER_LOCK_KEY, 'pod-leader', ttlMs);

        const followerBlocked = await tryAcquireLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-follower', ttlMs);
        expect(followerBlocked).toBe(false);
        expect(await redis.get(GLOBAL_LEADER_LOCK_KEY)).toBe('pod-leader');

        await sleep(ttlMs + 400);
        expect(await redis.get(GLOBAL_LEADER_LOCK_KEY)).toBe('pod-leader');

        redis.available = false;
        await sleep(500);
        redis.forceExpire(GLOBAL_LEADER_LOCK_KEY);
        redis.available = true;
        stopLeaderHeartbeat();

        const failover = await tryAcquireLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-follower', ttlMs);
        expect(failover).toBe(true);
        expect(await redis.get(GLOBAL_LEADER_LOCK_KEY)).toBe('pod-follower');

        const staleLeaderReacquire = await tryAcquireLock(client, GLOBAL_LEADER_LOCK_KEY, 'pod-leader', ttlMs);
        expect(staleLeaderReacquire).toBe(false);
        expect(await redis.get(GLOBAL_LEADER_LOCK_KEY)).toBe('pod-follower');
    });

    it('issues monotonic fencing tokens and rejects stale leader operations', async () => {
        const redis = new FakeRedis();
        const client = redis as unknown as RedisClient;
        const managerA = new FencingTokenManager(client, {
            lockKey: GLOBAL_LEADER_LOCK_KEY,
            ttlMs: 5000,
            counterKey: FENCING_COUNTER_KEY
        });
        const managerB = new FencingTokenManager(client, {
            lockKey: GLOBAL_LEADER_LOCK_KEY,
            ttlMs: 5000,
            counterKey: FENCING_COUNTER_KEY
        });
        await managerA.initialize();
        await managerB.initialize();

        const tokenA = await managerA.acquireLockWithFencingToken('pod-a');
        expect(typeof tokenA).toBe('number');
        const firstToken = typeof tokenA === 'number' ? tokenA : -1;
        expect(firstToken).toBeGreaterThan(0);

        const tokenBlocked = await managerB.acquireLockWithFencingToken('pod-b');
        expect(tokenBlocked).toBeNull();
        expect(await redis.get(FENCING_COUNTER_KEY)).toBe('2');

        redis.forceExpire(GLOBAL_LEADER_LOCK_KEY);

        const tokenB = await managerB.acquireLockWithFencingToken('pod-b');
        expect(typeof tokenB).toBe('number');
        const secondToken = typeof tokenB === 'number' ? tokenB : -1;
        expect(secondToken).toBeGreaterThan(firstToken);

        expect(await managerA.verifyFencingToken(firstToken)).toBe(false);
        expect(await managerB.verifyFencingToken(secondToken)).toBe(true);

        expect(await managerA.releaseLock('pod-a', firstToken)).toBe(false);
        expect(await redis.get(GLOBAL_LEADER_LOCK_KEY)).toBe('pod-b');
    });
});
