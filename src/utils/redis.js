// Centralized Redis Connection Pool
// Single source of truth for all Redis connections in the application
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
 * Gets or creates a Redis connection by name
 * @param {string|Object} nameOrOptions - Either a connection name or options object
 * @param {Object} options - Redis connection options (if first argument is a name)
 * @returns {Redis} Redis client instance
 */
export function getRedis(nameOrOptions, options = {}) {
    let name = 'default';
    let opts;
    
    if (typeof nameOrOptions === 'string') {
        name = nameOrOptions;
        opts = options;
    } else {
        // Assume it's an options object
        opts = nameOrOptions;
    }
    
    const config = {
        ...DEFAULT_OPTIONS,
        ...opts
    };
    
    // Use a map to store instances by name
    if (!global._redisMap) {
        global._redisMap = new Map();
    }
    
    if (!global._redisMap.has(name)) {
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
        
        global._redisMap.set(name, redis);
    }
    
    return global._redisMap.get(name);
}

/**
 * Removes and quits a Redis connection by name
 * @param {string} name - Connection name to remove
 */
export async function removeRedis(name) {
    if (global._redisMap && global._redisMap.has(name)) {
        const redis = global._redisMap.get(name);
        // Only quit if not already closing/closed
        if (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'wait') {
            await redis.quit();
        }
        global._redisMap.delete(name);
    }
}

/**
 * Closes all Redis connections
 */
export async function closeAll() {
    if (global._redisMap) {
        for (const [, redis] of global._redisMap) {
            // Only quit if not already closing/closed
            if (redis.status === 'ready' || redis.status === 'connecting' || redis.status === 'wait') {
                await redis.quit();
            }
        }
        global._redisMap.clear();
    }
}

/**
 * Checks if Redis connections are healthy
 * @returns {Promise<Object>} Health status of each connection
 */
export async function checkRedisHealth() {
    const results = {};
    
    if (global._redisMap) {
        for (const [name, redis] of global._redisMap) {
            try {
                await redis.ping();
                results[name] = 'healthy';
            } catch {
                results[name] = 'unhealthy';
            }
        }
    } else {
        results.default = 'not_initialized';
    }
    
    return results;
}

/**
 * Gets the connection state for a given name
 * @param {string} name - Connection name
 * @returns {Object} Connection state
 */
export function getConnectionState(name) {
    if (global._redisMap && global._redisMap.has(name)) {
        const redis = global._redisMap.get(name);
        return { status: redis.status };
    }
    return { status: 'not_initialized' };
}

// Alias for healthCheck
export const healthCheck = checkRedisHealth;

export default { getRedis, removeRedis, closeAll, checkRedisHealth, healthCheck, getConnectionState };
