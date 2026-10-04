import { getGuildData } from './db.js';
import { getDateString, getHourString } from './analyticsCache.js';

/**
 * Gets command usage statistics for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to look back (default: 7)
 * @returns {Object} Command statistics
 */
export async function getCommandStats(guildId: string, days = 7): Promise<{
    byCommand: { name: string; count: number }[];
    byUser: { userId: string; count: number }[];
}> {
    const data = await getGuildData('analytics-commands', guildId) as Record<string, {
        date: string;
        commandName: string;
        userId: string;
        count: number;
    }>;
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));

    const commandCounts = new Map<string, number>();
    const userCounts = new Map<string, number>();

    for (const key in data) {
        const entry = data[key];
        if (!entry) {continue;}
        if (entry.date >= cutoffDate) {
            // Count by command
            const cmdCount = commandCounts.get(entry.commandName) ?? 0;
            commandCounts.set(entry.commandName, cmdCount + entry.count);

            // Count by user
            const usrCount = userCounts.get(entry.userId) ?? 0;
            userCounts.set(entry.userId, usrCount + entry.count);
        }
    }

    return {
        byCommand: Array.from(commandCounts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count),
        byUser: Array.from(userCounts.entries())
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count)
    };
}

/**
 * Gets message activity statistics for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to look back (default: 7)
 * @returns {Object} Message statistics
 */
export async function getMessageStats(guildId: string, days = 7): Promise<{
    byChannel: { channelId: string; count: number }[];
    byUser: { userId: string; count: number }[];
    byHour: { hour: string; count: number }[];
}> {
    const data = await getGuildData('analytics-messages', guildId) as Record<string, {
        hour: string;
        channelId: string;
        userId: string;
        count: number;
    }>;
    const cutoffHour = getHourString(Date.now() - (days * 24 * 60 * 60 * 1000));

    const channelCounts = new Map<string, number>();
    const userCounts = new Map<string, number>();
    const hourCounts = new Map<string, number>();

    for (const key in data) {
        const entry = data[key];
        if (!entry) {continue;}
        if (entry.hour >= cutoffHour) {
            // Count by channel
            const chnCount = channelCounts.get(entry.channelId) ?? 0;
            channelCounts.set(entry.channelId, chnCount + entry.count);

            // Count by user
            const usrCount = userCounts.get(entry.userId) ?? 0;
            userCounts.set(entry.userId, usrCount + entry.count);

            // Count by hour
            const hrCount = hourCounts.get(entry.hour) ?? 0;
            hourCounts.set(entry.hour, hrCount + entry.count);
        }
    }

    return {
        byChannel: Array.from(channelCounts.entries())
            .map(([channelId, count]) => ({ channelId, count }))
            .sort((a, b) => b.count - a.count),
        byUser: Array.from(userCounts.entries())
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count),
        byHour: Array.from(hourCounts.entries())
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => a.hour.localeCompare(b.hour))
    };
}

/**
 * Gets violation statistics for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Array} Violation statistics
 */
export async function getViolationStats(guildId: string, days = 30): Promise<{ type: string; count: number }[]> {
    const data = await getGuildData('analytics-violations', guildId) as Record<string, {
        date: string;
        type: string;
        count: number;
    }>;
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));

    const typeCounts = new Map<string, number>();

    for (const key in data) {
        const entry = data[key];
        if (!entry) {continue;}
        if (entry.date >= cutoffDate) {
            const count = typeCounts.get(entry.type) ?? 0;
            typeCounts.set(entry.type, count + entry.count);
        }
    }

    return Array.from(typeCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Gets moderator action statistics for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Object} Moderator statistics
 */
export async function getModActionStats(guildId: string, days = 30): Promise<{
    byModerator: { moderatorId: string; count: number }[];
    byAction: { action: string; count: number }[];
}> {
    const data = await getGuildData('analytics-modactions', guildId) as Record<string, {
        date: string;
        moderatorId: string;
        action: string;
        count: number;
    }>;
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));

    const moderatorCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();

    for (const key in data) {
        const entry = data[key];
        if (!entry) {continue;}
        if (entry.date >= cutoffDate) {
            // Count by moderator
            const modCount = moderatorCounts.get(entry.moderatorId) ?? 0;
            moderatorCounts.set(entry.moderatorId, modCount + entry.count);

            // Count by action type
            const actCount = actionCounts.get(entry.action) ?? 0;
            actionCounts.set(entry.action, actCount + entry.count);
        }
    }

    return {
        byModerator: Array.from(moderatorCounts.entries())
            .map(([moderatorId, count]) => ({ moderatorId, count }))
            .sort((a, b) => b.count - a.count),
        byAction: Array.from(actionCounts.entries())
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count)
    };
}

/**
 * Gets member growth statistics for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Array} Member growth data
 */
export async function getMemberGrowthStats(guildId: string, days = 30): Promise<Record<string, unknown>[]> {
    const data = await getGuildData('analytics-members', guildId) as Record<string, Record<string, unknown>>;
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));

    const growth: Record<string, unknown>[] = [];

    for (const key in data) {
        // Extract the date from the key: the part before the first colon
        const entryDate = key.split(':')[0] ?? '';
        if (entryDate >= cutoffDate) {
            const entry = data[key];
            if (entry) {
                growth.push(entry);
            }
        }
    }

    return growth.sort((a, b) => String((a['date'] as string | undefined) ?? '').localeCompare(String((b['date'] as string | undefined) ?? '')));
}
