import { logger } from '../utils/logger.js';
import type { Client} from 'discord.js';
import { EmbedBuilder, User, type TextBasedChannel } from 'discord.js';
import { getData, setData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';

let client: Client | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;

interface PerformanceStats {
    checksPerformed: number;
    remindersSent: number;
    totalCheckTime: number;
    lastCheckTime: number;
    errors: number;
}

const performanceStats: PerformanceStats = {
    checksPerformed: 0,
    remindersSent: 0,
    totalCheckTime: 0,
    lastCheckTime: 0,
    errors: 0
};

interface Reminder {
    id: string;
    userId: string;
    channelId: string | null;
    message: string;
    remindAt: number;
    createdAt: number;
}

interface RemindersData {
    reminders: Reminder[];
}

/**
 * Loads reminders from database and populates in-memory cache
 */
async function loadRemindersFromDatabase(): Promise<void> {
    try {
        const data = await getData('reminders');
        const reminders = data.reminders || [];
        logger.info({ msg: `[INFO] Loaded ${reminders.length} reminders from database` });
    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Failed to load reminders from database' });
    }
}

/**
 * Initializes the reminder scheduler
 * @param discordClient - The Discord client instance
 */
export async function initReminderScheduler(discordClient: Client): Promise<void> {
    client = discordClient;

    // Load reminders from database on startup
    await loadRemindersFromDatabase();

    schedulerInterval = setInterval(async () => {
        const redis = await getLockRedis();
        if (redis) {
            // TTL = interval (30s) to ensure no gap between lock expiration and next acquisition
            await withLock(redis, 'scheduler:reminders', config.podId ?? 'default', checkReminders, config.reminders.checkInterval);
        } else {
            await checkReminders();
        }
    }, config.reminders.checkInterval);

    logger.info({ msg: `[INFO] Reminder scheduler started (checking every ${config.reminders.checkInterval / 1000}s)` });

    // Run an immediate check
    checkReminders().catch(err => logger.error({ err: err as Error, msg: '[ERROR] Reminder check failed' }));
}

/**
 * Stops the reminder scheduler
 */
export function stopReminderScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info({ msg: '[INFO] Reminder scheduler stopped' });
    }
}

/**
 * Checks for due reminders and sends them
 */
async function checkReminders(): Promise<void> {
    if (!client) {return;}

    const startTime = Date.now();

    try {
        const data = await getData('reminders');
        const reminders = data.reminders || [];
        const now = Date.now();

        // Find due reminders
        const dueReminders = reminders.filter(r => r.remindAt <= now);

        if (dueReminders.length === 0) {
            performanceStats.checksPerformed++;
            performanceStats.lastCheckTime = Date.now() - startTime;
            performanceStats.totalCheckTime += performanceStats.lastCheckTime;
            return;
        }

        // Process each due reminder
        for (const reminder of dueReminders) {
            await sendReminder(reminder);
        }

        // Remove sent reminders
        data.reminders = reminders.filter(r => r.remindAt > now);
        await setData('reminders', data);

        // Update performance stats
        performanceStats.checksPerformed++;
        performanceStats.remindersSent += dueReminders.length;
        performanceStats.lastCheckTime = Date.now() - startTime;
        performanceStats.totalCheckTime += performanceStats.lastCheckTime;

        if (dueReminders.length > 0) {
            logger.info({ msg: `[INFO] Sent ${dueReminders.length} reminder(s) in ${performanceStats.lastCheckTime}ms` });
        }

    } catch (error) {
        performanceStats.errors++;
        logger.error({ err: error as Error, msg: '[ERROR] Reminder scheduler error' });
    }
}

/**
 * Sends a reminder to the user
 * @param reminder - The reminder object
 */
async function sendReminder(reminder: Reminder): Promise<void> {
    try {
        // Create reminder embed
        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('[Reminder]')
            .setDescription(reminder.message)
            .addFields({
                name: 'Set',
                value: `<t:${Math.floor(reminder.createdAt / 1000)}:R>`,
                inline: true
            })
            .setTimestamp()
            .setFooter({ text: `Reminder ID: ${reminder.id}` });

        // Try to DM the user first
        try {
            const user = await client.users.fetch(reminder.userId);
            await user.send({ embeds: [embed] });
            return;
        } catch {
            // DM failed, try to send in the original channel
            logger.info({ msg: `[INFO] Could not DM user ${reminder.userId}, trying channel` });
        }

        // Try to send in the original channel
        if (reminder.channelId) {
            try {
                const channel = await client.channels.fetch(reminder.channelId);
                if (channel && channel.isTextBased()) {
                    await channel.send({
                        content: `<@${reminder.userId}>`,
                        embeds: [embed]
                    });
                }
            } catch (channelError) {
                logger.error({ err: channelError as Error, msg: `[ERROR] Could not send reminder to channel ${reminder.channelId}` });
            }
        }

    } catch (error) {
        logger.error({ err: error as Error, msg: `[ERROR] Failed to send reminder ${reminder.id}` });
    }
}

/**
 * Adds a new reminder
 * @param reminderData - The reminder data
 * @returns The created reminder
 */
export async function addReminder(reminderData: Reminder): Promise<Reminder> {
    const data = await getData('reminders') as RemindersData | null;
    if (!data?.reminders) {
        data.reminders = [];
    }

    data.reminders.push(reminderData);
    await setData('reminders', data);

    return reminderData;
}

/**
 * Gets all reminders for a user
 * @param userId - The user ID
 * @returns Array of reminders
 */
export async function getUserReminders(userId: string): Promise<Reminder[]> {
    const data = await getData('reminders') as RemindersData | null;
    const reminders = data?.reminders || [];
    return reminders.filter(r => r.userId === userId);
}

/**
 * Cancels a reminder by ID
 * @param reminderId - The reminder ID
 * @param userId - The user ID (for verification)
 * @returns Whether the reminder was found and cancelled
 */
export async function cancelReminder(reminderId: string, userId: string): Promise<boolean> {
    const data = await getData('reminders') as RemindersData | null;
    if (!data?.reminders) {return false;}

    const index = data.reminders.findIndex(
        r => r.id === reminderId && r.userId === userId
    );

    if (index === -1) {return false;}

    data.reminders.splice(index, 1);
    await setData('reminders', data);

    return true;
}

/**
 * Gets performance statistics for the reminder scheduler
 * @returns Performance stats
 */
export function getReminderSchedulerStats(): PerformanceStats & { averageCheckTime: number; uptime: number } {
    const avgCheckTime = performanceStats.checksPerformed > 0
        ? performanceStats.totalCheckTime / performanceStats.checksPerformed
        : 0;

    return {
        ...performanceStats,
        averageCheckTime: Math.round(avgCheckTime),
        uptime: schedulerInterval ? Date.now() - (performanceStats.checksPerformed * config.reminders.checkInterval) : 0
    };
}

/**
 * Parses a time string into milliseconds
 * @param timeStr - Time string (e.g., '30m', '2h', '1d')
 * @returns Milliseconds or null if invalid
 */
export function parseTimeString(timeStr: string): number | null {
    const match = timeStr.match(/^(\d+)([smhdw])$/i);
    if (!match) {return null;}

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers: Record<string, number> = {
        's': 1000,           // seconds
        'm': 60000,          // minutes
        'h': 3600000,        // hours
        'd': 86400000,       // days
        'w': 604800000       // weeks
    };

    return value * (multipliers[unit] ?? 0);
}