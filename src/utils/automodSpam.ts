import { logger } from './logger.js';
import { getLockRedis } from './lock.js';
import { TwoLevelLRUCache } from './lruCache.js';
import { simhash, isSimilar } from './simhash.js';
import { config } from '../config/config.js';
import type { Message } from 'discord.js';
import type { Redis } from 'ioredis';
import type { ChannelOverride } from './automodConfig.js';

// In-memory spam tracking (fallback when Redis unavailable)
// Uses O(1) LRU cache for efficient eviction
const spamTracker = new TwoLevelLRUCache({
    maxGuilds: 1000,
    maxUsersPerGuild: 500,
    maxTotalUsers: 50000,
    onEvict: (_guildId: string, _userId: string) => {
        // Optional: log eviction for monitoring
    }
});

// Burst spam tracking: tracks similar messages in time windows
// Key: `${guildId}:${userId}:${channelId}` -> {count: number, windowStart: number, hashes: bigint[]}
interface BurstTrackerEntry {
    hashes: bigint[];
    windowStart: number;
}

const burstTracker = new Map<string, BurstTrackerEntry>();

// Burst detection config
const BURST_THRESHOLD = 6;
const BURST_INTERVAL = 3000;
const SIMILARITY_THRESHOLD = 8;

interface BurstSpamResult {
    isSpam: boolean;
    confidence: number;
    count: number;
    reason?: string;
}

/**
 * Checks for burst spam using in-memory tracking with SimHash similarity
 * @param {Message} message - The Discord message
 * @param {number} threshold - Max similar messages in interval (default: 6)
 * @param {number} intervalMs - Time interval in ms (default: 3000)
 * @param {Record<string, ChannelOverride>} channelOverrides - Optional per-channel overrides {threshold, interval}
 * @returns {Promise<BurstSpamResult>}
 */
export function checkBurstSpam(
    message: Message,
    threshold = BURST_THRESHOLD,
    intervalMs = BURST_INTERVAL,
    channelOverrides: Record<string, ChannelOverride> = {}
): Promise<BurstSpamResult> {
    if (!message.guild) {
        return Promise.resolve({ isSpam: false, confidence: 0, count: 0, reason: 'DM channel' });
    }
    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;
    const key = `${guildId}:${userId}:${channelId}`;
    const now = Date.now();

    // Apply per-channel overrides
    const override = channelOverrides[channelId];
    if (override) {
        threshold = override.threshold ?? threshold;
        intervalMs = override.interval ?? intervalMs;
    }

    // Get or create tracker (per channel)
    let tracker = burstTracker.get(key);
    if (!tracker) {
        tracker = { hashes: [], windowStart: now };
        burstTracker.set(key, tracker);
    }

    // Compute SimHash for this message
    const hash = simhash(message.content);

    // Update window start if needed
    if (now - tracker.windowStart >= intervalMs) {
        tracker.windowStart = now;
        tracker.hashes = [];
    }

    // Count similar messages in window
    let similarCount = 0;
    for (const existingHash of tracker.hashes) {
        if (isSimilar(hash, existingHash, SIMILARITY_THRESHOLD)) {
            similarCount++;
        }
    }

    // Add current hash (keep max 20)
    tracker.hashes.push(hash);
    if (tracker.hashes.length > 20) {
        tracker.hashes.shift();
    }

    const count = similarCount + 1; // +1 for current message

    return Promise.resolve({
        isSpam: count >= threshold,
        confidence: Math.min(1.0, count / threshold),
        count
    });
}

/**
 * Cleanup burst tracker - remove stale entries
 * @param {number} maxAgeMs - Maximum age in ms before forced cleanup (default: 1 hour)
 */
export function cleanupBurstTracker(maxAgeMs = 3600000): void {
    const now = Date.now();
    for (const [key, tracker] of burstTracker.entries()) {
        // Remove if window is old and no recent hashes
        if (now - tracker.windowStart > BURST_INTERVAL * 10 && tracker.hashes.length === 0) {
            burstTracker.delete(key);
            continue;
        }
        // Proactive cleanup: remove trackers older than maxAgeMs regardless of content
        if (now - tracker.windowStart > maxAgeMs) {
            burstTracker.delete(key);
        }
    }
}

// Redis key prefix for spam tracking
const SPAM_KEY_PREFIX = 'apollo:spam:';

/**
 * Gets Redis client for spam tracking
 * @returns {Promise<Redis | null>} Redis client or null if unavailable
 */
async function getSpamRedis(): Promise<Redis | null> {
    if (!config.queue.enabled) { return null; }
    const client = await getLockRedis();
    return client as unknown as Redis;
}

/**
 * Tracks a message in Redis-backed spam tracking (optimized with pipeline)
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} timestamp - Message timestamp
 * @param {number} intervalMs - Time interval in ms (for TTL calculation)
 */
export async function trackMessageRedis(
    guildId: string,
    userId: string,
    timestamp: number,
    intervalMs = 60000
): Promise<void> {
    const redis = await getSpamRedis();
    if (!redis) { return; }

    const key = `${SPAM_KEY_PREFIX}${guildId}:${userId}`;

    // Use Redis pipeline to combine zadd + expire in one round-trip
    const pipeline = redis.pipeline();
    pipeline.zadd(key, timestamp, `${timestamp}:${userId}`);
    // TTL = interval + 60s buffer to ensure key survives the check window
    const ttlSeconds = Math.ceil((intervalMs + 60000) / 1000);
    pipeline.expire(key, ttlSeconds);

    await pipeline.exec();
}

