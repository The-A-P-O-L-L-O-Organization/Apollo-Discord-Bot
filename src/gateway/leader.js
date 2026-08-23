import { logger } from '../utils/logger.js';
 
export const LeaderElectionMode = {
    GLOBAL: 'global',
    PER_SHARD: 'per-shard',
    HYBRID: 'hybrid'
};

const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

let _lockTimer = null;

/**
 * Try to acquire a lock with the given key.
 * @param {Redis} redis - Redis client
 * @param {string} lockKey - The lock key to use
 * @param {string} podId - Identifier for the requester
 * @param {number} ttlMs - Lock TTL in milliseconds
 * @returns {Promise<boolean>} True if lock acquired
 */
export async function tryAcquireLock(redis, lockKey, podId, ttlMs = 10000) {
    const result = await redis.set(lockKey, podId, 'NX', 'PX', ttlMs);
    return result === 'OK';
}

/**
 * Release a lock using a Lua script to ensure we only delete our own lock.
 * @param {Redis} redis - Redis client
 * @param {string} lockKey - The lock key
 * @param {string} podId - The value we set
 */
export async function releaseLock(redis, lockKey, podId) {
    await redis.eval(RELEASE_SCRIPT, 1, lockKey, podId);
}

/**
 * Start sending heartbeats to maintain the lock.
 * @param {Redis} redis - Redis client
 * @param {string} lockKey - The lock key
 * @param {string} podId - Identifier for the requester
 * @param {number} ttlMs - Lock TTL in milliseconds
 * @returns {function} Callback to stop the heartbeat
 */
export async function startHeartbeat(redis, lockKey, podId, ttlMs = 10000) {
    const refresh = async() => {
        try {
            await redis.set(lockKey, podId, 'XX', 'PX', ttlMs);
        } catch (err) {
            logger.error('[Leader] Heartbeat failed:', err.message);
        }
    };
    _lockTimer = setInterval(refresh, ttlMs / 3);
    return () => clearInterval(_lockTimer);
}

export function stopHeartbeat() {
    if (_lockTimer) {
        clearInterval(_lockTimer);
        _lockTimer = null;
    }
}

/**
 * Acquire a global leader lock.
 * @param {Redis} redis - Redis client
 * @param {string} podId - Identifier for the requester
 * @param {number} ttlMs - Lock TTL in milliseconds
 * @returns {Promise<boolean>} True if lock acquired
 */
export async function acquireGlobalLock(redis, podId, ttlMs = 10000) {
    return tryAcquireLock(redis, 'apollo:gateway:leader:global', podId, ttlMs);
}

/**
 * Acquire a per-shard leader lock.
 * @param {Redis} redis - Redis client
 * @param {number|string} shardId - The shard identifier
 * @param {string} podId - Identifier for the requester
 * @param {number} ttlMs - Lock TTL in milliseconds
 * @returns {Promise<boolean>} True if lock acquired
 */
export async function acquireShardLock(redis, shardId, podId, ttlMs = 10000) {
    return tryAcquireLock(redis, `apollo:gateway:leader:shard-${shardId}`, podId, ttlMs);
}
