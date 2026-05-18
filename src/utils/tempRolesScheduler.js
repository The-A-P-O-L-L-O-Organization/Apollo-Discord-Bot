// Temporary Roles Scheduler
// Automatically removes temporary roles when they expire

import { getGuildData, setGuildData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';

let checkInterval = null;
const CHECK_DELAY = 60000; // Check every minute

export function initTempRolesScheduler(client) {
    if (checkInterval) {
        console.log('[INFO] Temp roles scheduler already running');
        return;
    }
    
    checkInterval = setInterval(async() => {
        const redis = await getLockRedis();
        if (redis) {
            await withLock(redis, 'scheduler:temproles', config.podId, () => checkExpiredTempRoles(client), 55000);
        } else {
            await checkExpiredTempRoles(client);
        }
    }, CHECK_DELAY);
    
    console.log('[SUCCESS] Temporary roles scheduler started');
}

export function stopTempRolesScheduler() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
        console.log('[INFO] Temporary roles scheduler stopped');
    }
}

async function checkExpiredTempRoles(client) {
    try {
        // Get all guilds with temp roles
        const allTempRoles = getGuildData('temp-roles', '__all__');
        
        if (!allTempRoles || Object.keys(allTempRoles).length === 0) {
            return;
        }
        
        const now = Date.now();
        const guilds = client.guilds.cache;
        
        for (const [guildId, tempRoles] of Object.entries(allTempRoles)) {
            const guild = guilds.get(guildId);
            if (!guild) {continue;}
            
            // Find expired roles
            for (const [userId, tempRole] of Object.entries(tempRoles)) {
                if (tempRole.expiresAt && tempRole.expiresAt <= now) {
                    try {
                        const member = await guild.members.fetch(userId);
                        const role = guild.roles.cache.get(tempRole.roleId);
                        
                        if (member && role && member.roles.cache.has(role.id)) {
                            await member.roles.remove(role, 'Temporary role expired');
                            
                            console.log(`[INFO] Removed temp role ${role.name} from ${member.user.tag}`);
                            
                            // Try to notify user
                            try {
                                await member.user.send({
                                    embeds: [{
                                        color: 0xFFA500,
                                        title: '[INFO] Temporary Role Expired',
                                        description: `Your temporary role ${role.name} in ${guild.name} has expired.`,
                                        timestamp: new Date().toISOString()
                                    }]
                                });
                            } catch (dmError) {
                                console.log(`[INFO] Could not DM ${member.user.tag}: ${dmError.message}`);
                            }
                        }
                        
                        // Remove from storage
                        delete tempRoles[userId];
                    } catch (error) {
                        console.error(`[ERROR] Failed to remove temp role for user ${userId}:`, error);
                    }
                }
            }
            
            // Update storage
            await setGuildData('temp-roles', guildId, tempRoles);
        }
    } catch (error) {
        console.error('[ERROR] Temp roles scheduler error:', error);
    }
}
