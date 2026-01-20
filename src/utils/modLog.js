// Mod Log Utility
// Sends moderation action logs to a designated channel

import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

/**
 * Sends a moderation log entry to the mod-logs channel
 * @param {Guild} guild - The Discord guild
 * @param {Object} options - Log options
 * @param {string} options.action - The moderation action (kick, ban, mute, etc.)
 * @param {User} options.target - The target user
 * @param {User} options.moderator - The moderator who performed the action
 * @param {string} options.reason - The reason for the action
 * @param {string} [options.duration] - Duration (for mutes)
 * @param {Object} [options.extra] - Extra fields to add
 */
export async function sendModLog(guild, options) {
    // Check if mod logging is enabled
    if (!config.moderation.logModerationActions) {
        return;
    }

    try {
        // Find the mod-logs channel
        const logChannel = guild.channels.cache.find(
            channel => channel.name === config.moderation.moderationLogChannel
        );

        if (!logChannel) {
            console.log(`[WARNING] Mod-log channel "${config.moderation.moderationLogChannel}" not found in guild ${guild.name}`);
            return;
        }

        // Define action colors
        const actionColors = {
            kick: 0xFFA500,    // Orange
            ban: 0xFF0000,     // Red
            unban: 0x00FF00,   // Green
            mute: 0xFFFF00,    // Yellow
            unmute: 0x00FF00,  // Green
            purge: 0x0099FF,   // Blue
            warn: 0xFFFF00,    // Yellow
            default: 0x7289DA  // Discord Blurple
        };

        // Create the embed
        const logEmbed = new EmbedBuilder()
            .setColor(actionColors[options.action.toLowerCase()] || actionColors.default)
            .setTitle(`[MODERATION] ${options.action.toUpperCase()}`)
            .setThumbnail(options.target.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: 'Target User',
                    value: `${options.target.tag}\n\`${options.target.id}\``,
                    inline: true
                },
                {
                    name: 'Moderator',
                    value: `${options.moderator.tag}\n\`${options.moderator.id}\``,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: options.reason || config.moderation.defaultReason,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({
                text: `Case logged at`,
                iconURL: guild.iconURL({ dynamic: true })
            });

        // Add duration field for mutes
        if (options.duration) {
            logEmbed.addFields({
                name: 'Duration',
                value: options.duration,
                inline: true
            });
        }

        // Add extra fields if provided
        if (options.extra) {
            for (const [name, value] of Object.entries(options.extra)) {
                logEmbed.addFields({
                    name,
                    value: String(value),
                    inline: true
                });
            }
        }

        // Send the log
        await logChannel.send({ embeds: [logEmbed] });
        console.log(`[MOD-LOG] ${options.action} logged for ${options.target.tag}`);

    } catch (error) {
        console.error('[ERROR] Failed to send mod log:', error);
    }
}

/**
 * Helper to fetch a member with fallback to API fetch
 * @param {Guild} guild - The Discord guild
 * @param {string} userId - The user ID to fetch
 * @returns {Promise<GuildMember|null>} The guild member or null
 */
export async function fetchMember(guild, userId) {
    try {
        // First try cache
        let member = guild.members.cache.get(userId);
        
        // If not in cache, fetch from API
        if (!member) {
            member = await guild.members.fetch(userId).catch(() => null);
        }
        
        return member;
    } catch (error) {
        console.error(`[ERROR] Failed to fetch member ${userId}:`, error);
        return null;
    }
}
