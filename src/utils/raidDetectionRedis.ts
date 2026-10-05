import { config } from '../config/config.js';
import { getLockRedis } from './lock.js';
import { DEFAULT_RAID_THRESHOLDS, type RaidCheckResult } from './raidDetectionTypes.js';
import { countSimilarNames } from './raidDetectionSimilarity.js';

// Redis key prefixes
export const RAID_KEY_PREFIX = 'apollo:raid:';
const RAID_MODE_KEY_PREFIX = 'apollo:raidmode:';

/**
 * Gets Redis client for raid detection
 * @returns Redis client or null if unavailable
 */
export interface RaidRedis {
    zadd: (key: string, score: number, value: string) => Promise<number>;
    expire: (key: string, seconds: number) => Promise<number>;
    zremrangebyscore: (key: string, min: number | string, max: number | string) => Promise<number>;
    zrange: (key: string, start: number, stop: number) => Promise<string[]>;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<'OK'>;
    del: (key: string) => Promise<number>;
}

export async function getRaidRedis(): Promise<RaidRedis | null> {
    if (!config.queue?.enabled) {return null;}
    return (await getLockRedis()) as unknown as RaidRedis;
}

/**
 * Tracks a join in Redis-backed raid detection
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param username - Username
 * @param timestamp - Join timestamp
 * @param accountAgeDays - Account age in days
 */
export async function trackJoinRedis(guildId: string, userId: string, username: string, timestamp: number, accountAgeDays: number): Promise<void> {
    const redis = await getRaidRedis();
    if (!redis) {return;}

    const key = `${RAID_KEY_PREFIX}${guildId}`;
    const memberData = JSON.stringify({ userId, username, timestamp, accountAgeDays });

    await redis.zadd(key, timestamp, memberData);
    await redis.expire(key, 300); // 5 minute TTL
}

/**
 * Checks for raid pattern using Redis
 * @param guildId - Guild ID
 * @param threshold - Join count threshold
 * @param intervalMs - Time window in ms
 * @param now - Current timestamp
 * @param thresholds - Raid thresholds
 * @returns Raid check result
 */
export async function checkRaidPatternRedis(guildId: string, threshold: number, intervalMs: number, now = Date.now(), thresholds = DEFAULT_RAID_THRESHOLDS): Promise<RaidCheckResult> {
    const redis = await getRaidRedis();
    if (!redis) {
        return { detected: false, recentJoins: 0, newAccounts: 0, similarNames: 0 };
    }

    const key = `${RAID_KEY_PREFIX}${guildId}`;
    const cutoff = now - intervalMs;

    await redis.zremrangebyscore(key, '-inf', cutoff);
    const members = await redis.zrange(key, 0, -1);

    const recentJoins = members.length;
    if (recentJoins < threshold) {
        return { detected: false, recentJoins, newAccounts: 0, similarNames: 0 };
    }

    // Parse member data
    const parsedMembers = members.map(m => {
        try { return JSON.parse(m); } catch { return null; }
    }).filter(Boolean) as {userId: string; username: string; timestamp: number; accountAge: number}[];

    // Count new accounts
    const newAccounts = parsedMembers.filter(m => m.accountAge < thresholds.newAccountAge).length;

    // Count similar names
    const usernames = parsedMembers.map(m => m.username);
    const similarNames = countSimilarNames(usernames);

    const detected = recentJoins >= threshold ||
                     (newAccounts >= 3 && recentJoins >= 4) ||
                     (similarNames >= 3 && recentJoins >= 3);

    return { detected, recentJoins, newAccounts, similarNames };
}

/**
 * Gets raid mode state from Redis
 * @param guildId - Guild ID
 * @returns Whether raid mode is enabled
 */
export async function isRaidModeEnabledRedis(guildId: string): Promise<boolean> {
    const redis = await getRaidRedis();
    if (!redis) {return false;}

    const key = `${RAID_MODE_KEY_PREFIX}${guildId}`;
    const value = await redis.get(key);
    return value === '1';
}

/**
 * Sets raid mode state in Redis
 * @param guildId - Guild ID
 * @param enabled - Whether raid mode is enabled
 */
export async function setRaidModeRedis(guildId: string, enabled: boolean): Promise<void> {
    const redis = await getRaidRedis();
    if (!redis) {return;}

    const key = `${RAID_MODE_KEY_PREFIX}${guildId}`;
    if (enabled) {
        await redis.set(key, '1');
    } else {
        await redis.del(key);
    }
}
