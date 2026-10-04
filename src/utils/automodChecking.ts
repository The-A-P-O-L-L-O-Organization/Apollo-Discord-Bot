import type { Message, GuildMember, User } from 'discord.js';
import type { AutomodConfig } from './automodConfig.js';

/**
 * Checks if a member is exempt from automod
 * @param {GuildMember} member - The guild member
 * @param {AutomodConfig} cfg - Automod configuration
 * @returns {boolean} Whether the member is exempt
 */
export function isExempt(member: GuildMember, cfg: AutomodConfig): boolean {
    // Admins are exempt
    if (member.permissions.has('Administrator')) { return true; }

    // Check exempt roles
    if (cfg.exemptRoles.some(roleId => member.roles.cache.has(roleId))) {
        return true;
    }

    return false;
}

/**
 * Checks if a channel is exempt from automod
 * @param {string} channelId - The channel ID
 * @param {AutomodConfig} cfg - Automod configuration
 * @returns {boolean} Whether the channel is exempt
 */
export function isChannelExempt(channelId: string, cfg: AutomodConfig): boolean {
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
export function normalizeContent(content: string): string {
    // Remove zero-width characters and other invisible obfuscation
    const cleaned = content
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width space, joiner, non-joiner, BOM
        .replace(/[\u2060-\u206F]/g, '') // Word joiner, invisible operators
        .replace(/[\u00AD]/g, '') // Soft hyphen
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Decompose and remove diacritics

    const leetMap: Record<string, string> = {
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

    return cleaned.split('').map(c => leetMap[c] ?? c).join('');
}

/**
 * Checks message for banned words
 * @param {string} content - Message content
 * @param {string[]} bannedWords - List of banned words
 * @returns {string|null} The matched word or null
 */
export function checkBannedWords(content: string, bannedWords: string[]): string | null {
    if (!bannedWords.length) { return null; }

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
        // Use + instead of * to require at least one separator between letters
        // This prevents false positives on hyphens, dots, underscores in legitimate text
        if (normalizedWord.length > 2) {
            const separatedPattern = normalizedWord.split('').join('[\\s\\W_]+');
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
export function checkInvites(content: string): boolean {
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
export function checkLinks(content: string): boolean {
    // Normalize content first to remove obfuscation
    const normalized = normalizeContent(content);

    // Match http:// or https:// URLs (including hxxp obfuscation)
    const linkRegex = /hxxps?:\/\/[^\s]+/i;
    if (linkRegex.test(normalized)) { return true; }

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
export function checkMentionSpam(message: Message, maxMentions: number): boolean {
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
export function checkCapsSpam(content: string, maxPercent: number, minLength = 10): boolean {
    // Only check messages longer than minimum length
    if (content.length < minLength) { return false; }

    // Remove non-alphabetic characters
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length < minLength) { return false; }

    // Count uppercase letters
    const upperCount = (content.match(/[A-Z]/g) ?? []).length;
    const percent = (upperCount / letters.length) * 100;

    return percent > maxPercent;
}

/**
 * Checks account age
 * @param {User} user - The Discord user
 * @param {number} minDays - Minimum account age in days
 * @returns {boolean} Whether account is too new
 */
export function checkAccountAge(user: User, minDays: number): boolean {
    if (minDays <= 0) { return false; }

    const accountAge = Date.now() - user.createdTimestamp;
    const minAge = minDays * 24 * 60 * 60 * 1000;

    return accountAge < minAge;
}

/**
 * Escapes special regex characters in a string
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export interface PhishingMatch {
    url: string;
    reason: string;
    domain: string;
}

/**
 * Checks message for phishing links
 * @param {string} content - Message content
 * @returns {PhishingMatch | null} Match info or null
 */
export function checkPhishingLinks(content: string): PhishingMatch | null {
    // Extract URLs from content
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = content.match(urlRegex);

    if (!urls) { return null; }

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
