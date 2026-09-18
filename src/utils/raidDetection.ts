import { logger } from '../utils/logger.js';
import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { EmbedBuilder, ChannelType } from 'discord.js';
import { config } from '../config/config.js';
import { getLockRedis } from './lock.js';

// In-memory raid state tracking (fallback when Redis unavailable)
// Map<guildId, { joins: Array<{userId, username, timestamp, accountAge}>, raidMode: boolean, lastAlert: timestamp }>
const raidState = new Map<string, {
    joins: {userId: string; username: string; timestamp: number; accountAge: number}[];
    raidMode: boolean;
    lastAlert: number;
}>();

// Redis key prefixes
const RAID_KEY_PREFIX = 'apollo:raid:';
const RAID_MODE_KEY_PREFIX = 'apollo:raidmode:';

// Raid detection thresholds (configurable per-guild via config)
const DEFAULT_RAID_THRESHOLDS = {
    joinCount: 5,           // Number of joins
    timeWindow: 10000,      // Within 10 seconds
    newAccountAge: 7,       // Days (accounts newer than this are suspicious)
    similarNameThreshold: 0.7, // Name similarity ratio
    alertCooldown: 60000    // 1 minute between alerts
};

interface RaidThresholds {
    joinCount: number;
    timeWindow: number;
    newAccountAge: number;
    similarNameThreshold: number;
    alertCooldown: number;
}

interface RaidCheckResult {
    detected: boolean;
    recentJoins: number;
    newAccounts: number;
    similarNames: number;
}

interface RaidState {
    joins: {userId: string; username: string; timestamp: number; accountAge: number}[];
    raidMode: boolean;
    lastAlert: number;
}

/**
 * Gets raid thresholds for a guild (from config or defaults)
 * @param guildConfig - Guild automod config
 * @returns Raid thresholds
 */
function getRaidThresholds(guildConfig: Record<string, any>): RaidThresholds {
    if (!guildConfig['raidThresholds']) {
        return DEFAULT_RAID_THRESHOLDS;
    }
    return {
        joinCount: guildConfig['raidThresholds'].joinCount ?? DEFAULT_RAID_THRESHOLDS.joinCount,
        timeWindow: guildConfig['raidThresholds'].timeWindow ?? DEFAULT_RAID_THRESHOLDS.timeWindow,
        newAccountAge: guildConfig['raidThresholds'].newAccountAge ?? DEFAULT_RAID_THRESHOLDS.newAccountAge,
        similarNameThreshold: guildConfig['raidThresholds'].similarNameThreshold ?? DEFAULT_RAID_THRESHOLDS.similarNameThreshold,
        alertCooldown: guildConfig['raidThresholds'].alertCooldown ?? DEFAULT_RAID_THRESHOLDS.alertCooldown
    };
}

/**
 * Gets Redis client for raid detection
 * @returns Redis client or null if unavailable
 */
async function getRaidRedis(): Promise<any> {
    if (!config.queue?.enabled) {return null;}
    return getLockRedis();
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
    const members = await redis.zrange(key, 0, -1) as string[];

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

/**
 * Checks if a join is part of a raid pattern (uses Redis when available, falls back to in-memory)
 * @param guildId - Guild ID
 * @param member - The joining member
 * @param guildConfig - Guild automod config (optional, for custom thresholds)
 * @returns Whether raid was detected
 */
export async function checkRaidPattern(guildId: string, member: GuildMember, guildConfig: Record<string, any> = {}): Promise<boolean> {
    const now = Date.now();
    const accountAge = now - member.user.createdTimestamp;
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);

    const thresholds = getRaidThresholds(guildConfig);

    // Try Redis first
    const redis = await getRaidRedis();
    if (redis) {
        await trackJoinRedis(guildId, member.user.id, member.user.username, now, accountAgeDays);
        const result = await checkRaidPatternRedis(guildId, thresholds.joinCount, thresholds.timeWindow, now, thresholds);
        return result.detected;
    }

    // Fallback to in-memory
    return checkRaidPatternMemory(guildId, member, now, accountAgeDays, thresholds);
}

/**
 * In-memory raid pattern check (fallback)
 * @param guildId - Guild ID
 * @param member - The joining member
 * @param now - Current timestamp
 * @param accountAgeDays - Account age in days
 * @param thresholds - Raid thresholds
 * @returns Whether raid was detected
 */
