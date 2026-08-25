// Distributed Rate Limiter
// Redis-backed sliding window rate limiter for cross-pod synchronization
import { logger } from '../../utils/logger.js';

import { config } from '../../config/config.js';
import { getLockRedis } from '../../utils/lock.js';
import { LRUCache } from '../../utils/lruCache.js';

const RATE_LIMIT_PREFIX = 'apollo:ratelimit:';

/**
 * Gets Redis client for rate limiting
 * @returns {Promise<Redis|null>} Redis client or null if unavailable
 */
async function getRateLimitRedis() {
    if (!config.queue.enabled) {return null;}
    return getLockRedis();
}

/**
 * Redis-backed sliding window rate limiter
 * Uses sorted sets for precise sliding window counting
 */
export class DistributedRateLimiter {
    /**
     * @param {Object} options
     * @param {number} options.limit - Maximum requests allowed in window
     * @param {number} options.windowMs - Time window in milliseconds
     * @param {string} options.prefix - Redis key prefix (optional)
     */
    constructor({ limit = 60, windowMs = 60000, prefix = RATE_LIMIT_PREFIX } = {}) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.prefix = prefix;
    }

    /**
     * Checks if a request is allowed under rate limit
     * @param {string} key - Rate limit key (e.g., 'bot:api', 'ip:192.168.1.1')
     * @returns {Promise<{allowed: boolean, retryAfter: number, remaining: number}>}
     */
    async check(key) {
        const redis = await getRateLimitRedis();
        if (!redis) {
            // Fallback: allow all requests if Redis unavailable
            return { allowed: true, retryAfter: 0, remaining: this.limit };
        }

        const fullKey = `${this.prefix}${key}`;
        const now = Date.now();
        const windowStart = now - this.windowMs;

        // Use a Lua script for atomic check-and-increment
        const script = `
            local key = KEYS[1]
            local now = tonumber(ARGV[1])
            local window_start = tonumber(ARGV[2])
            local limit = tonumber(ARGV[3])
            local window_ms = tonumber(ARGV[4])

            -- Remove expired entries
            redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

            -- Count current requests in window
            local count = redis.call('ZCARD', key)

            if count >= limit then
                -- Get oldest entry to calculate retry-after
                local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
                local retry_after = 0
                if #oldest > 0 then
                    retry_after = math.ceil((tonumber(oldest[2]) + window_ms - now) / 1000)
                end
                return {0, retry_after, 0}
            end

            -- Add current request
            local member = now .. ':' .. math.random(1000000)
            redis.call('ZADD', key, now, member)
            redis.call('PEXPIRE', key, window_ms)

            return {1, 0, limit - count - 1}
        `;

        try {
            const result = await redis.eval(script, 1, fullKey, now, windowStart, this.limit, this.windowMs);
            return {
                allowed: result[0] === 1,
                retryAfter: result[1],
                remaining: result[2]
            };
        } catch (err) {
            logger.error('[RATELIMIT] Redis error, allowing request:', err.message);
            // Fail open - allow request on Redis error
            return { allowed: true, retryAfter: 0, remaining: this.limit };
        }
    }

    /**
     * Resets rate limit for a key
     * @param {string} key - Rate limit key
     * @returns {Promise<void>}
     */
    async reset(key) {
        const redis = await getRateLimitRedis();
        if (!redis) {return;}
        
        const fullKey = `${this.prefix}${key}`;
        await redis.del(fullKey);
    }

    /**
     * Gets current rate limit status without incrementing
     * @param {string} key - Rate limit key
     * @returns {Promise<{count: number, remaining: number, resetAt: number}>}
     */
    async getStatus(key) {
        const redis = await getRateLimitRedis();
        if (!redis) {
            return { count: 0, remaining: this.limit, resetAt: Date.now() + this.windowMs };
        }

        const fullKey = `${this.prefix}${key}`;
        const now = Date.now();
        const windowStart = now - this.windowMs;

        await redis.zremrangebyscore(fullKey, '-inf', windowStart);
        const count = await redis.zcard(fullKey);
        
        // Get oldest entry for reset time
        const oldest = await redis.zrange(fullKey, 0, 0, 'WITHSCORES');
        let resetAt = now + this.windowMs;
        if (oldest.length > 0) {
            resetAt = parseInt(oldest[1], 10) + this.windowMs;
        }

        return {
            count,
            remaining: Math.max(0, this.limit - count),
            resetAt
        };
    }
}

/**
 * In-memory fallback rate limiter (for when Redis is unavailable)
 * Uses O(1) LRU cache for efficient eviction
 */
export class MemoryRateLimiter {
    constructor({ limit = 60, windowMs = 60000, maxKeys = 10000 } = {}) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.maxKeys = maxKeys;
        // Use O(1) LRU cache for buckets
        this.buckets = new LRUCache({ 
            maxSize: maxKeys,
            onEvict: (key, bucket) => {
                // Optional: log eviction for monitoring
            }
        });
    }

    check(key) {
        const now = Date.now();
        let bucket = this.buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + this.windowMs };
            this.buckets.set(key, bucket);
        }
        bucket.count += 1;
        
        return {
            allowed: bucket.count <= this.limit,
            retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
            remaining: Math.max(0, this.limit - bucket.count)
        };
    }

    reset(key) {
        this.buckets.delete(key);
    }

    getStatus(key) {
        const now = Date.now();
        const bucket = this.buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            return { count: 0, remaining: this.limit, resetAt: now + this.windowMs };
        }
        return {
            count: bucket.count,
            remaining: Math.max(0, this.limit - bucket.count),
            resetAt: bucket.resetAt
        };
    }
}

/**
 * Factory function to create appropriate rate limiter
 * Uses Redis-backed when available, falls back to in-memory
 * @param {Object} options - Rate limiter options
 * @returns {Promise<DistributedRateLimiter|MemoryRateLimiter>}
 */
export async function createRateLimiter(options = {}) {
    const redis = await getRateLimitRedis();
    if (redis) {
        return new DistributedRateLimiter(options);
    }
    logger.warn('[RATELIMIT] Redis unavailable, using in-memory fallback');
    return new MemoryRateLimiter(options);
}

// Backward compatibility: export MemoryRateLimiter as RateLimiter
export class RateLimiter extends MemoryRateLimiter {}

export default RateLimiter;