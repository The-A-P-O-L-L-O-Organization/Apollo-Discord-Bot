// Automod Utility
// Core automod checking functions

import { getGuildData } from './dataStore.js';
import { config } from '../config/config.js';

// In-memory spam tracking
// Map<guildId, Map<userId, { messages: timestamp[], lastWarned: timestamp }>>
const spamTracker = new Map();

/**
 * Gets automod configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Object} Automod configuration
 */
export function getAutomodConfig(guildId) {
    const guildConfig = getGuildData('automod', guildId);
    return {
        enabled: guildConfig.enabled ?? config.automod.enabled,
        bannedWords: guildConfig.bannedWords || [],
        filterInvites: guildConfig.filterInvites ?? config.automod.filterInvites,
        filterLinks: guildConfig.filterLinks ?? config.automod.filterLinks,
        maxMentions: guildConfig.maxMentions ?? config.automod.maxMentions,
        maxCapsPercent: guildConfig.maxCapsPercent ?? config.automod.maxCapsPercent,
        minCapsLength: guildConfig.minCapsLength ?? config.automod.minCapsLength,
        minAccountAge: guildConfig.minAccountAge ?? config.automod.minAccountAge,
        spamThreshold: guildConfig.spamThreshold ?? config.automod.spamThreshold,
        spamInterval: guildConfig.spamInterval ?? config.automod.spamInterval,
        exemptChannels: guildConfig.exemptChannels || [],
        exemptRoles: guildConfig.exemptRoles || []
    };
}

/**
 * Checks if a member is exempt from automod
 * @param {GuildMember} member - The guild member
 * @param {Object} cfg - Automod configuration
 * @returns {boolean} Whether the member is exempt
 */
export function isExempt(member, cfg) {
    // Bots are exempt
    if (member.user.bot) return true;
    
    // Admins are exempt
    if (member.permissions.has('Administrator')) return true;
    
    // Check exempt roles
    if (cfg.exemptRoles.some(roleId => member.roles.cache.has(roleId))) {
        return true;
    }
    
    return false;
}

/**
 * Checks if a channel is exempt from automod
 * @param {string} channelId - The channel ID
 * @param {Object} cfg - Automod configuration
 * @returns {boolean} Whether the channel is exempt
 */
export function isChannelExempt(channelId, cfg) {
    return cfg.exemptChannels.includes(channelId);
}

/**
 * Checks message for banned words
 * @param {string} content - Message content
 * @param {string[]} bannedWords - List of banned words
 * @returns {string|null} The matched word or null
 */
export function checkBannedWords(content, bannedWords) {
    if (!bannedWords.length) return null;
    
    const lowerContent = content.toLowerCase();
    
    for (const word of bannedWords) {
        // Check for word boundaries to avoid partial matches
        const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
        if (regex.test(lowerContent)) {
            return word;
        }
    }
    
    return null;
}

/**
 * Checks message for Discord invite links
 * @param {string} content - Message content
 * @returns {boolean} Whether invite was found
 */
export function checkInvites(content) {
    // Match discord.gg, discordapp.com/invite, discord.com/invite
    const inviteRegex = /(discord\.gg|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/i;
    return inviteRegex.test(content);
}

/**
 * Checks message for external links
 * @param {string} content - Message content
 * @returns {boolean} Whether link was found
 */
export function checkLinks(content) {
    // Match http:// or https:// URLs
    const linkRegex = /https?:\/\/[^\s]+/i;
    return linkRegex.test(content);
}

/**
 * Checks message for mention spam
 * @param {Message} message - The Discord message
 * @param {number} maxMentions - Maximum allowed mentions
 * @returns {boolean} Whether mention spam was detected
 */
export function checkMentionSpam(message, maxMentions) {
    // Count user mentions, role mentions, and @everyone/@here
    const mentionCount = 
        message.mentions.users.size + 
        message.mentions.roles.size +
        (message.mentions.everyone ? 1 : 0);
    
    return mentionCount > maxMentions;
}

/**
 * Checks message for caps spam
 * @param {string} content - Message content
 * @param {number} maxPercent - Maximum allowed caps percentage
 * @param {number} minLength - Minimum message length to check
 * @returns {boolean} Whether caps spam was detected
 */
export function checkCapsSpam(content, maxPercent, minLength = 10) {
    // Only check messages longer than minimum length
    if (content.length < minLength) return false;
    
    // Remove non-alphabetic characters
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < minLength) return false;
    
    // Count uppercase letters
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const percent = (upperCount / letters.length) * 100;
    
    return percent > maxPercent;
}

/**
 * Checks for spam (rapid messages)
 * @param {Message} message - The Discord message
 * @param {number} threshold - Max messages in interval
 * @param {number} interval - Time interval in ms
 * @returns {boolean} Whether spam was detected
 */
export function checkSpam(message, threshold, interval) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const now = Date.now();
    
    // Initialize guild tracker if needed
    if (!spamTracker.has(guildId)) {
        spamTracker.set(guildId, new Map());
    }
    
    const guildTracker = spamTracker.get(guildId);
    
    // Initialize user tracker if needed
    if (!guildTracker.has(userId)) {
        guildTracker.set(userId, { messages: [], lastWarned: 0 });
    }
    
    const userTracker = guildTracker.get(userId);
    
    // Add current message timestamp
    userTracker.messages.push(now);
    
    // Remove old messages outside the interval
    userTracker.messages = userTracker.messages.filter(ts => now - ts < interval);
    
    // Check if threshold exceeded
    if (userTracker.messages.length >= threshold) {
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
 * Checks account age
 * @param {User} user - The Discord user
 * @param {number} minDays - Minimum account age in days
 * @returns {boolean} Whether account is too new
 */
export function checkAccountAge(user, minDays) {
    if (minDays <= 0) return false;
    
    const accountAge = Date.now() - user.createdTimestamp;
    const minAge = minDays * 24 * 60 * 60 * 1000;
    
    return accountAge < minAge;
}

/**
 * Escapes special regex characters in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cleans up old spam tracking data (call periodically)
 */
export function cleanupSpamTracker() {
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    
    for (const [guildId, guildTracker] of spamTracker) {
        for (const [userId, userTracker] of guildTracker) {
            // Remove users with no recent messages
            if (userTracker.messages.length === 0 || 
                now - Math.max(...userTracker.messages) > maxAge) {
                guildTracker.delete(userId);
            }
        }
        
        // Remove empty guild trackers
        if (guildTracker.size === 0) {
            spamTracker.delete(guildId);
        }
    }
}

// Clean up tracker every minute
let spamTrackerCleanupInterval = setInterval(cleanupSpamTracker, 60000);

/**
 * Stops the spam tracker cleanup interval.
 * Call this function during graceful shutdown to prevent memory leaks.
 */
export function stopSpamTrackerCleanup() {
    if (spamTrackerCleanupInterval) {
        clearInterval(spamTrackerCleanupInterval);
        spamTrackerCleanupInterval = null;
        console.log('[INFO] Spam tracker cleanup interval stopped');
    }
}