function checkRaidPatternMemory(guildId: string, member: GuildMember, now: number, accountAgeDays: number, thresholds: RaidThresholds): boolean {
    // Initialize guild state if needed
    if (!raidState.has(guildId)) {
        raidState.set(guildId, {
            joins: [],
            raidMode: false,
            lastAlert: 0
        });
    }

    const state = raidState.get(guildId)!;

    // Add this join to the tracking
    state.joins.push({
        userId: member.user.id,
        username: member.user.username,
        timestamp: now,
        accountAge: accountAgeDays
    });

    // Remove old joins outside the time window
    state.joins = state.joins.filter(j => now - j.timestamp < thresholds.timeWindow);

    // Check for raid patterns
    const recentJoins = state.joins.length;

    // Pattern 1: Too many joins in short time
    if (recentJoins >= thresholds.joinCount) {
        logger.info({ msg: `[RAID] Pattern detected: ${recentJoins} joins in ${thresholds.timeWindow}ms` });
        return true;
    }

    // Pattern 2: Multiple new accounts joining
    const newAccounts = state.joins.filter(j => j.accountAge < thresholds.newAccountAge);
    if (newAccounts.length >= 3 && recentJoins >= 4) {
        logger.info({ msg: `[RAID] Pattern detected: ${newAccounts.length} new accounts in recent joins` });
        return true;
    }

    // Pattern 3: Similar usernames
    if (recentJoins >= 3) {
        const usernames = state.joins.map(j => j.username);
        const similarCount = countSimilarNames(usernames);
        if (similarCount >= 3) {
            logger.info({ msg: `[RAID] Pattern detected: ${similarCount} similar usernames` });
            return true;
        }
    }

    return false;
}

/**
 * Handles a detected raid
 * @param guild - The guild being raided
 * @param member - The member who triggered detection
 */
export async function handleRaidDetected(guild: Guild, member: GuildMember): Promise<void> {
    const now = Date.now();

    // Get state (Redis or memory)
    let state: RaidState | null = null;
    const redis = await getRaidRedis();
    if (redis) {
        const key = `${RAID_KEY_PREFIX}${guild.id}`;
        const members = await redis.zrange(key, 0, -1) as string[];
        const parsedMembers = members.map(m => {
            try { return JSON.parse(m); } catch { return null; }
        }).filter(Boolean) as {userId: string; username: string; timestamp: number; accountAge: number}[];

        const lastAlertKey = `${RAID_KEY_PREFIX}${guild.id}:lastalert`;
        const lastAlert = parseInt((await redis.get(lastAlertKey) as string | null) ?? '0', 10);

        if (now - lastAlert < DEFAULT_RAID_THRESHOLDS.alertCooldown) {
            return; // Don't spam alerts
        }

        await redis.set(lastAlertKey, now.toString());

        state = {
            joins: parsedMembers,
            raidMode: await isRaidModeEnabledRedis(guild.id),
            lastAlert: now
        };
    } else {
        state = raidState.get(guild.id) ?? null;
        if (!state) {return;}

        if (now - state.lastAlert < DEFAULT_RAID_THRESHOLDS.alertCooldown) {
            return; // Don't spam alerts
        }

        state.lastAlert = now;
    }

    // Find mod log channel
    const modChannel = guild.channels.cache.find(
        ch => ch.name === config.moderation?.moderationLogChannel
    );

    if (!modChannel) {
        logger.info({ msg: '[RAID] No mod channel found to send raid alert' });
        return;
    }

    // Create raid alert embed
    const alertEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('[!] RAID DETECTED')
        .setDescription('⚠️ Suspicious join pattern detected! Potential raid in progress.')
        .addFields(
            { name: 'Recent Joins', value: `${state.joins.length} in last ${DEFAULT_RAID_THRESHOLDS.timeWindow / 1000}s`, inline: true },
            { name: 'New Accounts', value: `${state.joins.filter(j => j.accountAge < DEFAULT_RAID_THRESHOLDS.newAccountAge).length}`, inline: true },
            { name: 'Triggered By', value: `${member.user.tag}\n\`${member.user.id}\``, inline: true }
        )
        .addFields({
            name: 'Recommended Actions',
            value: '• Use `/raidmode enable` to lock all channels\n• Review recent joins manually\n• Check verification settings',
            inline: false
        })
        .setTimestamp()
        .setFooter({ text: 'Raid detection is automated - verify before taking action' });

    // List suspicious accounts
    if (state.joins.length > 0) {
        const suspiciousAccounts = state.joins
            .slice(-10) // Last 10 joins
            .map(j => {
                const ageStr = j.accountAge < 1 ?
                    `${Math.round(j.accountAge * 24)}h old` :
                    `${Math.round(j.accountAge)}d old`;
                return `• ${j.username} (\`${j.userId}\`) - ${ageStr}`;
            })
            .join('\n');

        alertEmbed.addFields({
            name: 'Recent Join Accounts',
            value: suspiciousAccounts || 'None',
            inline: false
        });
    }

    await (modChannel as TextChannel).send({
        content: '@here',
        embeds: [alertEmbed]
    });

    logger.info({ msg: `[RAID] Raid alert sent to ${guild.name}` });
}

/**
 * Enables raid mode - locks down all channels
 * @param guild - The guild to lock down
 * @returns Result with success status and stats
 */
