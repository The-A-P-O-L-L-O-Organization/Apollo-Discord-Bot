// Discord REST Error Code Handling
// Centralized error handling for Discord API errors

import { EmbedBuilder, MessageFlags } from 'discord.js';

/**
 * Discord API error codes that we handle specially
 * https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-json-error-codes
 */
export const DiscordErrorCodes = {
    // Permission/Access errors
    MISSING_PERMISSIONS: 50013,
    MISSING_ACCESS: 50001,
    
    // Interaction errors
    UNKNOWN_INTERACTION: 10062,
    INTERACTION_ALREADY_ACKNOWLEDGED: 40060,
    
    // Validation errors
    INVALID_FORM_BODY: 50035,
    MAXIMUM_GUILDS: 30013,
    MAXIMUM_FRIENDS: 30014,
    MAXIMUM_PINS: 30015,
    MAXIMUM_RECIPIENTS: 30016,
    MAXIMUM_ROLES: 30018,
    MAXIMUM_WEBHOOKS: 30019,
    MAXIMUM_EMOJIS: 30020,
    MAXIMUM_REACTIONS: 30021,
    MAXIMUM_CHANNELS: 30030,
    MAXIMUM_ATTACHMENTS: 30035,
    MAXIMUM_INVITES: 30039,
    MAXIMUM_ANIMATED_EMOJIS: 30058,
    MAXIMUM_SERVER_MEMBERS: 30061,
    MAXIMUM_NUMBER_OF_SERVER_CATEGORIES: 30062,
    MAXIMUM_NUMBER_OF_THREADS: 30063,
    MAXIMUM_NUMBER_OF_NON_GUILD_MEMBERS: 30064,
    MAXIMUM_NUMBER_OF_BANS: 30065,
    MAXIMUM_NUMBER_OF_BANNED_USERS: 30066,
    MAXIMUM_NUMBER_OF_STICKERS: 30067,
    MAXIMUM_NUMBER_OF_PREMIUM_EMOJIS: 30068,
    MAXIMUM_NUMBER_OF_GUILD_SCHEDULED_EVENTS: 30069,
    MAXIMUM_NUMBER_OF_GUILD_SCHEDULED_EVENT_USERS: 30070,
    MAXIMUM_NUMBER_OF_AUTO_MOD_RULES: 30071,
    MAXIMUM_NUMBER_OF_AUTO_MOD_ACTIONS: 30072,
    MAXIMUM_NUMBER_OF_AUTO_MOD_ACTION_METADATA: 30073,
    
    // Rate limiting
    RATE_LIMITED: 429,
    
    // Other common errors
    UNKNOWN_MESSAGE: 10008,
    UNKNOWN_CHANNEL: 10003,
    UNKNOWN_GUILD: 10004,
    UNKNOWN_USER: 10013,
    UNKNOWN_ROLE: 10011,
    UNKNOWN_EMOJI: 10014,
    UNKNOWN_WEBHOOK: 10015,
    UNKNOWN_INTEGRATION: 10016,
    UNKNOWN_BAN: 10026,
    UNKNOWN_SKU: 10027,
    UNKNOWN_STORE_LISTING: 10028,
    UNKNOWN_ENTITLEMENT: 10029,
    UNKNOWN_APPLICATION: 10030,
    UNKNOWN_LOBBY: 10031,
    UNKNOWN_BRANCH: 10032,
    UNKNOWN_STORE_DIRECTORY_LAYOUT: 10033,
    UNKNOWN_REDISTRIBUTABLE: 10034,
    UNKNOWN_GIFT_CODE: 10038,
    UNKNOWN_TEMPLATE: 10057,
    UNKNOWN_DISCOVERABLE_SERVER_CATEGORY: 10059,
    UNKNOWN_STICKER: 10060,
    UNKNOWN_INTERACTION: 10062,
    UNKNOWN_APPLICATION_COMMAND: 10063,
    UNKNOWN_APPLICATION_COMMAND_PERMISSIONS: 10066,
    UNKNOWN_STAGE_INSTANCE: 10067,
    UNKNOWN_GUILD_MEMBER: 10007,
    UNKNOWN_GUILD_SCHEDULED_EVENT: 10059,
    UNKNOWN_THREAD: 10065,
    UNKNOWN_GUILD_SCHEDULED_EVENT_USER: 10070,
    UNKNOWN_AUTO_MOD_RULE: 10071,
    UNKNOWN_AUTO_MOD_ACTION: 10072,
    UNKNOWN_AUTO_MOD_ACTION_METADATA: 10073,
};

/**
 * User-friendly error messages for common Discord API errors
 */
