import type { Redis as RedisType } from 'ioredis';
import type { Cluster as ClusterType } from 'ioredis';
import { createLogger } from '../utils/logger.js';
import type { LeaderElectionConfig } from '../types/gateway.js';
import { FencingTokenManager } from './fencing.js';

const logger = createLogger({ component: 'leader' });

export const LeaderElectionMode = {
    GLOBAL: 'global',
    PER_SHARD: 'per-shard',
    HYBRID: 'hybrid'
} as const;

export type LeaderElectionMode = typeof LeaderElectionMode[keyof typeof LeaderElectionMode];

export const GLOBAL_LEADER_LOCK_KEY = 'apollo:gateway:leader:global';
export const FENCING_COUNTER_KEY = 'apollo:gateway:fencing:counter';

export function shardLockKey(shardId: number | string): string {
    return `apollo:gateway:leader:shard-${shardId}`;
}

export function shardFencingCounterKey(shardId: number | string): string {
    return `apollo:gateway:fencing:counter:shard-${shardId}`;
}

export type LeaderRedis = RedisType | ClusterType;

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const DEFAULT_TTL_MS = 10000;

let _lockTimer: ReturnType<typeof setInterval> | null = null;

export function defaultLeaderElectionConfig(): LeaderElectionConfig {
    return {
        enabled: false,
        lockKey: GLOBAL_LEADER_LOCK_KEY,
        lockTtl: DEFAULT_TTL_MS,
        retryInterval: 5000,
        retryJitter: 0
    };
}

export async function tryAcquireLock(redis: LeaderRedis, lockKey: string, podId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    const result = await redis.set(lockKey, podId, 'PX', ttlMs, 'NX');
    return result === 'OK';
}

export async function releaseLock(redis: LeaderRedis, lockKey: string, podId: string): Promise<void> {
    await redis.eval(RELEASE_SCRIPT, 1, lockKey, podId);
}

export function startHeartbeat(redis: LeaderRedis, lockKey: string, podId: string, ttlMs: number = DEFAULT_TTL_MS): () => void {
    const refresh = async (): Promise<void> => {
        try {
            await redis.set(lockKey, podId, 'PX', ttlMs, 'XX');
        } catch (err) {
            logger.error({ err: err as Error }, '[Leader] Heartbeat failed');
        }
    };
    _lockTimer = setInterval(() => { void refresh(); }, ttlMs / 3);
    return () => {
        if (_lockTimer) {
            clearInterval(_lockTimer);
            _lockTimer = null;
        }
    };
}

export function stopHeartbeat(): void {
    if (_lockTimer) {
        clearInterval(_lockTimer);
        _lockTimer = null;
    }
}

export async function acquireGlobalLock(redis: LeaderRedis, podId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    return tryAcquireLock(redis, GLOBAL_LEADER_LOCK_KEY, podId, ttlMs);
}

export async function acquireShardLock(redis: LeaderRedis, shardId: number | string, podId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    return tryAcquireLock(redis, shardLockKey(shardId), podId, ttlMs);
}

// Fencing token-based leader election functions

export async function createFencingTokenManager(
    redis: LeaderRedis,
    lockKey: string = GLOBAL_LEADER_LOCK_KEY,
    ttlMs: number = DEFAULT_TTL_MS,
    counterKey: string = FENCING_COUNTER_KEY
): Promise<FencingTokenManager> {
    const manager = new FencingTokenManager(redis, { lockKey, ttlMs, counterKey });
    await manager.initialize();
    return manager;
}

export async function acquireGlobalLockWithFencing(redis: LeaderRedis, podId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<number | null> {
    const manager = await createFencingTokenManager(redis, GLOBAL_LEADER_LOCK_KEY, ttlMs, FENCING_COUNTER_KEY);
    const token = await manager.acquireLockWithFencingToken(podId);
    if (token === null) {
        await manager.close();
        return null;
    }
    // Store manager for later use (heartbeat, release)
    // Caller is responsible for managing the manager lifecycle
    return token;
}

export async function acquireShardLockWithFencing(redis: LeaderRedis, shardId: number | string, podId: string, ttlMs: number = DEFAULT_TTL_MS): Promise<number | null> {
    const manager = await createFencingTokenManager(redis, shardLockKey(shardId), ttlMs, shardFencingCounterKey(shardId));
    const token = await manager.acquireLockWithFencingToken(podId);
    if (token === null) {
        await manager.close();
        return null;
    }
    return token;
}