/**
 * Checks for spam using Redis (optimized with pipeline)
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} threshold - Max messages in interval
 * @param {number} intervalMs - Time interval in ms
 * @param {number} now - Current timestamp
 * @returns {Promise<boolean>} Whether spam was detected
 */
export async function checkSpamRedis(
    guildId: string,
    userId: string,
    threshold: number,
    intervalMs: number,
    now = Date.now()
): Promise<boolean> {
    const redis = await getSpamRedis();
    if (!redis) { return false; }

    const key = `${SPAM_KEY_PREFIX}${guildId}:${userId}`;
    const cutoff = now - intervalMs;

    // Use Redis pipeline to combine zremrangebyscore + zcount in one round-trip
    const pipeline = redis.pipeline();
    // Remove expired entries (exclusive boundary '(' to match in-memory behavior)
    pipeline.zremrangebyscore(key, '-inf', '(' + cutoff);
    // Count remaining entries within interval
    pipeline.zcount(key, '(' + cutoff, '+inf');

    const results = await pipeline.exec();
    if (!results) { return false; }

    // results[1] is zcount result: [error, count]
    const count = (results[1]?.[1] as number) ?? 0;

    return count >= threshold;
}

/**
 * Checks for spam (rapid messages) - uses Redis when available, falls back to in-memory
 * @param {Message} message - The Discord message
 * @param {number} threshold - Max messages in interval
 * @param {number} interval - Time interval in ms
 * @param {boolean} useRedis - Whether to use Redis (respects config flag)
 * @returns {Promise<boolean>} Whether spam was detected
 */
export async function checkSpam(
    message: Message,
    threshold: number,
    interval: number,
    useRedis = false
): Promise<boolean> {
    if (!message.guild) { return false; }
    const guildId = message.guild.id;
    const userId = message.author.id;
    const now = Date.now();

    // Try Redis first (only if explicitly requested)
    if (useRedis) {
        const redis = await getSpamRedis();
        if (redis) {
            await trackMessageRedis(guildId, userId, now, interval);
            return checkSpamRedis(guildId, userId, threshold, interval, now);
        }
    }

    // Fallback to in-memory
    return checkSpamMemory(message, threshold, interval);
}

/**
 * In-memory spam check (fallback)
 * @param {Message} message - The Discord message
 * @param {number} threshold - Max messages in interval
 * @param {number} interval - Time interval in ms
 * @returns {boolean} Whether spam was detected
 */
function checkSpamMemory(message: Message, threshold: number, interval: number): boolean {
    if (!message.guild) { return false; }
    const guildId = message.guild.id;
    const userId = message.author.id;
    const now = Date.now();

    // Get or create user tracker (LRU automatically handled by TwoLevelLRUCache)
    interface UserTracker { messages: number[]; lastWarned: number; }
    let userTracker = spamTracker.get(guildId, userId) as UserTracker | undefined;
    if (!userTracker) {
        userTracker = { messages: [], lastWarned: 0 };
        spamTracker.set(guildId, userId, userTracker);
    }

    // Remove old messages outside the interval FIRST
    userTracker.messages = userTracker.messages.filter((ts: number) => now - ts < interval);

    // Add current message timestamp
    userTracker.messages.push(now);

    // Check if threshold exceeded (use > not >= to allow exactly threshold messages)
    if (userTracker.messages.length > threshold) {
        // Check if we recently warned (avoid spam of warnings)
        if (now - userTracker.lastWarned < interval * 2) {
            return false; // Don't warn again too quickly
        }

        userTracker.lastWarned = now;
        return true;
    }

    return false;
}

/**
 * Cleans up old spam tracking data (call periodically)
 */
export async function cleanupSpamTracker(): Promise<void> {

    // Try to acquire distributed lock to avoid redundant cleanup across pods
    const redis = await getSpamRedis();
    let lockAcquired = false;
    if (redis) {
        const { acquireLock } = await import('./lock.js');
        lockAcquired = await acquireLock(redis, 'cleanup:spam', config.podId, 10000);
        if (!lockAcquired) {
            return; // Another pod is doing cleanup
        }
    }

    try {
        // TwoLevelLRUCache doesn't support direct iteration, so we clean up
        // by checking each guild's users. Since we can't iterate the cache directly,
        // we rely on the LRU eviction and the fact that checkSpamMemory filters
        // old messages on each access. For explicit cleanup, we'd need to track
        // guild IDs separately or add an iteration method to the cache.
        // For now, the LRU eviction and per-access filtering handle most cleanup.

        // Clean up empty guilds in the LRU cache
        spamTracker.cleanupEmptyGuilds();
    } finally {
        if (lockAcquired && redis) {
            const { releaseLock } = await import('./lock.js');
            await releaseLock(redis, 'cleanup:spam', config.podId);
        }
    }
}

// Clean up tracker every minute
let spamTrackerCleanupInterval: NodeJS.Timeout | null = setInterval(() => { void cleanupSpamTracker(); }, 60000);

/**
 * Stops the spam tracker cleanup interval.
 * Call this function during graceful shutdown to prevent memory leaks.
 */
export function stopSpamTrackerCleanup(): void {
    if (spamTrackerCleanupInterval) {
        clearInterval(spamTrackerCleanupInterval);
        spamTrackerCleanupInterval = null;
        logger.info('[INFO] Spam tracker cleanup interval stopped');
    }
}