const ERROR_MESSAGES = {
    [DiscordErrorCodes.MISSING_PERMISSIONS]: 'I lack the required permissions to perform this action.',
    [DiscordErrorCodes.MISSING_ACCESS]: 'I cannot access that channel or resource.',
    [DiscordErrorCodes.UNKNOWN_INTERACTION]: 'This interaction has expired or is unknown.',
    [DiscordErrorCodes.INTERACTION_ALREADY_ACKNOWLEDGED]: 'This interaction has already been responded to.',
    [DiscordErrorCodes.INVALID_FORM_BODY]: 'Invalid request data sent to Discord.',
    [DiscordErrorCodes.RATE_LIMITED]: 'Rate limited by Discord. Please try again later.',
    [DiscordErrorCodes.UNKNOWN_CHANNEL]: 'The channel was not found.',
    [DiscordErrorCodes.UNKNOWN_GUILD]: 'The server was not found.',
    [DiscordErrorCodes.UNKNOWN_USER]: 'The user was not found.',
    [DiscordErrorCodes.UNKNOWN_ROLE]: 'The role was not found.',
    [DiscordErrorCodes.UNKNOWN_MESSAGE]: 'The message was not found.',
    [DiscordErrorCodes.UNKNOWN_EMOJI]: 'The emoji was not found.',
    [DiscordErrorCodes.UNKNOWN_WEBHOOK]: 'The webhook was not found.',
    [DiscordErrorCodes.UNKNOWN_INTEGRATION]: 'The integration was not found.',
    [DiscordErrorCodes.UNKNOWN_BAN]: 'The ban was not found.',
    [DiscordErrorCodes.UNKNOWN_APPLICATION_COMMAND]: 'The command was not found.',
    [DiscordErrorCodes.UNKNOWN_THREAD]: 'The thread was not found.',
    [DiscordErrorCodes.UNKNOWN_STAGE_INSTANCE]: 'The stage instance was not found.',
    [DiscordErrorCodes.UNKNOWN_GUILD_MEMBER]: 'The member was not found.',
    [DiscordErrorCodes.UNKNOWN_GUILD_SCHEDULED_EVENT]: 'The scheduled event was not found.',
    [DiscordErrorCodes.UNKNOWN_AUTO_MOD_RULE]: 'The auto-mod rule was not found.',
};

/**
 * Handles a Discord API error and returns a user-friendly message
 * @param {Error} error - The error thrown by Discord.js
 * @param {Object} options - Additional options
 * @param {boolean} options.silent - If true, returns null for unknown interaction errors
 * @returns {string|null} User-friendly error message, or null if should be silent
 */
export function handleDiscordError(error, options = {}) {
    const { silent = false } = options;
    
    // Check if it's a DiscordAPIError
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return 'An unexpected error occurred.';
    }
    
    const code = error.code;
    
    // Silent handling for unknown interaction (already acknowledged or expired)
    if (code === DiscordErrorCodes.UNKNOWN_INTERACTION && silent) {
        return null;
    }
    
    // Return user-friendly message if we have one
    if (ERROR_MESSAGES[code]) {
        return ERROR_MESSAGES[code];
    }
    
    // For validation errors (50035), try to extract details
    if (code === DiscordErrorCodes.INVALID_FORM_BODY && error.errors) {
        const details = extractValidationErrors(error.errors);
        return `Invalid input: ${details}`;
    }
    
    // For rate limiting, include retry-after if available
    if (code === DiscordErrorCodes.RATE_LIMITED && error.retryAfter) {
        return `Rate limited. Please try again in ${Math.ceil(error.retryAfter / 1000)} seconds.`;
    }
    
    // Generic fallback
    return `Discord API error (${code}): ${error.message || 'Unknown error'}`;
}

/**
 * Extracts validation error details from Discord's 50035 error
 * @param {Object} errors - Discord validation errors object
 * @returns {string} Human-readable error details
 */
function extractValidationErrors(errors) {
    const messages = [];
    
    for (const [field, fieldErrors] of Object.entries(errors)) {
        if (Array.isArray(fieldErrors)) {
            for (const fieldError of fieldErrors) {
                if (fieldError._errors && Array.isArray(fieldError._errors)) {
                    for (const err of fieldError._errors) {
                        messages.push(`${field}: ${err.message || err.code}`);
                    }
                }
            }
        }
    }
    
    return messages.length > 0 ? messages.join('; ') : 'Validation failed';
}

/**
 * Creates a standardized error embed for Discord interactions
 * @param {string} message - Error message
 * @param {string} [title='Error'] - Embed title
 * @returns {EmbedBuilder} Error embed
 */
export function createErrorEmbed(message, title = 'Error') {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(title)
        .setDescription(message)
        .setTimestamp();
}

/**
 * Safely replies to an interaction with error handling
 * @param {Interaction} interaction - Discord interaction
 * @param {string} message - Error message
 * @param {boolean} ephemeral - Whether reply should be ephemeral
 * @returns {Promise<boolean>} True if reply succeeded
 */
export async function safeReply(interaction, message, ephemeral = true) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ 
                embeds: [createErrorEmbed(message)],
                components: [] 
            });
        } else {
            await interaction.reply({ 
                embeds: [createErrorEmbed(message)],
                flags: ephemeral ? MessageFlags.Ephemeral : undefined 
            });
        }
        return true;
    } catch (error) {
        // If we can't reply, the interaction might be unknown/expired
        if (error.code === DiscordErrorCodes.UNKNOWN_INTERACTION) {
            return false;
        }
        console.error('[ERROR] Failed to send error reply:', error);
        return false;
    }
}

/**
 * Safely follows up on an interaction with error handling
 * @param {Interaction} interaction - Discord interaction
 * @param {string} message - Error message
 * @param {boolean} ephemeral - Whether followup should be ephemeral
 * @returns {Promise<boolean>} True if followup succeeded
 */
export async function safeFollowUp(interaction, message, ephemeral = true) {
    try {
        await interaction.followUp({ 
            embeds: [createErrorEmbed(message)],
            flags: ephemeral ? MessageFlags.Ephemeral : undefined 
        });
        return true;
    } catch (error) {
        if (error.code === DiscordErrorCodes.UNKNOWN_INTERACTION) {
            return false;
        }
        console.error('[ERROR] Failed to send error followup:', error);
        return false;
    }
}

export default {
    DiscordErrorCodes,
    handleDiscordError,
    createErrorEmbed,
    safeReply,
    safeFollowUp
};