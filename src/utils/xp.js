// XP Utility
// Awards experience points for messages and tracks levels

import { getUserData, setUserData, getGuildData } from './db.js';
import { config } from '../config/config.js';

// In-memory cooldown tracking
// Map<`guildId:userId`, timestamp>
const cooldowns = new Map();

/**
 * Gets the leveling configuration for a guild
 * @param {string} guildId - Guild ID
 * @returns {Object} Leveling configuration
 */
export async function getLevelsConfig(guildId) {
    const guildConfig = await getGuildData('levels-config', guildId);
    return {
        enabled: guildConfig.enabled ?? config.levels.enabled,
        cooldown: guildConfig.cooldown ?? config.levels.cooldown,
        minXp: guildConfig.minXp ?? config.levels.minXp,
        maxXp: guildConfig.maxXp ?? config.levels.maxXp,
        announceLevelUp: guildConfig.announceLevelUp ?? config.levels.announceLevelUp
    };
}

/**
 * Checks whether a user is on XP cooldown, and marks them as awarded
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} cooldownMs - Cooldown in milliseconds
 * @returns {boolean} Whether the user is on cooldown
 */
export function isOnCooldown(guildId, userId, cooldownMs) {
    const key = `${guildId}:${userId}`;
    const lastAwarded = cooldowns.get(key) || 0;
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
 * @param {number} level - Target level
 * @returns {number} XP required
 */
export function calculateXPForLevel(level) {
    return Math.floor(100 * Math.pow(level, 1.5));
}

/**
 * Awards XP to a user and updates their level if needed
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} amount - XP to award
 * @param {boolean} incrementMessages - Whether to increment the message counter
 * @returns {Promise<Object>} Updated level data and whether they leveled up
 */
export async function awardXp(guildId, userId, amount, incrementMessages = true) {
    const data = await getUserData('levels', guildId, userId) || { xp: 0, level: 0, messages: 0 };
    
    data.xp += amount;
    if (incrementMessages) {
        data.messages = (data.messages || 0) + 1;
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
export function clearCooldowns() {
    cooldowns.clear();
}
