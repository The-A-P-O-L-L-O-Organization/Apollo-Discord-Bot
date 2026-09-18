// Threat score model for sustained spam detection
import { getLockRedis } from './lock.js';

const REDIS_PREFIX = 'apollo';
const POD_PREFIX = process.env['podId'] ? `:${process.env['podId']}` : '';

/**
 * Get Redis key for threat score
 * @param guildId
 * @param userId
 * @returns Redis key string
 */
function getThreatScoreKey(guildId: string, userId: string): string {
    return `${REDIS_PREFIX}:threat${POD_PREFIX}:${guildId}:${userId}`;
}

/**
 * Get Redis key for sustained spam detection
 * @param guildId
 * @param userId
 * @returns Redis key string
 */
function getSustainedSpamKey(guildId: string, userId: string): string {
    return `${REDIS_PREFIX}:spam_sustained${POD_PREFIX}:${guildId}:${userId}`;
}

/**
 * Severity mapping for violation types
 */
const SEVERITY_MAP: Record<string, number> = {
    low: 10,
    medium: 25,
    high: 50,
    critical: 100
};

/**
 * Update threat score for a user in a guild
 * @param guildId
 * @param userId
 * @param violationType - Type of violation (e.g., 'spam', 'link', 'invite')
 * @param severity - Severity level: low, medium, high, critical
 * @returns Total threat score in last 24h
 */
export async function updateThreatScore(
    guildId: string,
    userId: string,
    violationType: string,
    severity: string
): Promise<number> {
    const redis = await getLockRedis();
    if (!redis) { return 0; }
    const key = getThreatScoreKey(guildId, userId);
    const score = SEVERITY_MAP[severity] ?? 10; // default to low if invalid
    const now = Date.now();

    // Add entry with score as member, timestamp as score
    await redis.zadd(key, score, `${violationType}:${now}`);

    // Remove entries older than 24h
    await redis.zremrangebyscore(key, 0, now - 86400000);

    // Get total score (sum of severities in 24h window)
    // @ts-expect-error ioredis 6.x zrange WITHSCORES type mismatch
    const scores = await redis.zrange(key, 0, -1, 'WITHSCORES');
    let totalScore = 0;
    for (let i = 1; i < scores.length; i += 2) {
        totalScore += parseFloat(scores[i] ?? '0');
    }

    return totalScore;
}

/**
 * Get current threat score for a user in guild
 * @param guildId
 * @param userId
 * @returns Total threat score in last 24h
 */
export async function getThreatScore(guildId: string, userId: string): Promise<number> {
    const redis = await getLockRedis();
    if (!redis) { return 0; }
    const key = getThreatScoreKey(guildId, userId);

    // Remove old entries first
    const now = Date.now();
    await redis.zremrangebyscore(key, 0, now - 86400000);

    // Sum remaining scores
    // @ts-expect-error ioredis 6.x zrange WITHSCORES type mismatch
    const scores = await redis.zrange(key, 0, -1, 'WITHSCORES');
    let totalScore = 0;
    for (let i = 1; i < scores.length; i += 2) {
        totalScore += parseFloat(scores[i] ?? '0');
    }

    return totalScore;
}

/**
 * Get violation count for a user in guild within time window
 * @param guildId
 * @param userId
 * @param hours - Time window in hours (default 24)
 * @returns Count of violations
 */
export async function getViolationCount(
    guildId: string,
    userId: string,
    hours = 24
): Promise<number> {
    const redis = await getLockRedis();
    if (!redis) { return 0; }
    const key = getThreatScoreKey(guildId, userId);
    const now = Date.now();
    const cutoff = now - (hours * 3600 * 1000);

    // Remove old entries
    await redis.zremrangebyscore(key, 0, cutoff);

    // Get count
    return await redis.zcard(key);
}

/**
 * Decay threat score by removing old entries (call periodically)
 * @param guildId
 * @param userId
 * @returns Promise<void>
 */
export async function decayThreatScore(guildId: string, userId: string): Promise<void> {
    const redis = await getLockRedis();
    if (!redis) { return; }
    const key = getThreatScoreKey(guildId, userId);
    const now = Date.now();
    await redis.zremrangebyscore(key, 0, now - 86400000);
}

/**
 * Get recommended action based on threat score and violation count
 * @param score - Total threat score in 24h
 * @param violations - Number of violations in 24h
 * @returns Action object with action type and optional duration
 */
export function getRecommendedAction(
    score: number,
    violations: number
): { action: 'warn' | 'timeout' | 'quarantine' | 'ban' | 'none'; duration?: number } {
    if (score >= 100) {
        return { action: 'ban' };
    }

    if (score >= 80 || violations >= 5) {
        return { action: 'timeout', duration: 30 * 60 * 1000 }; // 30 minutes
    }

    if (score >= 60 || violations >= 2) {
        return { action: 'timeout', duration: 5 * 60 * 1000 }; // 5 minutes
    }

    if (score >= 40) {
        return { action: 'warn' };
    }

    return { action: 'none' };
}

/**
 * Check sustained spam using Redis ZSET
 * @param guildId
 * @param userId
 * @param threshold - Number of messages to trigger spam
 * @param intervalMs - Time window in milliseconds
 * @returns Spam check result
 */
export async function checkSustainedSpamRedis(
    guildId: string,
    userId: string,
    threshold: number,
    intervalMs: number
): Promise<{ isSpam: boolean; confidence: number; count: number }> {
    const redis = await getLockRedis();
    if (!redis) { return { isSpam: false, confidence: 0, count: 0 }; }
    const key = getSustainedSpamKey(guildId, userId);
    const now = Date.now();

    // Remove entries older than interval
    await redis.zremrangebyscore(key, 0, now - intervalMs);

    // Add current timestamp
    await redis.zadd(key, now, now.toString());

    // Set expiration to interval + 60 seconds to auto-cleanup
    await redis.expire(key, Math.ceil((intervalMs + 60000) / 1000));

    // Get count in window
    const count = await redis.zcard(key);

    return {
        isSpam: count >= threshold,
        confidence: Math.min(1.0, count / threshold),
        count
    };
}