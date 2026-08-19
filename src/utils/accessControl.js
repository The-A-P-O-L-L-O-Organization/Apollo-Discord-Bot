// Centralized Access Control Utility
// Provides shared owner-only and permission checks for commands

import { EmbedBuilder, PermissionsBitField } from 'discord.js';

let _ownerIds = null;

/**
 * Gets the list of bot owner IDs from environment variable
 * Caches the result for performance
 * @returns {string[]} Array of owner user IDs
 */
export function getOwnerIds() {
    if (_ownerIds === null) {
        _ownerIds = (process.env.OWNER_IDS || '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);
    }
    return _ownerIds;
}

/**
 * Clears the cached owner IDs (useful for testing)
 */
export function clearOwnerIdsCache() {
    _ownerIds = null;
}

/**
 * Checks if a user is a bot owner
 * @param {string} userId - Discord user ID to check
 * @returns {boolean} True if user is a bot owner
 */
export function isOwner(userId) {
    const ownerIds = getOwnerIds();
    return ownerIds.length > 0 && ownerIds.includes(userId);
}

/**
 * Checks if an interaction user is a bot owner
 * @param {Interaction} interaction - Discord interaction
 * @returns {boolean} True if interaction user is a bot owner
 */
export function isOwnerInteraction(interaction) {
    return isOwner(interaction.user.id);
}

/**
 * Creates a standardized access denied embed
 * @param {string} [message] - Custom denial message
 * @returns {EmbedBuilder} Access denied embed
 */
export function createAccessDeniedEmbed(message = 'Only bot owners can use this command.') {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('[ERROR] Access Denied')
        .setDescription(message)
        .setTimestamp();
}

/**
 * Middleware function to check owner access for slash commands
 * Returns an error reply if not authorized, null if authorized
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} [options] - Options
 * @param {boolean} [options.ephemeral=true] - Whether reply should be ephemeral
 * @param {string} [options.customMessage] - Custom denial message
 * @returns {Promise<InteractionReplyOptions|null>} Reply options if denied, null if allowed
 */
export async function requireOwner(interaction, options = {}) {
    const { ephemeral = true, customMessage } = options;
    
    if (!isOwnerInteraction(interaction)) {
        return {
            embeds: [createAccessDeniedEmbed(customMessage)],
            ephemeral
        };
    }
    return null;
}

/**
 * Higher-order function that wraps a command execute function with owner check
 * @param {Function} executeFn - The command execute function
 * @param {Object} [options] - Options
 * @param {boolean} [options.ephemeral=true] - Whether denial reply should be ephemeral
 * @param {string} [options.customMessage] - Custom denial message
 * @returns {Function} Wrapped execute function
 */
export function withOwnerCheck(executeFn, options = {}) {
    return async(interaction, ...args) => {
        const denial = await requireOwner(interaction, options);
        if (denial) {
            if (interaction.replied || interaction.deferred) {
                return interaction.editReply(denial);
            }
            return interaction.reply(denial);
        }
        return executeFn(interaction, ...args);
    };
}

/**
 * Checks if a member has a specific permission
 * @param {GuildMember} member - Discord guild member
 * @param {bigint|string} permission - Permission flag (e.g., PermissionsBitField.Flags.BanMembers)
 * @returns {boolean} True if member has permission
 */
export function hasPermission(member, permission) {
    return member.permissions.has(permission);
}

/**
 * Checks if a member has any of the specified permissions
 * @param {GuildMember} member - Discord guild member
 * @param {bigint[]|string[]} permissions - Array of permission flags
 * @returns {boolean} True if member has any of the permissions
 */
export function hasAnyPermission(member, permissions) {
    return permissions.some(p => member.permissions.has(p));
}

/**
 * Checks if a member has all of the specified permissions
 * @param {GuildMember} member - Discord guild member
 * @param {bigint[]|string[]} permissions - Array of permission flags
 * @returns {boolean} True if member has all permissions
 */
export function hasAllPermissions(member, permissions) {
    return permissions.every(p => member.permissions.has(p));
}

/**
 * Creates a permission denied embed
 * @param {string} [permissionName] - Name of required permission
 * @returns {EmbedBuilder} Permission denied embed
 */
export function createPermissionDeniedEmbed(permissionName = 'the required permission') {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('[ERROR] Permission Denied')
        .setDescription(`You need ${permissionName} to use this command.`)
        .setTimestamp();
}

/**
 * Middleware to check specific permission for slash commands
 * @param {Interaction} interaction - Discord interaction
 * @param {bigint|string} permission - Required permission flag
 * @param {Object} [options] - Options
 * @param {boolean} [options.ephemeral=true] - Whether reply should be ephemeral
 * @returns {Promise<InteractionReplyOptions|null>} Reply options if denied, null if allowed
 */
export async function requirePermission(interaction, permission, options = {}) {
    const { ephemeral = true } = options;
    
    if (!interaction.guild || !interaction.member) {
        return {
            embeds: [createPermissionDeniedEmbed('guild context')],
            ephemeral
        };
    }
    
    if (!hasPermission(interaction.member, permission)) {
        const permName = Object.entries(PermissionsBitField.Flags)
            .find(([, v]) => v === permission)?.[0] || 'the required permission';
        return {
            embeds: [createPermissionDeniedEmbed(permName)],
            ephemeral
        };
    }
    return null;
}

export default {
    getOwnerIds,
    clearOwnerIdsCache,
    isOwner,
    isOwnerInteraction,
    createAccessDeniedEmbed,
    requireOwner,
    withOwnerCheck,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    createPermissionDeniedEmbed,
    requirePermission
};