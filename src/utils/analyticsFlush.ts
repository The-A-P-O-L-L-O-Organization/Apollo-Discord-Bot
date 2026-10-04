import { logger } from './logger.js';
import { getGuildData, setGuildData } from './db.js';
import type { Client } from 'discord.js';
import { analyticsCache, getDateString, getHourString } from './analyticsCache.js';

// Batch write interval (60 seconds)
const BATCH_INTERVAL = 60 * 1000;
let batchIntervalId: NodeJS.Timeout | null = null;

// Data retention period (90 days)
const RETENTION_DAYS = 90;

// Performance stats
export interface PerformanceStats {
    flushesPerformed: number;
    cleanupsPerformed: number;
    totalFlushTime: number;
    totalCleanupTime: number;
    recordsProcessed: number;
    recordsDeleted: number;
    errors: number;
}

const performanceStats: PerformanceStats = {
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
export function initAnalyticsCollector(client: Client): void {
    logger.info('[ANALYTICS] Starting analytics collector...');

    // Start the batch write interval
    batchIntervalId = setInterval(() => {
        void flushAnalyticsCache();
    }, BATCH_INTERVAL);

    // Run cleanup on startup
    void cleanupOldAnalytics(client);

    // Schedule daily cleanup
    setInterval(() => {
        void cleanupOldAnalytics(client);
    }, 24 * 60 * 60 * 1000); // Once per day

    logger.info('[ANALYTICS] Analytics collector started successfully');
}

/**
 * Stops the analytics collector
 */
export function stopAnalyticsCollector(): void {
    logger.info('[ANALYTICS] Stopping analytics collector...');

    // Flush any remaining cached data
    void flushAnalyticsCache();

    // Clear the interval
    if (batchIntervalId) {
        clearInterval(batchIntervalId);
        batchIntervalId = null;
    }

    logger.info('[ANALYTICS] Analytics collector stopped');
}

/**
 * Flushes critical analytics immediately to prevent data loss
 * Called on critical events (automod violations, mod actions, reports)
 * @returns {Promise<void>}
 */
export async function flushAnalyticsCritical(): Promise<void> {
    try {
        await flushAnalyticsCache();
        if (performanceStats.flushesPerformed % 10 === 0) {
            logger.info('[ANALYTICS] Critical flush completed successfully');
        }
    } catch (error) {
        // @ts-expect-error - pino logger overloads
        logger.error('[ERROR] Failed to flush analytics:', { err: error as Error });
        // Don't crash, just log
    }
}

/**
 * Flushes the analytics cache to the database
 */
export async function flushAnalyticsCache(): Promise<void> {
    const startTime = Date.now();

    try {
        const now = Date.now();
        const hour = getHourString(now);
        const date = getDateString(now);
        let recordsProcessed = 0;

        // Flush command analytics
        for (const [guildId, guildCommands] of analyticsCache.commands) {
            const data = await getGuildData('analytics-commands', guildId) as Record<string, {
                date: string;
                commandName: string;
                userId: string;
                count: number;
            }>;

            for (const [commandName, users] of guildCommands) {
                for (const [userId, count] of users) {
                    const key = `${date}:${commandName}:${userId}`;
                    data[key] ??= {
                        date,
                        commandName,
                        userId,
                        count: 0
                    };
                    data[key].count += count;
                    recordsProcessed++;
                }
            }

            await setGuildData('analytics-commands', guildId, data);
        }
        analyticsCache.commands.clear();

        // Flush message analytics (hourly aggregation)
        for (const [guildId, guildMessages] of analyticsCache.messages) {
            const data = await getGuildData('analytics-messages', guildId) as Record<string, {
                hour: string;
                channelId: string;
                userId: string;
                count: number;
            }>;

            for (const [channelId, users] of guildMessages) {
                for (const [userId, count] of users) {
                    const key = `${hour}:${channelId}:${userId}`;
                    data[key] ??= {
                        hour,
                        channelId,
                        userId,
                        count: 0
                    };
                    data[key].count += count;
                    recordsProcessed++;
                }
            }

            await setGuildData('analytics-messages', guildId, data);
        }
        analyticsCache.messages.clear();

        // Flush violation analytics (daily aggregation)
        for (const [guildId, violations] of analyticsCache.violations) {
            const data = await getGuildData('analytics-violations', guildId) as Record<string, {
                date: string;
                type: string;
                count: number;
            }>;

            for (const [type, count] of violations) {
                const key = `${date}:${type}`;
                data[key] ??= {
                    date,
                    type,
                    count: 0
                };
                data[key].count += count;
                recordsProcessed++;
            }

            await setGuildData('analytics-violations', guildId, data);
        }
        analyticsCache.violations.clear();

        // Flush mod action analytics (daily aggregation)
        for (const [guildId, guildModActions] of analyticsCache.modActions) {
            const data = await getGuildData('analytics-modactions', guildId) as Record<string, {
                date: string;
                moderatorId: string;
                action: string;
                count: number;
            }>;

            for (const [moderatorId, actions] of guildModActions) {
                for (const [action, count] of actions) {
                    const key = `${date}:${moderatorId}:${action}`;
                    data[key] ??= {
                        date,
                        moderatorId,
                        action,
                        count: 0
                    };
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
            logger.info(`[ANALYTICS] Flushed ${recordsProcessed} records in ${flushTime}ms`);
        }

    } catch (error) {
        performanceStats.errors++;
        // @ts-expect-error - pino logger overloads
        logger.error('[ANALYTICS] Error flushing analytics cache:', { err: error as Error });
    }
}

/**
 * Cleans up analytics data older than retention period
 * @param {Client} client - Discord client
 */
async function cleanupOldAnalytics(client: Client): Promise<void> {
    const startTime = Date.now();

    try {
        const cutoffDate = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const cutoffDateStr = getDateString(cutoffDate);
        const cutoffHourStr = getHourString(cutoffDate);

        logger.info(`[ANALYTICS] Cleaning up analytics older than ${cutoffDateStr}...`);

        let totalDeleted = 0;

        // Clean up each guild's analytics
        for (const guild of client.guilds.cache.values()) {
            const guildId = guild.id;

            // Clean commands
            const commands = await getGuildData('analytics-commands', guildId) as Record<string, {
                date: string;
                commandName: string;
                userId: string;
                count: number;
            }>;
            for (const key in commands) {
                const cmd = commands[key];
                if (cmd && cmd.date < cutoffDateStr) {
                    delete commands[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-commands', guildId, commands);

            // Clean messages
            const messages = await getGuildData('analytics-messages', guildId) as Record<string, {
                hour: string;
                channelId: string;
                userId: string;
                count: number;
            }>;
            for (const key in messages) {
                const msg = messages[key];
                if (msg && msg.hour < cutoffHourStr) {
                    delete messages[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-messages', guildId, messages);

            // Clean violations
            const violations = await getGuildData('analytics-violations', guildId) as Record<string, {
                date: string;
                type: string;
                count: number;
            }>;
            for (const key in violations) {
                const viol = violations[key];
                if (viol && viol.date < cutoffDateStr) {
                    delete violations[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-violations', guildId, violations);

            // Clean mod actions
            const modActions = await getGuildData('analytics-modactions', guildId) as Record<string, {
                date: string;
                moderatorId: string;
                action: string;
                count: number;
            }>;
            for (const key in modActions) {
                const action = modActions[key];
                if (action && action.date < cutoffDateStr) {
                    delete modActions[key];
                    totalDeleted++;
                }
            }
            await setGuildData('analytics-modactions', guildId, modActions);

            // Clean members (keep all member data, it's already daily)
            const members = await getGuildData('analytics-members', guildId) as Record<string, {
                date: string;
                joinCount: number;
                leaveCount: number;
                totalMembers: number;
            }>;
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

        logger.info(`[ANALYTICS] Cleanup complete. Deleted ${totalDeleted} old records in ${cleanupTime}ms.`);

    } catch (error) {
        performanceStats.errors++;
        // @ts-expect-error - pino logger overloads
        logger.error('[ANALYTICS] Error during analytics cleanup:', { err: error as Error });
    }
}

/**
 * Gets performance statistics for the analytics collector
 * @returns {Object} Performance stats
 */
export function getAnalyticsCollectorStats(): PerformanceStats & {
    averageFlushTime: number;
    averageCleanupTime: number;
    uptime: number;
    } {
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
