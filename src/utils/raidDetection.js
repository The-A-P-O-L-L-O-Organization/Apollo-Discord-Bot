/* eslint-disable no-console */
// Raid Detection Utility
// Monitors join patterns and auto-locks server during raids

import { EmbedBuilder, ChannelType } from 'discord.js';
import { config } from '../config/config.js';

// In-memory raid state tracking
// Map<guildId, { joins: Array<{userId, username, timestamp, accountAge}>, raidMode: boolean, lastAlert: timestamp }>
const raidState = new Map();

// Redis-backed raid detection functions
export async function trackJoin(redis, guildId, userId, timestamp) {
    const key = `raid:${guildId}`;
    await redis.zadd(key, timestamp, `${timestamp}:${userId}`);
    await redis.expire(key, 300);
}

export async function checkRaid(redis, guildId, threshold, intervalMs, now = Date.now()) {
    const key = `raid:${guildId}`;
    const cutoff = now - intervalMs;
    await redis.zremrangebyscore(key, '-inf', cutoff);
    const count = await redis.zcount(key, cutoff, '+inf');
    return count >= threshold;
}

// Raid detection thresholds (configurable)
const RAID_THRESHOLDS = {
    joinCount: 5,           // Number of joins
    timeWindow: 10000,      // Within 10 seconds
    newAccountAge: 7,       // Days (accounts newer than this are suspicious)
    similarNameThreshold: 0.7, // Name similarity ratio
    alertCooldown: 60000    // 1 minute between alerts
};

/**
 * Checks if a join is part of a raid pattern
 * @param {string} guildId - Guild ID
 * @param {GuildMember} member - The joining member
 * @returns {boolean} Whether raid was detected
 */
export function checkRaidPattern(guildId, member) {
    const now = Date.now();
    const accountAge = now - member.user.createdTimestamp;
    const accountAgeDays = accountAge / (1000 * 60 * 60 * 24);
    
    // Initialize guild state if needed
    if (!raidState.has(guildId)) {
        raidState.set(guildId, {
            joins: [],
            raidMode: false,
            lastAlert: 0
        });
    }
    
    const state = raidState.get(guildId);
    
    // Add this join to the tracking
    state.joins.push({
        userId: member.user.id,
        username: member.user.username,
        timestamp: now,
        accountAge: accountAgeDays
    });
    
    // Remove old joins outside the time window
    state.joins = state.joins.filter(j => now - j.timestamp < RAID_THRESHOLDS.timeWindow);
    
    // Check for raid patterns
    const recentJoins = state.joins.length;
    
    // Pattern 1: Too many joins in short time
    if (recentJoins >= RAID_THRESHOLDS.joinCount) {
        console.log(`[RAID] Pattern detected: ${recentJoins} joins in ${RAID_THRESHOLDS.timeWindow}ms`);
        return true;
    }
    
    // Pattern 2: Multiple new accounts joining
    const newAccounts = state.joins.filter(j => j.accountAge < RAID_THRESHOLDS.newAccountAge);
    if (newAccounts.length >= 3 && recentJoins >= 4) {
        console.log(`[RAID] Pattern detected: ${newAccounts.length} new accounts in recent joins`);
        return true;
    }
    
    // Pattern 3: Similar usernames
    if (recentJoins >= 3) {
        const usernames = state.joins.map(j => j.username);
        const similarCount = countSimilarNames(usernames);
        if (similarCount >= 3) {
            console.log(`[RAID] Pattern detected: ${similarCount} similar usernames`);
            return true;
        }
    }
    
    return false;
}

/**
 * Handles a detected raid
 * @param {Guild} guild - The guild being raided
 * @param {GuildMember} member - The member who triggered detection
 */
export async function handleRaidDetected(guild, member) {
    const state = raidState.get(guild.id);
    
    // Check alert cooldown
    const now = Date.now();
    if (now - state.lastAlert < RAID_THRESHOLDS.alertCooldown) {
        return; // Don't spam alerts
    }
    
    state.lastAlert = now;
    
    // Find mod log channel
    const modChannel = guild.channels.cache.find(
        ch => ch.name === config.moderation.moderationLogChannel
    );
    
    if (!modChannel) {
        console.log('[RAID] No mod channel found to send raid alert');
        return;
    }
    
    // Create raid alert embed
    const alertEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('[!] RAID DETECTED')
        .setDescription('⚠️ Suspicious join pattern detected! Potential raid in progress.')
        .addFields(
            { name: 'Recent Joins', value: `${state.joins.length} in last ${RAID_THRESHOLDS.timeWindow / 1000}s`, inline: true },
            { name: 'New Accounts', value: `${state.joins.filter(j => j.accountAge < RAID_THRESHOLDS.newAccountAge).length}`, inline: true },
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
    
    await modChannel.send({ 
        content: '@here',
        embeds: [alertEmbed] 
    });
    
    console.log(`[RAID] Raid alert sent to ${guild.name}`);
}

/**
 * Enables raid mode - locks down all channels
 * @param {Guild} guild - The guild to lock down
 * @returns {Object} Result with success status and stats
 */
export async function enableRaidMode(guild) {
    const state = raidState.get(guild.id) || { joins: [], raidMode: false, lastAlert: 0 };
    
    if (state.raidMode) {
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
            console.error(`[RAID] Failed to lock channel ${channel.name}:`, error.message);
            failed++;
        }
    }
    
    state.raidMode = true;
    raidState.set(guild.id, state);
    
    console.log(`[RAID] Raid mode enabled in ${guild.name}. Locked: ${locked}, Failed: ${failed}`);
    
    return { 
        success: true, 
        locked, 
        failed,
        total: channels.size
    };
}

/**
 * Disables raid mode - unlocks all channels
 * @param {Guild} guild - The guild to unlock
 * @returns {Object} Result with success status and stats
 */
export async function disableRaidMode(guild) {
    const state = raidState.get(guild.id);
    
    if (!state || !state.raidMode) {
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
            console.error(`[RAID] Failed to unlock channel ${channel.name}:`, error.message);
            failed++;
        }
    }
    
    state.raidMode = false;
    state.joins = []; // Clear join history
    
    console.log(`[RAID] Raid mode disabled in ${guild.name}. Unlocked: ${unlocked}, Failed: ${failed}`);
    
    return { 
        success: true, 
        unlocked, 
        failed,
        total: channels.size
    };
}

/**
 * Checks if raid mode is currently enabled
 * @param {string} guildId - Guild ID
 * @returns {boolean} Whether raid mode is enabled
 */
export function isRaidModeEnabled(guildId) {
    const state = raidState.get(guildId);
    return state ? state.raidMode : false;
}

/**
 * Counts similar names in a list of usernames
 * @param {string[]} usernames - Array of usernames
 * @returns {number} Count of similar names
 */
function countSimilarNames(usernames) {
    if (usernames.length < 2) {return 0;}
    
    let similarCount = 0;
    
    for (let i = 0; i < usernames.length - 1; i++) {
        for (let j = i + 1; j < usernames.length; j++) {
            const similarity = calculateSimilarity(usernames[i], usernames[j]);
            if (similarity >= RAID_THRESHOLDS.similarNameThreshold) {
                similarCount++;
            }
        }
    }
    
    return similarCount;
}

/**
 * Calculates string similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity ratio (0-1)
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {return 1.0;}
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Calculates Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

/**
 * Clean up old raid state data (call periodically)
 */
export function cleanupRaidState() {
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
