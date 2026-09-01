// Threat score model for sustained spam detection
import { getLockRedis } from './redis.js';

const REDIS_PREFIX = 'apollo';
const POD_PREFIX = process.env.podId ? `:${process.env.podId}` : '';

/**
 * Get Redis key for threat score
 * @param {string} guildId
 * @param {string} userId
 * @returns {string}
 */
function getThreatScoreKey(guildId, userId) {
    return `${REDIS_PREFIX}:threat${POD_PREFIX}:${guildId}:${userId}`;
}

/**
 * Get Redis key for sustained spam detection
 * @param {string} guildId
 * @param {string} userId
 * @returns {string}
 */
function getSustainedSpamKey(guildId, userId) {
    return `${REDIS_PREFIX}:spam_sustained${POD_PREFIX}:${guildId}:${userId}`;
}

/**
 * Severity mapping for violation types
 */
const SEVERITY_MAP = {
    low: 10,
    medium: 25,
    high: 50,
    critical: 100
};

/**
 * Update threat score for a user in a guild
 * @param {string} guildId
 * @param {string} userId
 * @param {string} violationType - Type of violation (e.g., 'spam', 'link', 'invite')
 * @param {string} severity - Severity level: low, medium, high, critical
 * @returns {Promise<number>} Total threat score in last 24h
 */
export async function updateThreatScore(guildId, userId, violationType, severity) {
    const redis = getLockRedis();
    const key = getThreatScoreKey(guildId, userId);
    const score = SEVERITY_MAP[severity] || 10; // default to low if invalid
    const now = Date.now();

    // Add entry with score as member, timestamp as score
    await redis.zAdd(key, { score, value: `${violationType}:${now}` });

    // Remove entries older than 24h
    await redis.zRemRangeByScore(key, 0, now - 86400000);

    // Get total score (sum of severities in 24h window)
    // After zRemRangeByScore, all remaining are within 24h
    const scores = await redis.zRange(key, 0, -1, 'WITHSCORES');
    let totalScore = 0;
    for (let i = 1; i < scores.length; i += 2) {
        totalScore += parseFloat(scores[i]);
    }

    return totalScore;
}

/**
 * Get current threat score for a user in guild
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<number>} Total threat score in last 24h
 */
export async function getThreatScore(guildId, userId) {
    const redis = getLockRedis();
    const key = getThreatScoreKey(guildId, userId);

    // Remove old entries first
    const now = Date.now();
    await redis.zRemRangeByScore(key, 0, now - 86400000);

    // Sum remaining scores
    const scores = await redis.zRange(key, 0, -1, 'WITHSCORES');
    let totalScore = 0;
    for (let i = 1; i < scores.length; i += 2) {
        totalScore += parseFloat(scores[i]);
    }

    return totalScore;
}

/**
 * Get violation count for a user in guild within time window
 * @param {string} guildId
 * @param {string} userId
 * @param {number} hours - Time window in hours (default 24)
 * @returns {Promise<number>} Count of violations
 */
export async function getViolationCount(guildId, userId, hours = 24) {
    const redis = getLockRedis();
    const key = getThreatScoreKey(guildId, userId);
    const now = Date.now();
    const cutoff = now - (hours * 3600 * 1000);

    // Remove old entries
    await redis.zRemRangeByScore(key, 0, cutoff);

    // Get count
    return await redis.zCard(key);
}

/**
 * Decay threat score by removing old entries (call periodically)
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function decayThreatScore(guildId, userId) {
    const redis = getLockRedis();
    const key = getThreatScoreKey(guildId, userId);
    const now = Date.now();
    await redis.zRemRangeByScore(key, 0, now - 86400000);
}

/**
 * Get recommended action based on threat score and violation count
 * @param {number} score - Total threat score in 24h
 * @param {number} violations - Number of violations in 24h
 * @returns {{action: 'warn'|'timeout'|'quarantine'|'ban', duration?: number}}
 */
export function getRecommendedAction(score, violations) {
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
 * @param {string} guildId
 * @param {string} userId
 * @param {number} threshold - Number of messages to trigger spam
 * @param {number} intervalMs - Time window in milliseconds
 * @returns {{isSpam: boolean, confidence: number, count: number}}
 */
export async function checkSustainedSpamRedis(guildId, userId, threshold, intervalMs) {
    const redis = getLockRedis();
    const key = getSustainedSpamKey(guildId, userId);
    const now = Date.now();

    // Remove entries older than interval
    await redis.zRemRangeByScore(key, 0, now - intervalMs);

    // Add current timestamp
    await redis.zAdd(key, { score: now, value: now.toString() });

    // Set expiration to interval + 60 seconds to auto-cleanup
    await redis.expire(key, Math.ceil((intervalMs + 60000) / 1000));

    // Get count in window
    const count = await redis.zCard(key);

    return {
        isSpam: count >= threshold,
        confidence: Math.min(1.0, count / threshold),
        count
    };
}