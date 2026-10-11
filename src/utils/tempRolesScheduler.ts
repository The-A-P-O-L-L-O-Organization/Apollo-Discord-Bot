// Temporary Roles Scheduler
// Automatically removes temporary roles when they expire

import { logger } from './logger.js';
import { getGuildData, setGuildData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';
import type { Client, Guild } from 'discord.js';

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

export async function checkExpiredTempRoles(client: Client): Promise<void> {
    try {
        const now = Date.now();
        const guilds = client.guilds.cache;

        for (const [guildId, guild] of guilds) {
            const stored = (await getGuildData('temp-roles', guildId)) as unknown as GuildTempRoles | null;
            const tempRoles = stored ?? {};
            const entries = Object.entries(tempRoles);
            if (entries.length === 0) { continue; }

            const expired = entries.filter(([, tempRole]) => tempRole.expiresAt && tempRole.expiresAt <= now);
            if (expired.length === 0) { continue; }

            const remaining: GuildTempRoles = Object.fromEntries(entries.filter(([, tempRole]) => !(tempRole.expiresAt && tempRole.expiresAt <= now)));
            await setGuildData('temp-roles', guildId, remaining);

            for (const [userId, tempRole] of expired) {
                const ok = await removeExpiredTempRole(guild, userId, tempRole);
                if (!ok) {
                    await requeueTempRole(guildId, userId, tempRole);
                }
            }
        }
    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Temp roles scheduler error' });
    }
}

async function requeueTempRole(guildId: string, userId: string, tempRole: TempRoleData): Promise<void> {
    try {
        const stored = (await getGuildData('temp-roles', guildId)) as unknown as GuildTempRoles | null;
        const tempRoles = stored ?? {};
        if (!tempRoles[userId]) {
            tempRoles[userId] = tempRole;
            await setGuildData('temp-roles', guildId, tempRoles);
        }
    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Failed to requeue temp role' });
    }
}

async function removeExpiredTempRole(guild: Guild, userId: string, tempRole: TempRoleData): Promise<boolean> {
    try {
        const member = await guild.members.fetch(userId).catch(() => null);
        const role = guild.roles.cache.get(tempRole.roleId);

        if (!member || !role) {
            return true;
        }

        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(role, 'Temporary role expired');

            logger.info({ msg: `[INFO] Removed temp role ${role.name} from ${member.user.tag}` });

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

        return true;
    } catch (error) {
        logger.error({ err: error as Error, msg: `[ERROR] Failed to remove temp role for user ${userId}` });
        return false;
    }
}