// Analytics Collector
// Background service for collecting and aggregating analytics data

import { getGuildData, setGuildData, getUserData, setUserData } from './db.js';

// In-memory cache for batching analytics before writing to database
const analyticsCache = {
    commands: new Map(),      // guildId -> Map(commandName -> Map(userId -> count))
    messages: new Map(),      // guildId -> Map(channelId -> Map(userId -> count))
    violations: new Map(),    // guildId -> Map(type -> count)
    modActions: new Map()    // guildId -> Map(moderatorId -> Map(action -> count))
};

// Batch write interval (60 seconds)
const BATCH_INTERVAL = 60 * 1000;
let batchIntervalId = null;

// Data retention period (90 days)
const RETENTION_DAYS = 90;

// Performance stats
const performanceStats = {
    flushesPerformed: 0,
    cleanupsPerformed: 0,
    totalFlushTime: 0,
    totalCleanupTime: 0,
    recordsProcessed: 0,
    recordsDeleted: 0,
    errors: 0
};

/**
 * Initializes the analytics collector
 * @param {Client} client - Discord client
 */
export function initAnalyticsCollector(client) {
    console.log('[ANALYTICS] Starting analytics collector...');
    
    // Start the batch write interval
    batchIntervalId = setInterval(() => {
        flushAnalyticsCache();
    }, BATCH_INTERVAL);
    
    // Run cleanup on startup
    cleanupOldAnalytics(client);
    
    // Schedule daily cleanup
    setInterval(() => {
        cleanupOldAnalytics(client);
    }, 24 * 60 * 60 * 1000); // Once per day
    
    console.log('[ANALYTICS] Analytics collector started successfully');
}

/**
 * Stops the analytics collector
 */
export function stopAnalyticsCollector() {
    console.log('[ANALYTICS] Stopping analytics collector...');
    
    // Flush any remaining cached data
    flushAnalyticsCache();
    
    // Clear the interval
    if (batchIntervalId) {
        clearInterval(batchIntervalId);
        batchIntervalId = null;
    }
    
    console.log('[ANALYTICS] Analytics collector stopped');
}

/**
 * Tracks a command execution
 * @param {string} guildId - Guild ID
 * @param {string} commandName - Command name
 * @param {string} userId - User ID who executed the command
 */
export function trackCommand(guildId, commandName, userId) {
    if (!analyticsCache.commands.has(guildId)) {
        analyticsCache.commands.set(guildId, new Map());
    }
    
    const guildCommands = analyticsCache.commands.get(guildId);
    
    if (!guildCommands.has(commandName)) {
        guildCommands.set(commandName, new Map());
    }
    
    const commandUsers = guildCommands.get(commandName);
    const currentCount = commandUsers.get(userId) || 0;
    commandUsers.set(userId, currentCount + 1);
}

/**
 * Tracks a message
 * @param {string} guildId - Guild ID
 * @param {string} channelId - Channel ID
 * @param {string} userId - User ID who sent the message
 */
export function trackMessage(guildId, channelId, userId) {
    if (!analyticsCache.messages.has(guildId)) {
        analyticsCache.messages.set(guildId, new Map());
    }
    
    const guildMessages = analyticsCache.messages.get(guildId);
    
    if (!guildMessages.has(channelId)) {
        guildMessages.set(channelId, new Map());
    }
    
    const channelUsers = guildMessages.get(channelId);
    const currentCount = channelUsers.get(userId) || 0;
    channelUsers.set(userId, currentCount + 1);
}

/**
 * Tracks an automod violation
 * @param {string} guildId - Guild ID
 * @param {string} violationType - Type of violation
 */
export function trackViolation(guildId, violationType) {
    if (!analyticsCache.violations.has(guildId)) {
        analyticsCache.violations.set(guildId, new Map());
    }
    
    const guildViolations = analyticsCache.violations.get(guildId);
    const currentCount = guildViolations.get(violationType) || 0;
    guildViolations.set(violationType, currentCount + 1);
}

/**
 * Tracks a moderator action
 * @param {string} guildId - Guild ID
 * @param {string} moderatorId - Moderator user ID
 * @param {string} action - Action type (warn, ban, kick, mute, etc.)
 */
export function trackModAction(guildId, moderatorId, action) {
    if (!analyticsCache.modActions.has(guildId)) {
        analyticsCache.modActions.set(guildId, new Map());
    }
    
    const guildModActions = analyticsCache.modActions.get(guildId);
    
    if (!guildModActions.has(moderatorId)) {
        guildModActions.set(moderatorId, new Map());
    }
    
    const moderatorActions = guildModActions.get(moderatorId);
    const currentCount = moderatorActions.get(action) || 0;
    moderatorActions.set(action, currentCount + 1);
}

/**
 * Tracks member join/leave
 * @param {string} guildId - Guild ID
 * @param {boolean} isJoin - True for join, false for leave
 * @param {number} totalMembers - Current total member count
 */
