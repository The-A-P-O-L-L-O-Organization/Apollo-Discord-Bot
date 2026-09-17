import type { Redis as RedisType } from 'ioredis';
import { createLogger } from '../utils/logger.js';
import type { LeaderElectionConfig } from '../types/gateway.js';

const logger = createLogger({ component: 'leader' });

export const LeaderElectionMode = {
    GLOBAL: 'global',
    PER_SHARD: 'per-shard',
    HYBRID: 'hybrid'
} as const;

export type LeaderElectionMode = typeof LeaderElectionMode[keyof typeof LeaderElectionMode];

export const GLOBAL_LEADER_LOCK_KEY = 'apollo:gateway:leader:global';

export function shardLockKey(shardId: number | string): string {
    return `apollo:gateway:leader:shard-${shardId}`;
}

export type LeaderRedis = RedisType;

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
