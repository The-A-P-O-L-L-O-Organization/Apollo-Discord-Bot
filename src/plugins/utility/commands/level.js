// Level Command
export default {
// View your current level and experience points
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { getUserData } from '../../../utils/db.js';
import { calculateXPForLevel } from '../../../utils/xp.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

    name: 'level',
    description: 'View your current level and experience points',
    category: 'Utility',
    
    dmPermission: true,
    options: [
        {
            name: 'user',
            description: 'User to check level for',
            type: 6, // USER type
            required: false
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const user = interaction.options.getUser('user') || interaction.user;
            
            // Get level data
            const levelData = await getUserData('levels', interaction.guild.id, user.id) || {
                xp: 0,
                level: 0,
                messages: 0
            };
            
            // Calculate XP needed for next level
            const xpForNextLevel = calculateXPForLevel(levelData.level + 1);
            const currentLevelXP = calculateXPForLevel(levelData.level);
            const xpProgress = levelData.xp - currentLevelXP;
            const xpNeeded = xpForNextLevel - currentLevelXP;
            const progressPercent = Math.floor((xpProgress / xpNeeded) * 100);
            
            // Create progress bar
            const progressBar = createProgressBar(progressPercent);
            
            const levelEmbed = {
                color: 0x3498DB,
                title: `[LEVEL] ${user.tag}`,
                description: `${user}'s level and experience`,
                fields: [
                    {
                        name: '[INFO] Level',
                        value: `**${levelData.level}**`,
                        inline: true
                    },
                    {
                        name: '[INFO] XP',
                        value: `**${formatNumber(levelData.xp)}** / ${formatNumber(xpForNextLevel)}`,
                        inline: true
                    },
                    {
                        name: '[INFO] Total Messages',
                        value: `${formatNumber(levelData.messages)}`,
                        inline: true
                    },
                    {
                        name: '[PROGRESS] To Level ${levelData.level + 1}',
                        value: `${progressBar} ${progressPercent}%`,
                        inline: false
                    },
                    {
                        name: '[INFO] XP Needed',
                        value: `${formatNumber(xpNeeded - xpProgress)} more XP`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (user.displayAvatarURL()) {
                levelEmbed.thumbnail = {
                    url: user.displayAvatarURL({ dynamic: true })
                };
            }
            
            await interaction.reply({ embeds: [levelEmbed] });
            
        } catch (error) {
            logger.error('[ERROR] Level command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while getting level information.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}

} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
};

/**
 * Create a visual progress bar
 */
function createProgressBar(percent, length = 20) {
    const filled = Math.floor((percent / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format large numbers with K/M suffixes
 */
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}