export async function trackMemberChange(guildId, isJoin, totalMembers) {
    const today = getDateString(Date.now());
    const data = await getGuildData('analytics-members', guildId);
    
    if (!data[today]) {
        data[today] = {
            date: today,
            joinCount: 0,
            leaveCount: 0,
            totalMembers: totalMembers
        };
    }
    
    if (isJoin) {
        data[today].joinCount++;
    } else {
        data[today].leaveCount++;
    }
    
    data[today].totalMembers = totalMembers;
    
    await setGuildData('analytics-members', guildId, data);
}

/**
 * Flushes the analytics cache to the database
 */
async function flushAnalyticsCache() {
    const startTime = Date.now();
    
    try {
        const now = Date.now();
        const hour = getHourString(now);
        const date = getDateString(now);
        let recordsProcessed = 0;
        
        // Flush command analytics
        for (const [guildId, guildCommands] of analyticsCache.commands) {
            const data = await getGuildData('analytics-commands', guildId);
            
            for (const [commandName, users] of guildCommands) {
                for (const [userId, count] of users) {
                    const key = `${date}:${commandName}:${userId}`;
                    if (!data[key]) {
                        data[key] = {
                            date,
                            commandName,
                            userId,
                            count: 0
                        };
                    }
                    data[key].count += count;
                    recordsProcessed++;
                }
            }
            
            await setGuildData('analytics-commands', guildId, data);
        }
        analyticsCache.commands.clear();
        
        // Flush message analytics (hourly aggregation)
        for (const [guildId, guildMessages] of analyticsCache.messages) {
            const data = await getGuildData('analytics-messages', guildId);
            
            for (const [channelId, users] of guildMessages) {
                for (const [userId, count] of users) {
                    const key = `${hour}:${channelId}:${userId}`;
                    if (!data[key]) {
                        data[key] = {
                            hour,
                            channelId,
                            userId,
                            count: 0
                        };
                    }
                    data[key].count += count;
                    recordsProcessed++;
                }
            }
            
            await setGuildData('analytics-messages', guildId, data);
        }
        analyticsCache.messages.clear();
        
        // Flush violation analytics (daily aggregation)
        for (const [guildId, violations] of analyticsCache.violations) {
            const data = await getGuildData('analytics-violations', guildId);
            
            for (const [type, count] of violations) {
                const key = `${date}:${type}`;
                if (!data[key]) {
                    data[key] = {
                        date,
                        type,
                        count: 0
                    };
                }
                data[key].count += count;
                recordsProcessed++;
            }
            
            await setGuildData('analytics-violations', guildId, data);
        }
        analyticsCache.violations.clear();
        
        // Flush mod action analytics (daily aggregation)
        for (const [guildId, guildModActions] of analyticsCache.modActions) {
            const data = await getGuildData('analytics-modactions', guildId);
            
            for (const [moderatorId, actions] of guildModActions) {
                for (const [action, count] of actions) {
                    const key = `${date}:${moderatorId}:${action}`;
                    if (!data[key]) {
                        data[key] = {
                            date,
                            moderatorId,
                            action,
                            count: 0
                        };
                    }
                    data[key].count += count;
                    recordsProcessed++;
                }
            }
            
            await setGuildData('analytics-modactions', guildId, data);
        }
        analyticsCache.modActions.clear();
        
        // Update performance stats
        const flushTime = Date.now() - startTime;
        performanceStats.flushesPerformed++;
        performanceStats.totalFlushTime += flushTime;
        performanceStats.recordsProcessed += recordsProcessed;
        
        if (now % (5 * 60 * 1000) < BATCH_INTERVAL) {
            console.log(`[ANALYTICS] Flushed ${recordsProcessed} records in ${flushTime}ms`);
        }
        
    } catch (error) {
        performanceStats.errors++;
        console.error('[ANALYTICS] Error flushing analytics cache:', error);
    }
}

/**
 * Cleans up analytics data older than retention period
 * @param {Client} client - Discord client
 */
