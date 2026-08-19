/* eslint-disable no-console */
// Automod Utility
// Core automod checking functions

import { getGuildData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis } from './lock.js';
import { TwoLevelLRUCache } from './lruCache.js';

// In-memory spam tracking (fallback when Redis unavailable)
// Uses O(1) LRU cache for efficient eviction
const spamTracker = new TwoLevelLRUCache({
    maxGuilds: 1000,
    maxUsersPerGuild: 500,
    maxTotalUsers: 50000,
    onEvict: (_guildId, _userId, _value) => {
        // Optional: log eviction for monitoring
    }
});

// Redis key prefix for spam tracking
const SPAM_KEY_PREFIX = 'apollo:spam:';

/**
 * Gets Redis client for spam tracking
 * @returns {Promise<Redis|null>} Redis client or null if unavailable
 */
async function getSpamRedis() {
    if (!config.queue.enabled) {return null;}
    return getLockRedis();
}

/**
 * Tracks a message in Redis-backed spam tracking
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} timestamp - Message timestamp
 */
export async function trackMessageRedis(guildId, userId, timestamp) {
    const redis = await getSpamRedis();
    if (!redis) {return;}

    const key = `${SPAM_KEY_PREFIX}${guildId}:${userId}`;
    await redis.zadd(key, timestamp, `${timestamp}:${userId}`);
    await redis.expire(key, 60); // 1 minute TTL
}

/**
 * Checks for spam using Redis
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} threshold - Max messages in interval
 * @param {number} intervalMs - Time interval in ms
 * @param {number} now - Current timestamp
 * @returns {Promise<boolean>} Whether spam was detected
 */
export async function checkSpamRedis(guildId, userId, threshold, intervalMs, now = Date.now()) {
    const redis = await getSpamRedis();
    if (!redis) {return false;}

    const key = `${SPAM_KEY_PREFIX}${guildId}:${userId}`;
    const cutoff = now - intervalMs;
    
    await redis.zremrangebyscore(key, '-inf', cutoff);
    const count = await redis.zcount(key, cutoff, '+inf');
    
    return count >= threshold;
}

/**
 * Gets automod configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<Object>} Automod configuration
 */
