import { getGuildData, setGuildData } from './db.js';

// In-memory cache for batching analytics before writing to database
export interface AnalyticsCache {
    commands: Map<string, Map<string, Map<string, number>>>;
    messages: Map<string, Map<string, Map<string, number>>>;
    violations: Map<string, Map<string, number>>;
    modActions: Map<string, Map<string, Map<string, number>>>;
}

export const analyticsCache: AnalyticsCache = {
    commands: new Map(),      // guildId -> Map(commandName -> Map(userId -> count))
    messages: new Map(),      // guildId -> Map(channelId -> Map(userId -> count))
    violations: new Map(),    // guildId -> Map(type -> count)
    modActions: new Map()    // guildId -> Map(moderatorId -> Map(action -> count))
};

/**
 * Gets a date string in YYYY-MM-DD format
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Date string
 */
export function getDateString(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0] ?? '';
}

/**
 * Gets an hour string in YYYY-MM-DD:HH format
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Hour string
 */
export function getHourString(timestamp: number): string {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const hour = date.getUTCHours().toString().padStart(2, '0');
    return `${dateStr}:${hour}`;
}

/**
 * Tracks a command execution
 * @param {string} guildId - Guild ID
 * @param {string} commandName - Command name
 * @param {string} userId - User ID who executed the command
 */
export function trackCommand(guildId: string, commandName: string, userId: string): void {
    if (!analyticsCache.commands.has(guildId)) {
        analyticsCache.commands.set(guildId, new Map());
    }

    const guildCommands = analyticsCache.commands.get(guildId)!;

    if (!guildCommands.has(commandName)) {
        guildCommands.set(commandName, new Map());
    }

    const commandUsers = guildCommands.get(commandName)!;
    const currentCount = commandUsers.get(userId) ?? 0;
    commandUsers.set(userId, currentCount + 1);
}

/**
 * Tracks a message
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID who sent the message
 */
export function trackMessage(guildId: string, channelId: string, userId: string): void {
    if (!analyticsCache.messages.has(guildId)) {
        analyticsCache.messages.set(guildId, new Map());
    }

    const guildMessages = analyticsCache.messages.get(guildId)!;

    if (!guildMessages.has(channelId)) {
        guildMessages.set(channelId, new Map());
    }

    const channelUsers = guildMessages.get(channelId)!;
    const currentCount = channelUsers.get(userId) ?? 0;
    channelUsers.set(userId, currentCount + 1);
}

/**
 * Tracks an automod violation
 * @param {string} guildId - Guild ID
 * @param {string} violationType - Type of violation
 */
export function trackViolation(guildId: string, violationType: string): void {
    if (!analyticsCache.violations.has(guildId)) {
        analyticsCache.violations.set(guildId, new Map());
    }

    const guildViolations = analyticsCache.violations.get(guildId)!;
    const currentCount = guildViolations.get(violationType) ?? 0;
    guildViolations.set(violationType, currentCount + 1);
}

/**
 * Tracks a moderator action
 * @param {string} guildId - Guild ID
 * @param {string} moderatorId - Moderator user ID
 * @param {string} action - Action type (warn, ban, kick, mute, etc.)
 */
export function trackModAction(guildId: string, moderatorId: string, action: string): void {
    if (!analyticsCache.modActions.has(guildId)) {
        analyticsCache.modActions.set(guildId, new Map());
    }

    const guildModActions = analyticsCache.modActions.get(guildId)!;

    if (!guildModActions.has(moderatorId)) {
        guildModActions.set(moderatorId, new Map());
    }

    const moderatorActions = guildModActions.get(moderatorId)!;
    const currentCount = moderatorActions.get(action) ?? 0;
    moderatorActions.set(action, currentCount + 1);
}

/**
 * Tracks member join/leave
 * @param {string} guildId - Guild ID
 * @param {boolean} isJoin - True for join, false for leave
 * @param {number} totalMembers - Current total member count
 */
export async function trackMemberChange(guildId: string, isJoin: boolean, totalMembers: number): Promise<void> {
    const today = getDateString(Date.now());
    const data = await getGuildData('analytics-members', guildId) as Record<string, {
        date: string;
        joinCount: number;
        leaveCount: number;
        totalMembers: number;
    }>;

    const key = `${today}:${Date.now()}`;
    const isNew = !data[key];
    data[key] ??= {
        date: today,
        joinCount: isJoin ? 1 : 0,
        leaveCount: isJoin ? 0 : 1,
        totalMembers: totalMembers
    };
    if (!isNew) {
        if (isJoin) {
            data[key].joinCount++;
        } else {
            data[key].leaveCount++;
        }
        data[key].totalMembers = totalMembers;
    }

    await setGuildData('analytics-members', guildId, data);
}
