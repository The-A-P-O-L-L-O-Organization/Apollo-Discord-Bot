// Mod Log Utility
// Sends moderation action logs to a designated channel
import { logger } from '../utils/logger.js';
import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { getCommonT } from './discordErrors.js';

export interface ModLogOptions {
    action: string;
    target: { tag: string; id: string; displayAvatarURL(): string | null };
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
export async function sendModLog(guild: Guild, options: ModLogOptions, locale = 'en-US'): Promise<void> {
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

        const t = getCommonT(locale);

        // Create the embed
        const logEmbed = new EmbedBuilder()
            .setColor(actionColors[options.action.toLowerCase()] ?? actionColors['default'] ?? 0x7289DA)
            .setTitle(t('modlog.title', { action: options.action.toUpperCase(), defaultValue: `[MODERATION] ${options.action.toUpperCase()}` }))
            .setThumbnail(options.target.displayAvatarURL())
            .addFields(
                {
                    name: t('modlog.target', { defaultValue: 'Target User' }),
                    value: `${options.target.tag}\n\`${options.target.id}\``,
                    inline: true
                },
                {
                    name: t('modlog.moderator', { defaultValue: 'Moderator' }),
                    value: `${options.moderator.tag}\n\`${options.moderator.id}\``,
                    inline: true
                },
                {
                    name: t('modlog.reason', { defaultValue: 'Reason' }),
                    value: options.reason || t('modlog.defaultReason', { defaultValue: 'No reason provided' }),
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

export interface LocaleChangeContext {
    guildId: string;
    actor: { id: string; tag: string };
    oldLocale: string;
    newLocale: string;
}

export function logLocaleChange(context: LocaleChangeContext, locale = 'en-US'): void {
    const t = getCommonT(locale);
    const embed = new EmbedBuilder()
        .setColor(0x7289DA)
        .setTitle(t('modlog.localeChanged', { defaultValue: 'Server Language Changed' }))
        .addFields(
            {
                name: t('modlog.localeChangedBy', { defaultValue: 'Changed by' }),
                value: `${context.actor.tag}\n\`${context.actor.id}\``,
                inline: true
            },
            {
                name: t('modlog.previousLocale', { defaultValue: 'Previous' }),
                value: context.oldLocale,
                inline: true
            },
            {
                name: t('modlog.newLocale', { defaultValue: 'New' }),
                value: context.newLocale,
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: t('modlog.localeFooter', { defaultValue: 'Future bot messages in this server will use the new language.' }) });
    logger.info({
        msg: `[MOD-LOG] locale changed in ${context.guildId}: ${context.oldLocale} -> ${context.newLocale}`,
        embed: embed.toJSON()
    });
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
        member ??= await guild.members.fetch(userId).catch(() => undefined);

        return member ?? null;
    } catch (error) {
        logger.error({ err: error as Error, msg: `[ERROR] Failed to fetch member ${userId}` });
        return null;
    }
}