// Tempban Scheduler
// Background task that checks and unbans users with expired tempbans

import { getData, setData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';

let client = null;
let schedulerInterval = null;

/**
 * Initializes the tempban scheduler
 * @param {Client} discordClient - The Discord client instance
 */
export function initTempbanScheduler(discordClient) {
    client = discordClient;
    
    schedulerInterval = setInterval(async () => {
        const redis = await getLockRedis();
        if (redis) {
            await withLock(redis, 'scheduler:tempbans', config.podId, checkTempbans, 25000);
        } else {
            await checkTempbans();
        }
    }, 30000);
    
    console.log(`[INFO] Tempban scheduler started (checking every 30s)`);
    
    // Run an immediate check
    checkTempbans().catch(err => console.error('[ERROR] Tempban check failed:', err));
}

/**
 * Stops the tempban scheduler
 */
export function stopTempbanScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[INFO] Tempban scheduler stopped');
    }
}

/**
 * Checks for expired tempbans and unbans users
 */
async function checkTempbans() {
    if (!client) {return;}
    
    try {
        const data = getData('tempbans');
        const tempbans = data.tempbans || [];
        const now = Date.now();
        
        // Find expired tempbans
        const expiredBans = tempbans.filter(t => t.unbanAt <= now);
        
        if (expiredBans.length === 0) {return;}
        
        // Process each expired tempban
        for (const tempban of expiredBans) {
            await processTempbanExpiry(tempban);
        }
        
        // Remove processed tempbans
        data.tempbans = tempbans.filter(t => t.unbanAt > now);
        setData('tempbans', data);
        
        if (expiredBans.length > 0) {
            console.log(`[INFO] Processed ${expiredBans.length} expired tempban(s)`);
        }
        
    } catch (error) {
        console.error('[ERROR] Tempban scheduler error:', error);
    }
}

/**
 * Processes an expired tempban (unbans the user)
 * @param {Object} tempban - The tempban object
 */
async function processTempbanExpiry(tempban) {
    try {
        // Get the guild
        const guild = await client.guilds.fetch(tempban.guildId).catch(() => null);
        
        if (!guild) {
            console.log(`[WARNING] Guild ${tempban.guildId} not found for tempban expiry`);
            return;
        }
        
        // Try to unban the user
        try {
            await guild.bans.remove(tempban.userId, 'Temporary ban expired');
            console.log(`[MODERATION] User ${tempban.userId} unbanned automatically (tempban expired)`);
            
            // Try to send a notification to the mod log channel
            const logChannel = guild.channels.cache.find(
                channel => channel.name === 'mod-logs' || channel.name === 'moderation-logs'
            );
            
            if (logChannel) {
                const unbanEmbed = {
                    color: 0x00FF00,
                    title: '[MODERATION] TEMPBAN EXPIRED',
                    fields: [
                        {
                            name: 'User ID',
                            value: tempban.userId,
                            inline: true
                        },
                        {
                            name: 'Original Ban Date',
                            value: `<t:${Math.floor(tempban.bannedAt / 1000)}:F>`,
                            inline: true
                        },
                        {
                            name: 'Ban Duration',
                            value: tempban.duration || 'Unknown',
                            inline: true
                        },
                        {
                            name: 'Original Reason',
                            value: tempban.reason || 'No reason provided',
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: 'Automatic unban from tempban expiry'
                    }
                };
                
                await logChannel.send({ embeds: [unbanEmbed] }).catch(err => {
                    console.log('[WARNING] Could not send tempban expiry log:', err.message);
                });
            }
            
        } catch (unbanError) {
            // User might not be banned anymore
            if (unbanError.code === 10026) {
                console.log(`[INFO] User ${tempban.userId} is no longer banned in guild ${tempban.guildId}`);
            } else {
                console.error(`[ERROR] Failed to unban user ${tempban.userId}:`, unbanError);
            }
        }
        
    } catch (error) {
        console.error(`[ERROR] Failed to process tempban expiry for user ${tempban.userId}:`, error);
    }
}

/**
 * Adds a new tempban
 * @param {Object} tempbanData - The tempban data
 */
export function addTempban(tempbanData) {
    const data = getData('tempbans');
    if (!data.tempbans) {
        data.tempbans = [];
    }
    
    data.tempbans.push(tempbanData);
    setData('tempbans', data);
    
    console.log(`[INFO] Tempban added for user ${tempbanData.userId} in guild ${tempbanData.guildId}`);
}

/**
 * Removes a tempban (when manually unbanned)
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {boolean} Whether the tempban was found and removed
 */
export function removeTempban(guildId, userId) {
    const data = getData('tempbans');
    if (!data.tempbans) {return false;}
    
    const index = data.tempbans.findIndex(
        t => t.guildId === guildId && t.userId === userId
    );
    
    if (index === -1) {return false;}
    
    data.tempbans.splice(index, 1);
    setData('tempbans', data);
    
    console.log(`[INFO] Tempban removed for user ${userId} in guild ${guildId}`);
    return true;
}

/**
 * Gets a tempban for a user in a guild
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Object|null} The tempban object or null
 */
export function getTempban(guildId, userId) {
    const data = getData('tempbans');
    const tempbans = data.tempbans || [];
    return tempbans.find(t => t.guildId === guildId && t.userId === userId) || null;
}
