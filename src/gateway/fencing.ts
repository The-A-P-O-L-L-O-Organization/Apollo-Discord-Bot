// Fencing Tokens for Gateway Leader Election
// Uses atomic Lua scripts for lock acquisition with monotonically increasing fencing tokens

import type { RedisClient } from '../utils/redisCluster.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'fencing' });

const ACQUIRE_LOCK_SCRIPT = `
local counterKey = KEYS[1]
local lockKey = KEYS[2]
local podId = ARGV[1]
local ttlMs = tonumber(ARGV[2])

-- Increment the fencing token counter
local token = redis.call('INCR', counterKey)

-- Try to acquire the lock with the new token
local result = redis.call('SET', lockKey, podId, 'PX', ttlMs, 'NX')

if result then
    -- Lock acquired, return the fencing token
    return token
else
    -- Lock not acquired, decrement counter (optional, but keeps counter accurate)
    -- Actually, we should NOT decrement - the token was consumed
    -- Return 0 to indicate failure
    return 0
end
`;

const RELEASE_LOCK_SCRIPT = `
local counterKey = KEYS[1]
local lockKey = KEYS[2]
local podId = ARGV[1]
local token = ARGV[2]

-- Get current lock holder
local currentHolder = redis.call('GET', lockKey)

if currentHolder == podId then
    -- Verify token matches current counter value
    local currentToken = redis.call('GET', counterKey)
    if currentToken and tonumber(currentToken) == tonumber(token) then
        -- Token matches, delete the lock
        local deleted = redis.call('DEL', lockKey)
        return deleted
    else
        -- Token doesn't match (stale token)
        return 0
    end
else
    -- Lock held by another pod or doesn't exist
    return 0
end
`;

const HEARTBEAT_SCRIPT = `
local counterKey = KEYS[1]
local lockKey = KEYS[2]
local podId = ARGV[1]
local token = ARGV[2]
local ttlMs = tonumber(ARGV[3])

-- Get current lock holder
local currentHolder = redis.call('GET', lockKey)

if currentHolder == podId then
    -- Renew the lock with XX (only if exists)
    local result = redis.call('SET', lockKey, podId, 'PX', ttlMs, 'XX')
    if result then
        return 1
    else
        -- Lock expired between GET and SET
        return 0
    end
else
    -- Lock held by another pod or doesn't exist
    return 0
end
`;

export interface FencingTokenOptions {
    lockKey: string;
    ttlMs: number;
    counterKey: string;
}

export class FencingTokenManager {
    private redis: RedisClient;
    private lockKey: string;
    private ttlMs: number;
    private counterKey: string;
    private acquireSha: string | null = null;
    private releaseSha: string | null = null;
    private heartbeatSha: string | null = null;
    private closed = false;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    constructor(redis: RedisClient, options: FencingTokenOptions) {
        this.redis = redis;
        this.lockKey = options.lockKey;
        this.ttlMs = options.ttlMs;
        this.counterKey = options.counterKey;
    }

    async initialize(): Promise<void> {
        this.acquireSha = await this.redis.script('LOAD', ACQUIRE_LOCK_SCRIPT) as string;
        this.releaseSha = await this.redis.script('LOAD', RELEASE_LOCK_SCRIPT) as string;
        this.heartbeatSha = await this.redis.script('LOAD', HEARTBEAT_SCRIPT) as string;
    }

    async acquireLockWithFencingToken(podId: string): Promise<number | null> {
        if (this.closed) {
            throw new Error('FencingTokenManager is closed');
        }

        try {
            let result: number;

            if (this.acquireSha) {
                result = await this.redis.evalsha(
                    this.acquireSha,
                    2,
                    this.counterKey,
                    this.lockKey,
                    podId,
                    this.ttlMs.toString()
                ) as number;
            } else {
                result = await this.redis.eval(
                    ACQUIRE_LOCK_SCRIPT,
                    2,
                    this.counterKey,
                    this.lockKey,
                    podId,
                    this.ttlMs.toString()
                ) as number;
            }

            return result === 0 ? null : result;
        } catch (error) {
            if (error instanceof Error && error.message.includes('NOSCRIPT')) {
                await this.initialize();
                return this.acquireLockWithFencingToken(podId);
            }
            throw error;
        }
    }

    async verifyFencingToken(token: number): Promise<boolean> {
        if (this.closed) {
            throw new Error('FencingTokenManager is closed');
        }

        try {
            const currentToken = await this.redis.get(this.counterKey);
            if (currentToken === null) {
                return false;
            }
            const current = parseInt(currentToken, 10);
            return token === current;
        } catch (error) {
            throw error;
        }
    }

    async releaseLock(podId: string, token: number): Promise<boolean> {
        if (this.closed) {
            throw new Error('FencingTokenManager is closed');
        }

        try {
            let result: number;

            if (this.releaseSha) {
                result = await this.redis.evalsha(
                    this.releaseSha,
                    2,
                    this.counterKey,
                    this.lockKey,
                    podId,
                    token.toString()
                ) as number;
            } else {
                result = await this.redis.eval(
                    RELEASE_LOCK_SCRIPT,
                    2,
                    this.counterKey,
                    this.lockKey,
                    podId,
                    token.toString()
                ) as number;
            }

            return result === 1;
        } catch (error) {
            if (error instanceof Error && error.message.includes('NOSCRIPT')) {
                await this.initialize();
                return this.releaseLock(podId, token);
            }
            throw error;
        }
    }

    async startHeartbeat(podId: string, token: number): Promise<() => void> {
        if (this.closed) {
            throw new Error('FencingTokenManager is closed');
        }

        const refresh = async (): Promise<void> => {
            try {
                let result: number;

                if (this.heartbeatSha) {
                    result = await this.redis.evalsha(
                        this.heartbeatSha,
                        2,
                        this.counterKey,
                        this.lockKey,
                        podId,
                        token.toString(),
                        this.ttlMs.toString()
                    ) as number;
                } else {
                    result = await this.redis.eval(
                        HEARTBEAT_SCRIPT,
                        2,
                        this.counterKey,
                        this.lockKey,
                        podId,
                        token.toString(),
                        this.ttlMs.toString()
                    ) as number;
                }

                if (result === 0) {
                    // Lock lost - could emit event or throw
                    // For now, we just stop the heartbeat
                    this.stopHeartbeat();
                }
            } catch (err) {
                // Log error but don't crash - heartbeat will retry
                logger.error({ err: err as Error }, '[Fencing] Heartbeat failed');
            }
        };

        this.heartbeatTimer = setInterval(() => { void refresh(); }, this.ttlMs / 3);
        
        // Initial heartbeat
        await refresh();

        return () => {
            this.stopHeartbeat();
        };
    }

    stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    async close(): Promise<void> {
        if (!this.closed) {
            this.closed = true;
            this.stopHeartbeat();
            await this.redis.quit();
        }
    }

    isClosed(): boolean {
        return this.closed;
    }
}

export default FencingTokenManager;