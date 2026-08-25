import { logger } from '../utils/logger.js';
 
// Reminder Scheduler
// Background task that checks and sends due reminders

import { EmbedBuilder } from 'discord.js';
import { getData, setData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';

let client = null;
let schedulerInterval = null;
const performanceStats = {
    checksPerformed: 0,
    remindersSent: 0,
    totalCheckTime: 0,
    lastCheckTime: 0,
    errors: 0
};

// In-memory cache of reminders (used for performance tracking)

/**
 * Loads reminders from database and populates in-memory cache
 */
async function loadRemindersFromDatabase() {
    try {
        const data = await getData('reminders');
        const reminders = data.reminders || [];
        logger.info(`[INFO] Loaded ${reminders.length} reminders from database`);
    } catch (error) {
        logger.error('[ERROR] Failed to load reminders from database:', error);
    }
}

/**
 * Initializes the reminder scheduler
 * @param {Client} discordClient - The Discord client instance
 */
export async function initReminderScheduler(discordClient) {
    client = discordClient;
    
    // Load reminders from database on startup
    await loadRemindersFromDatabase();
    
    schedulerInterval = setInterval(async() => {
        const redis = await getLockRedis();
        if (redis) {
            // TTL = interval (30s) to ensure no gap between lock expiration and next acquisition
            await withLock(redis, 'scheduler:reminders', config.podId, checkReminders, config.reminders.checkInterval);
        } else {
            await checkReminders();
        }
    }, config.reminders.checkInterval);
    
    logger.info(`[INFO] Reminder scheduler started (checking every ${config.reminders.checkInterval / 1000}s)`);
    
    // Run an immediate check
    checkReminders().catch(err => logger.error('[ERROR] Reminder check failed:', err));
}

/**
 * Stops the reminder scheduler
 */
export function stopReminderScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info('[INFO] Reminder scheduler stopped');
    }
}

/**
 * Checks for due reminders and sends them
 */
async function checkReminders() {
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
            logger.info(`[INFO] Sent ${dueReminders.length} reminder(s) in ${performanceStats.lastCheckTime}ms`);
        }
        
    } catch (error) {
        performanceStats.errors++;
        logger.error('[ERROR] Reminder scheduler error:', error);
    }
}

/**
 * Sends a reminder to the user
 * @param {Object} reminder - The reminder object
 */
async function sendReminder(reminder) {
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
            logger.info(`[INFO] Could not DM user ${reminder.userId}, trying channel`);
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
                logger.error(`[ERROR] Could not send reminder to channel ${reminder.channelId}:`, channelError.message);
            }
        }
        
    } catch (error) {
        logger.error(`[ERROR] Failed to send reminder ${reminder.id}:`, error);
    }
}

/**
 * Adds a new reminder
 * @param {Object} reminderData - The reminder data
 * @returns {Object} The created reminder
 */
export async function addReminder(reminderData) {
    const data = await getData('reminders');
    if (!data.reminders) {
        data.reminders = [];
    }
    
    data.reminders.push(reminderData);
    await setData('reminders', data);
    
    return reminderData;
}

/**
 * Gets all reminders for a user
 * @param {string} userId - The user ID
 * @returns {Array} Array of reminders
 */
export async function getUserReminders(userId) {
    const data = await getData('reminders');
    const reminders = data.reminders || [];
    return reminders.filter(r => r.userId === userId);
}

/**
 * Cancels a reminder by ID
 * @param {string} reminderId - The reminder ID
 * @param {string} userId - The user ID (for verification)
 * @returns {boolean} Whether the reminder was found and cancelled
 */
export async function cancelReminder(reminderId, userId) {
    const data = await getData('reminders');
    if (!data.reminders) {return false;}
    
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
 * @returns {Object} Performance stats
 */
export function getReminderSchedulerStats() {
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
 * @param {string} timeStr - Time string (e.g., '30m', '2h', '1d')
 * @returns {number|null} Milliseconds or null if invalid
 */
export function parseTimeString(timeStr) {
    const match = timeStr.match(/^(\d+)([smhdw])$/i);
    if (!match) {return null;}
    
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const multipliers = {
        's': 1000,           // seconds
        'm': 60000,          // minutes
        'h': 3600000,        // hours
        'd': 86400000,       // days
        'w': 604800000       // weeks
    };
    
    return value * (multipliers[unit] || 0);
}
