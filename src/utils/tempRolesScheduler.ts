// Temporary Roles Scheduler
// Automatically removes temporary roles when they expire

import { logger } from './logger.js';
import { getGuildData, setGuildData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';
import type { Client } from 'discord.js';

let checkInterval: NodeJS.Timeout | null = null;
const CHECK_DELAY = 60000;

interface TempRoleData {
    roleId: string;
    expiresAt: number;
}

type GuildTempRoles = Record<string, TempRoleData>;

export function initTempRolesScheduler(client: Client): void {
    if (checkInterval) {
        logger.info({ msg: '[INFO] Temp roles scheduler already running' });
        return;
    }

    checkInterval = setInterval(() => { void (async () => {
        const redis = await getLockRedis();
        if (redis) {
            await withLock(redis, 'scheduler:temproles', config.podId ?? 'default', () => checkExpiredTempRoles(client), 55000);
        } else {
            await checkExpiredTempRoles(client);
        }
    })(); }, CHECK_DELAY);

    logger.info({ msg: '[SUCCESS] Temporary roles scheduler started' });
}

export function stopTempRolesScheduler(): void {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
        logger.info({ msg: '[INFO] Temporary roles scheduler stopped' });
    }
}

async function checkExpiredTempRoles(client: Client): Promise<void> {
    try {
        // Get all guilds with temp roles
        const allTempRoles = (await getGuildData('temp-roles', '__all__')) as unknown as Record<string, GuildTempRoles> | null;

        if (!allTempRoles || Object.keys(allTempRoles).length === 0) {
            return;
        }

        const now = Date.now();
        const guilds = client.guilds.cache;

        for (const [guildId, tempRoles] of Object.entries(allTempRoles)) {
            const guild = guilds.get(guildId);
            if (!guild) { continue; }

            // Find expired roles
            for (const [userId, tempRole] of Object.entries(tempRoles)) {
                if (tempRole.expiresAt && tempRole.expiresAt <= now) {
                    try {
                        const member = await guild.members.fetch(userId).catch(() => null);
                        const role = guild.roles.cache.get(tempRole.roleId);

                        if (member && role && member.roles.cache.has(role.id)) {
                            await member.roles.remove(role, 'Temporary role expired');

                            logger.info({ msg: `[INFO] Removed temp role ${role.name} from ${member.user.tag}` });

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
                                logger.info({ msg: `[INFO] Could not DM ${member.user.tag}: ${dmError instanceof Error ? dmError.message : String(dmError)}` });
                            }
                        }

                        // Remove from storage
                        delete tempRoles[userId];
                    } catch (error) {
                        logger.error({ err: error as Error, msg: `[ERROR] Failed to remove temp role for user ${userId}` });
                    }
                }
            }

            // Update storage
            await setGuildData('temp-roles', guildId, tempRoles);
        }
    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Temp roles scheduler error' });
    }
}