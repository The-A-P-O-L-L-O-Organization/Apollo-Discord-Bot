// XP Utility
// Awards experience points for messages and tracks levels

import { getUserData, setUserData, getGuildData } from './db.js';
import { config } from '../config/config.js';

interface LevelsConfig {
    enabled: boolean;
    cooldown: number;
    minXp: number;
    maxXp: number;
    announceLevelUp: boolean;
}

interface LevelData {
    xp: number;
    level: number;
    messages: number;
}

// In-memory cooldown tracking
// Map<`guildId:userId`, timestamp>
const cooldowns = new Map<string, number>();

/**
 * Gets the leveling configuration for a guild
 * @param guildId - Guild ID
 * @returns Leveling configuration
 */
export async function getLevelsConfig(guildId: string): Promise<LevelsConfig> {
    const guildConfig = await getGuildData('levels-config', guildId) as Record<string, unknown> | null;
    return {
        enabled: (guildConfig?.['enabled'] as boolean) ?? config.levels.enabled,
        cooldown: (guildConfig?.['cooldown'] as number) ?? config.levels.cooldown,
        minXp: (guildConfig?.['minXp'] as number) ?? config.levels.minXp,
        maxXp: (guildConfig?.['maxXp'] as number) ?? config.levels.maxXp,
        announceLevelUp: (guildConfig?.['announceLevelUp'] as boolean) ?? config.levels.announceLevelUp
    };
}

/**
 * Checks whether a user is on XP cooldown, and marks them as awarded
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param cooldownMs - Cooldown in milliseconds
 * @returns Whether the user is on cooldown
 */
export function isOnCooldown(guildId: string, userId: string, cooldownMs: number): boolean {
    const key = `${guildId}:${userId}`;
    const lastAwarded = cooldowns.get(key) ?? 0;
    const now = Date.now();

    if (now - lastAwarded < cooldownMs) {
        return true;
    }

    cooldowns.set(key, now);
    return false;
}

/**
 * Calculates the XP required to reach a specific level
 * Uses a quadratic formula for increasing difficulty
 * @param level - Target level
 * @returns XP required
 */
export function calculateXPForLevel(level: number): number {
    return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Awards XP to a user and updates their level if needed
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param amount - XP to award
 * @param incrementMessages - Whether to increment the message counter
 * @returns Updated level data and whether they leveled up
 */
export async function awardXp(
    guildId: string,
    userId: string,
    amount: number,
    incrementMessages = true
): Promise<{ data: LevelData; leveledUp: boolean }> {
    const data = await getUserData('levels', guildId, userId) as LevelData | null ?? { xp: 0, level: 0, messages: 0 };

    data.xp += amount;
    if (incrementMessages) {
        data.messages = (data.messages ?? 0) + 1;
    }

    let leveledUp = false;
    while (data.xp >= calculateXPForLevel(data.level + 1)) {
        data.level += 1;
        leveledUp = true;
    }

    await setUserData('levels', guildId, userId, data);

    return { data, leveledUp };
}

/**
 * Clears the XP cooldown tracking map
 */
export function clearCooldowns(): void {
    cooldowns.clear();
}