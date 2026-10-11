import type { RedisClient } from './redisCluster.js';

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

export interface EventDedupeOptions {
    ttlSeconds?: number;
    keyPrefix?: string;
}

export class EventDedupe {
    private redis: RedisClient;
    private ttlSeconds: number;
    private keyPrefix: string;
    private checkAndSetSha: string | null = null;
    private cleanupSha: string | null = null;
    private closed = false;

    constructor(redis: RedisClient, options: EventDedupeOptions = {}) {
        if (!redis) {
            throw new Error('EventDedupe requires a Redis client');
        }
        this.redis = redis;
        this.ttlSeconds = options.ttlSeconds ?? 600;
        this.keyPrefix = options.keyPrefix ?? 'event:dedupe:';
    }

    getDedupeKey(eventType: string, eventId: string): string {
        return `${this.keyPrefix}${eventType}:${eventId}`;
    }

    async initialize(): Promise<void> {
        this.checkAndSetSha = await this.redis.script('LOAD', CHECK_AND_SET_SCRIPT) as string;
        this.cleanupSha = await this.redis.script('LOAD', CLEANUP_SCRIPT) as string;
    }

    async checkAndSetEvent(eventType: string, eventId: string, timestamp?: number): Promise<boolean> {
        if (this.closed) {
            throw new Error('EventDedupe is closed');
        }

        const baseKey = this.getDedupeKey(eventType, eventId);
        const key = timestamp === undefined ? baseKey : `${baseKey}:${timestamp}`;
        const ttl = this.ttlSeconds.toString();

        try {
            let result: number;

            if (this.checkAndSetSha) {
                result = await this.redis.evalsha(this.checkAndSetSha, 1, key, ttl) as number;
            } else {
                result = await this.redis.eval(CHECK_AND_SET_SCRIPT, 1, key, ttl) as number;
            }

            return result === 1;
        } catch (error) {
            if (error instanceof Error && error.message.includes('NOSCRIPT')) {
                await this.initialize();
                return this.checkAndSetEvent(eventType, eventId, timestamp);
            }
            throw error;
        }
    }

    async cleanup(): Promise<number> {
        if (this.closed) {
            throw new Error('EventDedupe is closed');
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
        }
        if (sharedDedupe === this) {
            sharedDedupe = null;
        }
    }

    isClosed(): boolean {
        return this.closed;
    }
}

let sharedDedupe: EventDedupe | null = null;

export function resetSharedEventDedupe(): void {
    sharedDedupe = null;
}

export async function isDuplicateEvent(eventType: string, eventId: string): Promise<boolean> {
    try {
        if (!sharedDedupe || sharedDedupe.isClosed()) {
            sharedDedupe = null;
            const { getLockRedis } = await import('./lock.js');
            const redis = await getLockRedis();
            if (!redis) {
                return false;
            }
            const dedupe = new EventDedupe(redis, { ttlSeconds: 600 });
            try {
                await dedupe.initialize();
            } catch {
                sharedDedupe = null;
                return false;
            }
            sharedDedupe = dedupe;
        }
        const isNew = await sharedDedupe.checkAndSetEvent(eventType, eventId);
        return !isNew;
    } catch {
        return false;
    }
}

export default EventDedupe;