export async function getAutomodConfig(guildId) {
    const guildConfig = await getGuildData('automod', guildId);
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
        aiModeration: guildConfig.aiModeration ?? config.automod.aiModeration,
        nsfwFilter: guildConfig.nsfwFilter ?? config.automod.nsfwFilter,
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
    // Admins are exempt
    if (member.permissions.has('Administrator')) {return true;}
    
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
 * Normalizes message content for banned word matching.
 * Converts leetspeak substitutions (e.g. @→a, 3→e, 0→o) and
 * decomposes accented characters to their ASCII base equivalents.
 * Also removes zero-width characters and common obfuscation techniques.
 * @param {string} content - Raw message content
 * @returns {string} Normalized content
 */
export function normalizeContent(content) {
    // Remove zero-width characters and other invisible obfuscation
    const cleaned = content
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width space, joiner, non-joiner, BOM
        .replace(/[\u2060-\u206F]/g, '') // Word joiner, invisible operators
        .replace(/[\u00AD]/g, '') // Soft hyphen
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Decompose and remove diacritics

    const leetMap = {
        '4': 'a', '@': 'a', 'ª': 'a',
        '8': 'b', 'ß': 'b', 'þ': 'b', 'β': 'b',
        '©': 'c', '¢': 'c', '₵': 'c',
        'ð': 'd', 'đ': 'd', 'Ð': 'd', 'Đ': 'd',
        '3': 'e', '€': 'e',
        'ƒ': 'f', '₣': 'f',
        '9': 'g', '6': 'g',
        '1': 'i', '!': 'i', '|': 'i',
        '0': 'o', '¤': 'o', 'ø': 'o', 'Ø': 'o',
        '¶': 'p',
        '®': 'r',
        '5': 's', '$': 's', '§': 's',
        '7': 't', '†': 't', '+': 't',
        'µ': 'u',
        '√': 'v',
        '×': 'x', 'ˣ': 'x',
        '¥': 'y',
        '2': 'z',
        'ł': 'l', 'Ł': 'l',
        'æ': 'a', 'Æ': 'a',
        'œ': 'o', 'Œ': 'o'
    };

    return cleaned.split('').map(c => leetMap[c] || c).join('');
}

/**
 * Checks message for banned words
 * @param {string} content - Message content
 * @param {string[]} bannedWords - List of banned words
 * @returns {string|null} The matched word or null
 */
export function checkBannedWords(content, bannedWords) {
    if (!bannedWords.length) {return null;}
    
    const normalizedContent = normalizeContent(content).toLowerCase();
    
    for (const word of bannedWords) {
        const normalizedWord = normalizeContent(word).toLowerCase();
        // Use word boundary for exact matches
        const regex = new RegExp(`\\b${escapeRegex(normalizedWord)}\\b`, 'i');
        if (regex.test(normalizedContent)) {
            return word;
        }
        
        // Also check for the word with common separators inserted (but still respect word boundaries)
        // Only do this for words longer than 2 characters to avoid false positives
        if (normalizedWord.length > 2) {
            const separatedPattern = normalizedWord.split('').join('[\\s\\W_]*');
            const separatedRegex = new RegExp(`\\b${separatedPattern}\\b`, 'i');
            if (separatedRegex.test(normalizedContent)) {
                return word;
            }
        }
    }
    
    return null;
}

/**
 * Checks message for Discord invite links
 * Handles obfuscated invites (spaces, zero-width chars, etc.)
 * @param {string} content - Message content
 * @returns {boolean} Whether invite was found
 */
export function checkInvites(content) {
    // Normalize content first to remove obfuscation
    const normalized = normalizeContent(content);
    
    // Match discord.gg, discordapp.com/invite, discord.com/invite with various obfuscations
    // For discord.gg: require /code format (most common)
    // For full URLs: allow /code or space+code (alphanumeric, 4+ chars, mixed case/numbers)
    const shortInviteRegex = /discord\.gg\/[a-zA-Z0-9]{4,}/i;
    const fullInviteRegex = /(discordapp\.com\/invite|discord\.com\/invite)(?:\/|\s+)([a-zA-Z0-9]{4,})(?![a-zA-Z0-9])/i;
    
    return shortInviteRegex.test(normalized) || fullInviteRegex.test(normalized);
}

/**
 * Checks message for external links
 * Handles obfuscated URLs (hxxp, spaces, zero-width chars, etc.)
 * @param {string} content - Message content
 * @returns {boolean} Whether link was found
 */
export function checkLinks(content) {
    // Normalize content first to remove obfuscation
    const normalized = normalizeContent(content);
    
    // Match http:// or https:// URLs (including hxxp obfuscation)
    const linkRegex = /hxxps?:\/\/[^\s]+/i;
    if (linkRegex.test(normalized)) {return true;}
    
    // Match standard URLs
    const standardLinkRegex = /https?:\/\/[^\s]+/i;
    return standardLinkRegex.test(normalized);
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
    if (content.length < minLength) {return false;}
    
    // Remove non-alphabetic characters
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < minLength) {return false;}
    
    // Count uppercase letters
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const percent = (upperCount / letters.length) * 100;
    
    return percent > maxPercent;
}

/**
 * Checks for spam (rapid messages) - uses Redis when available, falls back to in-memory
 * @param {Message} message - The Discord message
 * @param {number} threshold - Max messages in interval
 * @param {number} interval - Time interval in ms
 * @returns {Promise<boolean>} Whether spam was detected
 */