export async function enableRaidMode(guild: Guild): Promise<{success: boolean; reason?: string; locked?: number; failed?: number; total?: number}> {
    // Check current state (Redis or memory)
    const raidModeEnabled = await isRaidModeEnabledRedis(guild.id);
    if (raidModeEnabled) {
        return { success: false, reason: 'Raid mode already enabled' };
    }

    let locked = 0;
    let failed = 0;

    // Lock all text channels
    const channels = guild.channels.cache.filter(
        ch => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice
    );

    for (const [, channel] of channels) {
        try {
            // Deny @everyone from sending messages
            await channel.permissionOverwrites.edit(guild.id, {
                SendMessages: false,
                Connect: false // For voice channels
            });
            locked++;
        } catch (error) {
            logger.error({ err: error as Error, msg: `[RAID] Failed to lock channel ${channel.name}` });
            failed++;
        }
    }

    // Set raid mode in Redis or memory
    await setRaidModeRedis(guild.id, true);

    // Also update in-memory state for consistency
    const state = raidState.get(guild.id) ?? { joins: [], raidMode: false, lastAlert: 0 };
    state.raidMode = true;
    raidState.set(guild.id, state);

    logger.info({ msg: `[RAID] Raid mode enabled in ${guild.name}. Locked: ${locked}, Failed: ${failed}` });

    return {
        success: true,
        locked,
        failed,
        total: channels.size
    };
}

/**
 * Disables raid mode - unlocks all channels
 * @param guild - The guild to unlock
 * @returns Result with success status and stats
 */
export async function disableRaidMode(guild: Guild): Promise<{success: boolean; reason?: string; unlocked?: number; failed?: number; total?: number}> {
    // Check current state (Redis or memory)
    const raidModeEnabled = await isRaidModeEnabledRedis(guild.id);
    const memState = raidState.get(guild.id);

    if (!raidModeEnabled && (!memState?.raidMode)) {
        return { success: false, reason: 'Raid mode not enabled' };
    }

    let unlocked = 0;
    let failed = 0;

    // Unlock all text channels
    const channels = guild.channels.cache.filter(
        ch => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice
    );

    for (const [, channel] of channels) {
        try {
            // Remove the @everyone send messages deny
            await channel.permissionOverwrites.edit(guild.id, {
                SendMessages: null,
                Connect: null
            });
            unlocked++;
        } catch (error) {
            logger.error({ err: error as Error, msg: `[RAID] Failed to unlock channel ${channel.name}` });
            failed++;
        }
    }

    // Clear raid mode in Redis and memory
    await setRaidModeRedis(guild.id, false);

    if (memState) {
        memState.raidMode = false;
        memState.joins = []; // Clear join history
    }

    logger.info({ msg: `[RAID] Raid mode disabled in ${guild.name}. Unlocked: ${unlocked}, Failed: ${failed}` });

    return {
        success: true,
        unlocked,
        failed,
        total: channels.size
    };
}

/**
 * Checks if raid mode is currently enabled (uses Redis when available)
 * @param guildId - Guild ID
 * @returns Whether raid mode is enabled
 */
export async function isRaidModeEnabled(guildId: string): Promise<boolean> {
    const redis = await getRaidRedis();
    if (redis) {
        return isRaidModeEnabledRedis(guildId);
    }

    const state = raidState.get(guildId);
    return state ? state.raidMode : false;
}

/**
 * Counts similar names in a list of usernames
 * @param usernames - Array of usernames
 * @returns Count of similar names
 */
function countSimilarNames(usernames: string[]): number {
    if (usernames.length < 2) {return 0;}

    let similarCount = 0;

    for (let i = 0; i < usernames.length - 1; i++) {
        for (let j = i + 1; j < usernames.length; j++) {
            const similarity = calculateSimilarity(usernames[i]!, usernames[j]!);
            if (similarity >= DEFAULT_RAID_THRESHOLDS.similarNameThreshold) {
                similarCount++;
            }
        }
    }

    return similarCount;
}

/**
 * Calculates string similarity using Levenshtein distance
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity ratio (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {return 1.0;}

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Calculates Levenshtein distance between two strings
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance
 */
function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0]![j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i]![j] = matrix[i - 1]?.[j - 1] ?? 0;
            } else {
                matrix[i]![j] = Math.min(
                    (matrix[i - 1]?.[j - 1] ?? 0) + 1,
                    (matrix[i]?.[j - 1] ?? 0) + 1,
                    (matrix[i - 1]?.[j] ?? 0) + 1
                );
            }
        }
    }

    return matrix[str2.length]?.[str1.length] ?? 0;
}

/**
 * Clean up old raid state data (call periodically)
 */
export function cleanupRaidState(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [guildId, state] of raidState) {
        // Clear old joins
        state.joins = state.joins.filter(j => now - j.timestamp < maxAge);

        // Remove empty states that aren't in raid mode
        if (state.joins.length === 0 && !state.raidMode && now - state.lastAlert > maxAge) {
            raidState.delete(guildId);
        }
    }
}

// Clean up raid state every 5 minutes
setInterval(cleanupRaidState, 300000);

export default {
    trackJoinRedis,
    checkRaidPatternRedis,
    isRaidModeEnabledRedis,
    setRaidModeRedis,
    checkRaidPattern,
    handleRaidDetected,
    enableRaidMode,
    disableRaidMode,
    isRaidModeEnabled,
    cleanupRaidState
};