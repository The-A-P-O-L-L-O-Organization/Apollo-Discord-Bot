// Centralized Redis Connection Factory
// Provides createRedisClient factory for dependency injection
import { logger } from './logger.js';

import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';

const _Redis = Redis as unknown as new (options?: RedisClientOptions) => RedisType;

interface RedisClientOptions {
    maxRetriesPerRequest?: number | null;
    retryStrategy?: (times: number) => number | null;
    enableReadyCheck?: boolean;
    lazyConnect?: boolean;
    host?: string;
    port?: number;
    password?: string;
    username?: string;
    family?: number;
    db?: number;
}

const DEFAULT_OPTIONS: RedisClientOptions = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
        if (times > 3) {
            return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
    },
    enableReadyCheck: true,
    lazyConnect: true
};

/**
 * Creates a new Redis client instance
 * @param name - Connection name for logging
 * @param options - Redis connection options
 * @returns Redis client instance
 */
export function createRedisClient(name: string, options: RedisClientOptions = {}): RedisType {
    const config = {
        ...DEFAULT_OPTIONS,
        ...options
    } as RedisClientOptions;

    // @ts-expect-error ioredis v6 module export issue
    const redis = new Redis(config);

    redis.on('error', (err: Error) => {
        logger.error({ err, msg: `[REDIS:${name}] Connection error` });
    });

    redis.on('connect', () => {
        logger.info(`[REDIS:${name}] Connected`);
    });

    redis.on('ready', () => {
        logger.info(`[REDIS:${name}] Ready`);
    });

    redis.on('close', () => {
        logger.info(`[REDIS:${name}] Connection closed`);
    });

    return redis;
}

/**
 * Closes a Redis connection
 * @param redis - Redis client instance
 */
export async function closeRedisClient(redis: RedisType | undefined): Promise<void> {
    if (redis && (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'wait')) {
        await redis.quit();
    }
}

/**
 * Checks if a Redis connection is healthy
 * @param redis - Redis client instance
 * @returns Health status
 */
export async function checkRedisHealth(redis: RedisType | undefined): Promise<boolean> {
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
export function getConnectionState(redis: RedisType | undefined): { status: string } {
    if (redis) {
        return { status: redis.status };
    }
    return { status: 'not_initialized' };
}

export default { createRedisClient, closeRedisClient, checkRedisHealth, getConnectionState };