async function cleanupOldAnalytics(client) {
    const startTime = Date.now();
    
    try {
        const cutoffDate = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const cutoffDateStr = getDateString(cutoffDate);
        const cutoffHourStr = getHourString(cutoffDate);
        
        console.log(`[ANALYTICS] Cleaning up analytics older than ${cutoffDateStr}...`);
        
        let totalDeleted = 0;
        
        // Clean up each guild's analytics
        for (const guild of client.guilds.cache.values()) {
            const guildId = guild.id;
            
            // Clean commands
            const commands = await getGuildData('analytics-commands', guildId);
            for (const key in commands) {
                if (commands[key].date < cutoffDateStr) {
                    delete commands[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-commands', guildId, commands);
            
            // Clean messages
            const messages = await getGuildData('analytics-messages', guildId);
            for (const key in messages) {
                if (messages[key].hour < cutoffHourStr) {
                    delete messages[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-messages', guildId, messages);
            
            // Clean violations
            const violations = await getGuildData('analytics-violations', guildId);
            for (const key in violations) {
                if (violations[key].date < cutoffDateStr) {
                    delete violations[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-violations', guildId, violations);
            
            // Clean mod actions
            const modActions = await getGuildData('analytics-modactions', guildId);
            for (const key in modActions) {
                if (modActions[key].date < cutoffDateStr) {
                    delete modActions[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-modactions', guildId, modActions);
            
            // Clean members (keep all member data, it's already daily)
            const members = await getGuildData('analytics-members', guildId);
            for (const key in members) {
                if (key < cutoffDateStr) {
                    delete members[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-members', guildId, members);
        }
        
        // Update performance stats
        const cleanupTime = Date.now() - startTime;
        performanceStats.cleanupsPerformed++;
        performanceStats.totalCleanupTime += cleanupTime;
        performanceStats.recordsDeleted += totalDeleted;
        
        console.log(`[ANALYTICS] Cleanup complete. Deleted ${totalDeleted} old records in ${cleanupTime}ms.`);
        
    } catch (error) {
        performanceStats.errors++;
        console.error('[ANALYTICS] Error during analytics cleanup:', error);
    }
}

/**
 * Gets a date string in YYYY-MM-DD format
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Date string
 */
function getDateString(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
}

/**
 * Gets an hour string in YYYY-MM-DD:HH format
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Hour string
 */
function getHourString(timestamp) {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const hour = date.getUTCHours().toString().padStart(2, '0');
    return `${dateStr}:${hour}`;
}

/**
 * Gets command usage statistics for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to look back (default: 7)
 * @returns {Object} Command statistics
 */
export async function getCommandStats(guildId, days = 7) {
    const data = await getGuildData('analytics-commands', guildId);
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const commandCounts = new Map();
    const userCounts = new Map();
    
    for (const key in data) {
        const entry = data[key];
        if (entry.date >= cutoffDate) {
            // Count by command
            const cmdCount = commandCounts.get(entry.commandName) || 0;
            commandCounts.set(entry.commandName, cmdCount + entry.count);
            
            // Count by user
            const usrCount = userCounts.get(entry.userId) || 0;
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
export async function getMessageStats(guildId, days = 7) {
    const data = await getGuildData('analytics-messages', guildId);
    const cutoffHour = getHourString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const channelCounts = new Map();
    const userCounts = new Map();
    const hourCounts = new Map();
    
    for (const key in data) {
        const entry = data[key];
        if (entry.hour >= cutoffHour) {
            // Count by channel
            const chnCount = channelCounts.get(entry.channelId) || 0;
            channelCounts.set(entry.channelId, chnCount + entry.count);
            
            // Count by user
            const usrCount = userCounts.get(entry.userId) || 0;
            userCounts.set(entry.userId, usrCount + entry.count);
            
            // Count by hour
            const hrCount = hourCounts.get(entry.hour) || 0;
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
export async function getViolationStats(guildId, days = 30) {
    const data = await getGuildData('analytics-violations', guildId);
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const typeCounts = new Map();
    
    for (const key in data) {
        const entry = data[key];
        if (entry.date >= cutoffDate) {
            const count = typeCounts.get(entry.type) || 0;
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
export async function getModActionStats(guildId, days = 30) {
    const data = await getGuildData('analytics-modactions', guildId);
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const moderatorCounts = new Map();
    const actionCounts = new Map();
    
    for (const key in data) {
        const entry = data[key];
        if (entry.date >= cutoffDate) {
            // Count by moderator
            const modCount = moderatorCounts.get(entry.moderatorId) || 0;
            moderatorCounts.set(entry.moderatorId, modCount + entry.count);
            
            // Count by action type
            const actCount = actionCounts.get(entry.action) || 0;
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
export async function getMemberGrowthStats(guildId, days = 30) {
    const data = await getGuildData('analytics-members', guildId);
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const growth = [];
    
    for (const key in data) {
        if (key >= cutoffDate) {
            growth.push(data[key]);
        }
    }
    
    return growth.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Gets performance statistics for the analytics collector
 * @returns {Object} Performance stats
 */
export function getAnalyticsCollectorStats() {
    const avgFlushTime = performanceStats.flushesPerformed > 0 
        ? performanceStats.totalFlushTime / performanceStats.flushesPerformed 
        : 0;
    const avgCleanupTime = performanceStats.cleanupsPerformed > 0 
        ? performanceStats.totalCleanupTime / performanceStats.cleanupsPerformed 
        : 0;
    
    return {
        ...performanceStats,
        averageFlushTime: Math.round(avgFlushTime),
        averageCleanupTime: Math.round(avgCleanupTime),
        uptime: batchIntervalId ? Date.now() - (performanceStats.flushesPerformed * BATCH_INTERVAL) : 0
    };
}
