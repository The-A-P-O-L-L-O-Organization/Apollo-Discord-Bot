// Redis-backed Distributed Nonce Store
// Uses atomic Lua script for SET NX EX operations

import type { RedisClient } from '../utils/redisCluster.js';

const CHECK_AND_SET_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local result = redis.call('SET', key, '1', 'NX', 'EX', ttl)
if result then
    return 1
else
    return 0
end
`;

const CLEANUP_SCRIPT = `
local pattern = KEYS[1]
local cursor = '0'
local total_deleted = 0
repeat
    local result = redis.call('SCAN', cursor, 'MATCH', pattern, 'COUNT', 1000)
    cursor = result[1]
    local keys = result[2]
    if #keys > 0 then
        local deleted = redis.call('DEL', unpack(keys))
        total_deleted = total_deleted + deleted
    end
until cursor == '0'
return total_deleted
`;

export interface NonceStoreOptions {
    ttlSeconds?: number;
    keyPrefix?: string;
}

export class NonceStore {
    private redis: RedisClient;
    private ttlSeconds: number;
    private keyPrefix: string;
    private checkAndSetSha: string | null = null;
    private cleanupSha: string | null = null;
    private closed = false;

    constructor(redis: RedisClient, options: NonceStoreOptions = {}) {
        this.redis = redis;
        this.ttlSeconds = options.ttlSeconds ?? 600; // Default 10 minutes
        this.keyPrefix = options.keyPrefix ?? 'nonce:';
    }

    private getKey(nonce: string, timestamp: number): string {
        return `${this.keyPrefix}${nonce}:${timestamp}`;
    }

    async initialize(): Promise<void> {
        // Load Lua scripts into Redis
        this.checkAndSetSha = await this.redis.script('LOAD', CHECK_AND_SET_SCRIPT) as string;
        this.cleanupSha = await this.redis.script('LOAD', CLEANUP_SCRIPT) as string;
    }

    async checkAndSet(nonce: string, timestamp: number): Promise<boolean> {
        if (this.closed) {
            throw new Error('NonceStore is closed');
        }

        const key = this.getKey(nonce, timestamp);
        const ttl = this.ttlSeconds.toString();

        try {
            let result: number;

            if (this.checkAndSetSha) {
                // Use EVALSHA for better performance
                result = await this.redis.evalsha(this.checkAndSetSha, 1, key, ttl) as number;
            } else {
                // Fallback to EVAL if script not loaded
                result = await this.redis.eval(CHECK_AND_SET_SCRIPT, 1, key, ttl) as number;
            }

            return result === 1;
        } catch (error) {
            // If NOSCRIPT error, reload and retry once
            if (error instanceof Error && error.message.includes('NOSCRIPT')) {
                await this.initialize();
                return this.checkAndSet(nonce, timestamp);
            }
            throw error;
        }
    }

    async cleanup(): Promise<number> {
        if (this.closed) {
            throw new Error('NonceStore is closed');
        }

        const pattern = `${this.keyPrefix}*`;

        try {
            let result: number;

            if (this.cleanupSha) {
                result = await this.redis.evalsha(this.cleanupSha, 1, pattern) as number;
            } else {
                result = await this.redis.eval(CLEANUP_SCRIPT, 1, pattern) as number;
            }

            return result;
        } catch (error) {
            if (error instanceof Error && error.message.includes('NOSCRIPT')) {
                await this.initialize();
                return this.cleanup();
            }
            throw error;
        }
    }

    async close(): Promise<void> {
        if (!this.closed) {
            this.closed = true;
            await this.redis.quit();
        }
    }

    isClosed(): boolean {
        return this.closed;
    }
}

export default NonceStore;