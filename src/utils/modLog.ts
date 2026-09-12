// Mod Log Utility
// Sends moderation action logs to a designated channel
import { logger } from '../utils/logger.js';
import { EmbedBuilder, Guild, GuildMember, TextChannel } from 'discord.js';
import { config } from '../config/config.js';

interface ModLogOptions {
    action: string;
    target: { tag: string; id: string; displayAvatarURL(): string };
    moderator: { tag: string; id: string };
    reason: string;
    duration?: string;
    extra?: Record<string, unknown>;
}

/**
 * Sends a moderation log entry to the mod-logs channel
 * @param guild - The Discord guild
 * @param options - Log options
 * @param options.action - The moderation action (kick, ban, mute, etc.)
 * @param options.target - The target user
 * @param options.moderator - The moderator who performed the action
 * @param options.reason - The reason for the action
 * @param options.duration - Duration (for mutes)
 * @param options.extra - Extra fields to add
 */
export async function sendModLog(guild: Guild, options: ModLogOptions): Promise<void> {
    // Check if mod logging is enabled
    if (!config.moderation.logModerationActions) {
        return;
    }

    try {
        // Find the mod-logs channel
        const logChannel = guild.channels.cache.find(
            channel => channel.name === config.moderation.moderationLogChannel
        ) as TextChannel | undefined;

        if (!logChannel) {
            logger.info(`[WARNING] Mod-log channel "${config.moderation.moderationLogChannel}" not found in guild ${guild.name}`);
            return;
        }

        // Define action colors
        const actionColors: Record<string, number> = {
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
            .setColor(actionColors[options.action.toLowerCase()] ?? actionColors['default'] ?? 0x7289DA)
            .setTitle(`[MODERATION] ${options.action.toUpperCase()}`)
            .setThumbnail(options.target.displayAvatarURL())
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
                text: 'Case logged at',
                iconURL: guild.iconURL() ?? undefined
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
        logger.info({ msg: `[MOD-LOG] ${options.action} logged for ${options.target.tag}` });

    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Failed to send mod log' });
    }
}

/**
 * Helper to fetch a member with fallback to API fetch
 * @param guild - The Discord guild
 * @param userId - The user ID to fetch
 * @returns The guild member or null
 */
export async function fetchMember(guild: Guild, userId: string): Promise<GuildMember | null> {
    try {
        // First try cache
        let member = guild.members.cache.get(userId) ?? undefined;
        
        // If not in cache, fetch from API
        if (!member) {
            member = await guild.members.fetch(userId).catch(() => undefined);
        }
        
        return member ?? null;
    } catch (error) {
        logger.error({ err: error as Error, msg: `[ERROR] Failed to fetch member ${userId}` });
        return null;
    }
}