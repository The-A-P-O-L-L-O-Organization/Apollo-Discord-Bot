import { logger } from '../utils/logger.js';
import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { EmbedBuilder, ChannelType } from 'discord.js';
import { config } from '../config/config.js';
import { DEFAULT_RAID_THRESHOLDS, type RaidThresholds, type RaidState } from './raidDetectionTypes.js';
import { getRaidRedis, trackJoinRedis, checkRaidPatternRedis, isRaidModeEnabledRedis, setRaidModeRedis, RAID_KEY_PREFIX } from './raidDetectionRedis.js';
import { countSimilarNames } from './raidDetectionSimilarity.js';

// In-memory raid state tracking (fallback when Redis unavailable)
// Map<guildId, { joins: Array<{userId, username, timestamp, accountAge}>, raidMode: boolean, lastAlert: timestamp }>
const raidState = new Map<string, {
    joins: {userId: string; username: string; timestamp: number; accountAge: number}[];
    raidMode: boolean;
    lastAlert: number;
}>();

/**
 * Gets raid thresholds for a guild (from config or defaults)
 * @param guildConfig - Guild automod config
 * @returns Raid thresholds
 */
function getRaidThresholds(guildConfig: Record<string, unknown>): RaidThresholds {
    if (!guildConfig['raidThresholds']) {
        return DEFAULT_RAID_THRESHOLDS;
    }
    const rt = guildConfig['raidThresholds'] as Record<string, unknown>;
    return {
        joinCount: (rt['joinCount'] as number) ?? DEFAULT_RAID_THRESHOLDS.joinCount,
        timeWindow: (rt['timeWindow'] as number) ?? DEFAULT_RAID_THRESHOLDS.timeWindow,
        newAccountAge: (rt['newAccountAge'] as number) ?? DEFAULT_RAID_THRESHOLDS.newAccountAge,
        similarNameThreshold: (rt['similarNameThreshold'] as number) ?? DEFAULT_RAID_THRESHOLDS.similarNameThreshold,
        alertCooldown: (rt['alertCooldown'] as number) ?? DEFAULT_RAID_THRESHOLDS.alertCooldown
    };
}

/**
 * Checks if a join is part of a raid pattern (uses Redis when available, falls back to in-memory)
 * @param guildId - Guild ID
 * @param member - The joining member
 * @param guildConfig - Guild automod config (optional, for custom thresholds)
 * @returns Whether raid was detected
 */
export async function checkRaidPattern(guildId: string, member: GuildMember, guildConfig: Record<string, unknown> = {}): Promise<boolean> {
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
    let state: RaidState | null;
    const redis = await getRaidRedis();
    if (redis) {
        const key = `${RAID_KEY_PREFIX}${guild.id}`;
        const members = await redis.zrange(key, 0, -1);
        const parsedMembers = members.map(m => {
            try { return JSON.parse(m); } catch { return null; }
        }).filter(Boolean) as {userId: string; username: string; timestamp: number; accountAge: number}[];

        const lastAlertKey = `${RAID_KEY_PREFIX}${guild.id}:lastalert`;
        const lastAlert = parseInt((await redis.get(lastAlertKey)) ?? '0', 10);

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
