// Distributed Locking Utility
// Redis-based distributed locks with automatic cleanup
import { config } from '../config/config.js';
import { createRedisClient, closeRedisClient } from './redis.js';
import type { Redis } from 'ioredis';

const LOCK_PREFIX = 'apollo:lock:';

let _lockRedis: Redis | null = null;

/**
 * Gets or creates the lock Redis connection.
 * Uses a module-level singleton because:
 * - Lock operations are centralized and low-frequency
 * - A single connection is sufficient for all lock operations
 * - Avoids connection overhead for distributed locking
 * - The lock connection is only used when QUEUE_ENABLED=true
 * 
 * Callers should use closeLockRedis() during shutdown to clean up.
 */
export async function getLockRedis(): Promise<Redis | null> {
    if (_lockRedis) {return _lockRedis;}
    if (!config.queue.enabled) {return null;}
    _lockRedis = createRedisClient('lock');
    await _lockRedis.connect();
    return _lockRedis;
}

/**
 * Closes the lock Redis connection.
 * Should be called during graceful shutdown.
 */
export async function closeLockRedis(): Promise<void> {
    if (_lockRedis) {
        await closeRedisClient(_lockRedis);
        _lockRedis = null;
    }
}

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

export async function acquireLock(redis: Redis, key: string, owner: string, ttlMs = 10000): Promise<boolean> {
    // @ts-expect-error ioredis v6 set overload issue with NX/PX options
    const result = await redis.set(`${LOCK_PREFIX}${key}`, owner, 'NX', 'PX', ttlMs);
    return result === 'OK';
}

export async function releaseLock(redis: Redis, key: string, owner: string): Promise<void> {
    await redis.eval(RELEASE_SCRIPT, 1, `${LOCK_PREFIX}${key}`, owner);
}

export async function withLock<T>(redis: Redis, key: string, owner: string, fn: () => Promise<T>, ttlMs = 10000): Promise<T | false> {
    const acquired = await acquireLock(redis, key, owner, ttlMs);
    if (!acquired) {return false;}
    try {
        return await fn();
    } finally {
        await releaseLock(redis, key, owner);
    }
}