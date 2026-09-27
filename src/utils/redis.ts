// Centralized Redis Connection Factory
// Provides createRedisClient factory for dependency injection
import { logger } from './logger.js';
import { createRedisClient as createRedisClientNew, createRedisClientFromEnv, type RedisClient } from './redisCluster.js';

/**
 * Creates a new Redis client instance (legacy API)
 * @param name - Connection name for logging (deprecated, kept for backward compatibility)
 * @param options - Redis connection options
 * @returns Redis client instance
 * @deprecated Use createRedisClient or createRedisClientFromEnv from redisCluster.ts instead
 */
export function createRedisClientLegacy(name: string, options: Record<string, unknown> = {}): RedisClient {
    logger.warn('[REDIS] createRedisClient(name, options) is deprecated. Use createRedisClient(config) or createRedisClientFromEnv() from redisCluster.ts');

    // Convert old-style options to new config format
    const url = options['url'] as string | undefined;
    const mode = options['mode'] as 'standalone' | 'sentinel' | 'cluster' | undefined;

    if (mode === 'cluster') {
        return createRedisClientNew({
            mode: 'cluster',
            urls: options['urls'] as string[] || [],
            options: options
        });
    }

    if (mode === 'sentinel') {
        return createRedisClientNew({
            mode: 'sentinel',
            sentinelUrls: options['sentinelUrls'] as string[] || [],
            sentinelName: options['sentinelName'] as string,
            options: options
        });
    }

    return createRedisClientNew({
        mode: 'standalone',
        url: url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        options: options
    });
}

/**
 * Closes a Redis connection
 * @param redis - Redis client instance
 */
export async function closeRedisClient(redis: RedisClient | undefined): Promise<void> {
    if (redis && (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'wait')) {
        await redis.quit();
    }
}

/**
 * Checks if a Redis connection is healthy
 * @param redis - Redis client instance
 * @returns Health status
 */
export async function checkRedisHealth(redis: RedisClient | undefined): Promise<boolean> {
    try {
        await redis?.ping();
        return true;
    } catch {
        return false;
    }
}

/**
 * Gets the connection state for a Redis client
 * @param redis - Redis client instance
 * @returns Connection state
 */
export function getConnectionState(redis: RedisClient | undefined): { status: string } {
    if (redis) {
        return { status: redis.status };
    }
    return { status: 'not_initialized' };
}

// Re-export the new factory functions
export { createRedisClientNew as createRedisClient, createRedisClientFromEnv, type RedisClient };

export default { createRedisClient: createRedisClientNew, closeRedisClient, checkRedisHealth, getConnectionState };