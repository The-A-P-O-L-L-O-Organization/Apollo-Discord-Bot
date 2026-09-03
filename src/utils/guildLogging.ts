// Guild logging utilities
// Handles fetching guild log config and sending log events

import type { EmbedBuilder } from 'discord.js';

/**
 * Gets logging configuration for a guild
 * @param guildId - The guild ID
 * @returns Logging configuration
 */
export async function getLoggingConfig(guildId: string): Promise<{
    channelId: string | null;
    events: Record<string, boolean>;
}> {
    // Import db.js dynamically since it's not yet migrated
    const { getGuildData } = await import('./db.js');
    const guildConfig = await getGuildData('logging', guildId) as Record<string, unknown> | null;
    if (!guildConfig) {
        return { channelId: null, events: {} };
    }
    const events = (guildConfig['events'] as Record<string, boolean>) || {};
    return {
        channelId: (guildConfig['channelId'] as string) ?? null,
        events: {
            messageDelete: events['messageDelete'] ?? false,
            messageEdit: events['messageEdit'] ?? false,
            memberJoin: events['memberJoin'] ?? false,
            memberLeave: events['memberLeave'] ?? false,
            roleChanges: events['roleChanges'] ?? false,
            voiceChanges: events['voiceChanges'] ?? false
        }
    };
}

/**
 * Checks if an event is enabled for logging
 * @param guildId - The guild ID
 * @param eventName - The event name
 * @returns Whether the event is enabled
 */
export async function isEventEnabled(guildId: string, eventName: string): Promise<boolean> {
    const cfg = await getLoggingConfig(guildId);
    return !!(cfg.channelId && cfg.events[eventName]);
}

/**
 * Gets the logging channel for a guild
 * @param guild - The Discord guild
 * @returns The logging channel or null
 */
export async function getLogChannel(guild: { id: string; channels: { fetch: (id: string) => Promise<{ isTextBased: () => boolean; send: (options: { embeds: EmbedBuilder[] }) => Promise<void> } | null> } }): Promise<{ isTextBased: () => boolean; send: (options: { embeds: EmbedBuilder[] }) => Promise<void> } | null> {
    const cfg = await getLoggingConfig(guild.id);

    if (!cfg.channelId) { return null; }

    try {
        const channel = await guild.channels.fetch(cfg.channelId);
        if (channel && channel.isTextBased()) {
            return channel;
        }
    } catch (error) {
        // Import logger dynamically to avoid circular dependency
        const { logger } = await import('./logger.js');
        logger.error({ err: error, msg: `[ERROR] Could not fetch log channel for ${guild.id}` });
    }

    return null;
}

/**
 * Logs an event to the server's log channel
 * @param guild - The Discord guild
 * @param eventType - The type of event
 * @param embed - The embed to send
 */
export async function logEvent(guild: { id: string; channels: { fetch: (id: string) => Promise<{ isTextBased: () => boolean; send: (options: { embeds: EmbedBuilder[] }) => Promise<void> } | null> } }, eventType: string, embed: EmbedBuilder): Promise<void> {
    if (!(await isEventEnabled(guild.id, eventType))) { return; }

    const logChannel = await getLogChannel(guild);
    if (!logChannel) { return; }

    try {
        await logChannel.send({ embeds: [embed] });
    } catch (error) {
        const { logger } = await import('./logger.js');
        logger.error({ err: error, msg: `[ERROR] Failed to send log to ${guild.id}` });
    }
}