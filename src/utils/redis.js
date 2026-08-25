// Centralized Redis Connection Factory
// Provides createRedisClient factory for dependency injection
import { logger } from '../utils/logger.js';

import Redis from 'ioredis';

const DEFAULT_OPTIONS = {
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
 * @param {string} name - Connection name for logging
 * @param {Object} options - Redis connection options
 * @returns {Redis} Redis client instance
 */
export function createRedisClient(name, options = {}) {
    const config = {
        ...DEFAULT_OPTIONS,
        ...options
    };

    const redis = new Redis(config);

    redis.on('error', (err) => {
        logger.error(`[REDIS:${name}] Connection error:`, err.message);
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
 * @param {Redis} redis - Redis client instance
 */
export async function closeRedisClient(redis) {
    if (redis && (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'wait')) {
        await redis.quit();
    }
}

/**
 * Checks if a Redis connection is healthy
 * @param {Redis} redis - Redis client instance
 * @returns {Promise<boolean>} Health status
 */
export async function checkRedisHealth(redis) {
    try {
        await redis.ping();
        return true;
    } catch {
        return false;
    }
}

/**
 * Gets the connection state for a Redis client
 * @param {Redis} redis - Redis client instance
 * @returns {Object} Connection state
 */
export function getConnectionState(redis) {
    if (redis) {
        return { status: redis.status };
    }
    return { status: 'not_initialized' };
}

export default { createRedisClient, closeRedisClient, checkRedisHealth, getConnectionState };