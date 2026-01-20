// Reminder Scheduler
// Background task that checks and sends due reminders

import { EmbedBuilder } from 'discord.js';
import { getData, setData } from './dataStore.js';
import { config } from '../config/config.js';

let client = null;
let schedulerInterval = null;

/**
 * Initializes the reminder scheduler
 * @param {Client} discordClient - The Discord client instance
 */
export function initReminderScheduler(discordClient) {
    client = discordClient;
    
    // Start the scheduler
    schedulerInterval = setInterval(checkReminders, config.reminders.checkInterval);
    
    console.log(`[INFO] Reminder scheduler started (checking every ${config.reminders.checkInterval / 1000}s)`);
    
    // Run an immediate check
    checkReminders();
}

/**
 * Stops the reminder scheduler
 */
export function stopReminderScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[INFO] Reminder scheduler stopped');
    }
}

/**
 * Checks for due reminders and sends them
 */
async function checkReminders() {
    if (!client) return;
    
    try {
        const data = getData('reminders');
        const reminders = data.reminders || [];
        const now = Date.now();
        
        // Find due reminders
        const dueReminders = reminders.filter(r => r.remindAt <= now);
        
        if (dueReminders.length === 0) return;
        
        // Process each due reminder
        for (const reminder of dueReminders) {
            await sendReminder(reminder);
        }
        
        // Remove sent reminders
        data.reminders = reminders.filter(r => r.remindAt > now);
        setData('reminders', data);
        
        if (dueReminders.length > 0) {
            console.log(`[INFO] Sent ${dueReminders.length} reminder(s)`);
        }
        
    } catch (error) {
        console.error('[ERROR] Reminder scheduler error:', error);
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
            .setTitle('⏰ Reminder!')
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
        } catch (dmError) {
            // DM failed, try to send in the original channel
            console.log(`[INFO] Could not DM user ${reminder.userId}, trying channel`);
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
                console.error(`[ERROR] Could not send reminder to channel ${reminder.channelId}:`, channelError.message);
            }
        }
        
    } catch (error) {
        console.error(`[ERROR] Failed to send reminder ${reminder.id}:`, error);
    }
}

/**
 * Adds a new reminder
 * @param {Object} reminderData - The reminder data
 * @returns {Object} The created reminder
 */
export function addReminder(reminderData) {
    const data = getData('reminders');
    if (!data.reminders) {
        data.reminders = [];
    }
    
    data.reminders.push(reminderData);
    setData('reminders', data);
    
    return reminderData;
}

/**
 * Gets all reminders for a user
 * @param {string} userId - The user ID
 * @returns {Array} Array of reminders
 */
export function getUserReminders(userId) {
    const data = getData('reminders');
    const reminders = data.reminders || [];
    return reminders.filter(r => r.userId === userId);
}

/**
 * Cancels a reminder by ID
 * @param {string} reminderId - The reminder ID
 * @param {string} userId - The user ID (for verification)
 * @returns {boolean} Whether the reminder was found and cancelled
 */
export function cancelReminder(reminderId, userId) {
    const data = getData('reminders');
    if (!data.reminders) return false;
    
    const index = data.reminders.findIndex(
        r => r.id === reminderId && r.userId === userId
    );
    
    if (index === -1) return false;
    
    data.reminders.splice(index, 1);
    setData('reminders', data);
    
    return true;
}

/**
 * Parses a time string into milliseconds
 * @param {string} timeStr - Time string (e.g., '30m', '2h', '1d')
 * @returns {number|null} Milliseconds or null if invalid
 */
export function parseTimeString(timeStr) {
    const match = timeStr.match(/^(\d+)([smhdw])$/i);
    if (!match) return null;
    
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
