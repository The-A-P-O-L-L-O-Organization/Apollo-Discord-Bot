// Tempban Scheduler
// Background task that checks and unbans users with expired tempbans

import { logger } from './logger.js';
import { getData, setData } from './db.js';
import { config } from '../config/config.js';
import { getLockRedis, withLock } from './lock.js';
import type { Client} from 'discord.js';

let client: Client | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;

interface TempbanData {
    guildId: string;
    userId: string;
    unbanAt: number;
    bannedAt: number;
    duration?: string;
    reason?: string;
    moderatorId?: string;
    moderatorTag?: string;
}

interface TempbansData {
    tempbans: TempbanData[];
}

/**
 * Initializes the tempban scheduler
 * @param discordClient - The Discord client instance
 */
export function initTempbanScheduler(discordClient: Client): void {
    client = discordClient;

    schedulerInterval = setInterval(() => { void (async () => {
        const redis = await getLockRedis();
        if (redis) {
            await withLock(redis, 'scheduler:tempbans', config.podId ?? 'default', checkTempbans, 25000);
        } else {
            await checkTempbans();
        }
    })(); }, 30000);

    logger.info({ msg: '[INFO] Tempban scheduler started (checking every 30s)' });

    // Run an immediate check
    checkTempbans().catch(err => logger.error({ err: err as Error, msg: '[ERROR] Tempban check failed' }));
}

/**
 * Stops the tempban scheduler
 */
export function stopTempbanScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info({ msg: '[INFO] Tempban scheduler stopped' });
    }
}

/**
 * Checks for expired tempbans and unbans users
 */
async function checkTempbans(): Promise<void> {
    if (!client) { return; }

    try {
        const data = getData('tempbans') as TempbansData | null;
        const tempbans = data?.tempbans ?? [];
        const now = Date.now();

        // Find expired tempbans
        const expiredBans = tempbans.filter(t => t.unbanAt <= now);

        if (expiredBans.length === 0) { return; }

        // Process each expired tempban
        for (const tempban of expiredBans) {
            await processTempbanExpiry(tempban);
        }

        // Remove processed tempbans
        if (data) {
            data.tempbans = tempbans.filter(t => t.unbanAt > now);
            await setData('tempbans', data);
        }

        if (expiredBans.length > 0) {
            logger.info({ msg: `[INFO] Processed ${expiredBans.length} expired tempban(s)` });
        }

    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] Tempban scheduler error' });
    }
}

/**
 * Processes an expired tempban (unbans the user)
 * @param tempban - The tempban object
 */
async function processTempbanExpiry(tempban: TempbanData): Promise<void> {
    try {
        // Get the guild
        const guild = await client.guilds.fetch(tempban.guildId).catch(() => null);

        if (!guild) {
            logger.info({ msg: `[WARNING] Guild ${tempban.guildId} not found for tempban expiry` });
            return;
        }

        // Try to unban the user
        try {
            await guild.bans.remove(tempban.userId, 'Temporary ban expired');
            logger.info({ msg: `[MODERATION] User ${tempban.userId} unbanned automatically (tempban expired)` });

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
                            value: tempban.duration ?? 'Unknown',
                            inline: true
                        },
                        {
                            name: 'Original Reason',
                            value: tempban.reason ?? 'No reason provided',
                            inline: false
                        }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: 'Automatic unban from tempban expiry'
                    }
                };

                await logChannel.send({ embeds: [unbanEmbed] }).catch((err: Error) => {
                    logger.info({ msg: `[WARNING] Could not send tempban expiry log: ${err.message}` });
                });
            }

        } catch (unbanError: unknown) {
            // User might not be banned anymore
            const error = unbanError as { code?: number; message?: string };
            if (error.code === 10026) {
                logger.info({ msg: `[INFO] User ${tempban.userId} is no longer banned in guild ${tempban.guildId}` });
            } else {
                logger.error({ err: unbanError as Error, msg: `[ERROR] Failed to unban user ${tempban.userId}` });
            }
        }

    } catch (error) {
        logger.error({ err: error as Error, msg: `[ERROR] Failed to process tempban expiry for user ${tempban.userId}` });
    }
}

/**
 * Adds a new tempban
 * @param tempbanData - The tempban data
 */
export async function addTempban(tempbanData: TempbanData): Promise<void> {
    const data = getData('tempbans') as TempbansData | null;
    data.tempbans ??= [];

    data.tempbans.push(tempbanData);
    await setData('tempbans', data);

    logger.info({ msg: `[INFO] Tempban added for user ${tempbanData.userId} in guild ${tempbanData.guildId}` });
}

/**
 * Removes a tempban (when manually unbanned)
 * @param guildId - The guild ID
 * @param userId - The user ID
 * @returns Whether the tempban was found and removed
 */
export async function removeTempban(guildId: string, userId: string): Promise<boolean> {
    const data = getData('tempbans') as TempbansData | null;
    if (!data?.tempbans) { return false; }

    const index = data.tempbans.findIndex(
        t => t.guildId === guildId && t.userId === userId
    );

    if (index === -1) { return false; }

    data.tempbans.splice(index, 1);
    await setData('tempbans', data);

    logger.info({ msg: `[INFO] Tempban removed for user ${userId} in guild ${guildId}` });
    return true;
}

/**
 * Gets a tempban for a user in a guild
 * @param guildId - The guild ID
 * @param userId - The user ID
 * @returns The tempban object or null
 */
export function getTempban(guildId: string, userId: string): TempbanData | null {
    const data = getData('tempbans') as TempbansData | null;
    const tempbans = data?.tempbans ?? [];
    return tempbans.find(t => t.guildId === guildId && t.userId === userId) ?? null;
}