export async function checkSpam(message, threshold, interval) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const now = Date.now();
    
    // Try Redis first
    const redis = await getSpamRedis();
    if (redis) {
        await trackMessageRedis(guildId, userId, now);
        return checkSpamRedis(guildId, userId, threshold, interval, now);
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
function checkSpamMemory(message, threshold, interval) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const now = Date.now();
    
    // Get or create user tracker (LRU automatically handled by TwoLevelLRUCache)
    let userTracker = spamTracker.get(guildId, userId);
    if (!userTracker) {
        userTracker = { messages: [], lastWarned: 0 };
        spamTracker.set(guildId, userId, userTracker);
    }
    
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
    if (minDays <= 0) {return false;}
    
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
export async function cleanupSpamTracker() {
    
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

// Known phishing domains (Discord nitro scams, etc.)
const PHISHING_DOMAINS = [
    'discord-nitro.com',
    'discordnitro.com',
    'discord-gift.com',
    'discordgift.com',
    'discord-app.com',
    'discordapp.ru',
    'discordapp.io',
    'discordsteam.com',
    'discord-free.com',
    'free-discord.com',
    'steamcommunity.ru',
    'steampowered.ru',
    'steam-free.com',
    'free-steam.com'
];

// Suspicious patterns in URLs
const SUSPICIOUS_PATTERNS = [
    /nitro.*free/i,
    /free.*nitro/i,
    /discord.*gift/i,
    /steam.*free/i,
    /claim.*nitro/i,
    /get.*nitro/i
];

/**
 * Checks message for phishing links
 * @param {string} content - Message content
 * @returns {Object|null} Match info or null
 */
export function checkPhishingLinks(content) {
    // Extract URLs from content
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = content.match(urlRegex);
    
    if (!urls) {return null;}
    
    for (const url of urls) {
        try {
            // Decode URL to handle encoded characters
            const decodedUrl = decodeURIComponent(url);
            const urlObj = new URL(decodedUrl);
            const hostname = urlObj.hostname.toLowerCase();
            
            // Check against known phishing domains
            for (const domain of PHISHING_DOMAINS) {
                if (hostname === domain || hostname.endsWith('.' + domain)) {
                    return {
                        url: decodedUrl,
                        reason: 'Known phishing domain',
                        domain: hostname
                    };
                }
            }
            
            // Check for suspicious patterns in the full URL
            for (const pattern of SUSPICIOUS_PATTERNS) {
                if (pattern.test(decodedUrl)) {
                    return {
                        url: decodedUrl,
                        reason: 'Suspicious URL pattern',
                        domain: hostname
                    };
                }
            }
            
            // Check for Discord/Steam impersonation domains
            // Use regex with word boundary to prevent bypass via subdomains like "notdiscord.com"
            const isDiscordMention = /(?:^|[^a-z])discord(?:[^a-z]|$)/i.test(hostname);
            const isSteamMention = /(?:^|[^a-z])steam(?:[^a-z]|$)/i.test(hostname);
            
            // Legitimate domain patterns - must match exactly or be a subdomain
            const isLegitDiscord = /^([a-z0-9-]+\.)*discord\.com$/i.test(hostname) ||
                                   /^([a-z0-9-]+\.)*discordapp\.com$/i.test(hostname) ||
                                   /^([a-z0-9-]+\.)*discord\.gg$/i.test(hostname);
            const isLegitSteam = /^([a-z0-9-]+\.)*steampowered\.com$/i.test(hostname) ||
                                 /^([a-z0-9-]+\.)*steamcommunity\.com$/i.test(hostname);
            
            if ((isDiscordMention && !isLegitDiscord) || (isSteamMention && !isLegitSteam)) {
                return {
                    url: decodedUrl,
                    reason: 'Impersonation domain',
                    domain: hostname
                };
            }
            
        } catch {
            // Invalid URL, skip
            continue;
        }
    }
    
    return null;
}

export default {
    trackMessageRedis,
    checkSpamRedis,
    getAutomodConfig,
    isExempt,
    isChannelExempt,
    normalizeContent,
    checkBannedWords,
    checkInvites,
    checkLinks,
    checkMentionSpam,
    checkCapsSpam,
    checkSpam,
    checkAccountAge,
    cleanupSpamTracker,
    stopSpamTrackerCleanup,
    checkPhishingLinks
};