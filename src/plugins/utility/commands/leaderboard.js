// Leaderboard Command
// Show the top users by level/XP
import { logger } from './utils/logger.js';

import { getAllUserData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

export default {
import { logger } from '../../../utils/logger.js';
    name: 'leaderboard',
    description: 'Show the top users by level or XP',
    category: 'Utility',
    
    dmPermission: true,
    options: [
        {
            name: 'type',
            description: 'What to rank by',
            type: 3, // STRING
            required: false,
            choices: [
                { name: 'Level', value: 'level' },
                { name: 'XP', value: 'xp' },
                { name: 'Messages', value: 'messages' }
            ]
        },
        {
            name: 'limit',
            description: 'Number of users to show (default: 10)',
            type: 4, // INTEGER
            required: false,
            min_value: 1,
            max_value: 25
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const type = interaction.options.getString('type') || 'level';
            const limit = interaction.options.getInteger('limit') || 10;
            
            // Get all level data for the guild
            const allLevelData = await getAllUserData('levels', interaction.guild.id);
            
            if (allLevelData.length === 0) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFFA500,
                        title: '[INFO] No Data',
                        description: 'No leveling data available yet.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: 64
                });
            }
            
            // Sort based on type
            const sorted = allLevelData
                .filter(data => data.data && (data.data.xp || data.data.level || data.data.messages))
                .map(data => ({
                    userId: data.user_id,
                    xp: data.data.xp || 0,
                    level: data.data.level || 0,
                    messages: data.data.messages || 0
                }))
                .sort((a, b) => {
                    if (type === 'level') {return b.level - a.level;}
                    if (type === 'xp') {return b.xp - a.xp;}
                    if (type === 'messages') {return b.messages - a.messages;}
                    return 0;
                })
                .slice(0, limit);
            
            // Get user objects
            const userMap = new Map();
            for (const entry of sorted) {
                try {
                    const user = await interaction.client.users.fetch(entry.userId);
                    userMap.set(entry.userId, user);
                } catch (err) {
                    // User not found, skip
                }
            }
            
            // Create leaderboard fields
            const typeLabel = type === 'level' ? 'Level' : type === 'xp' ? 'XP' : 'Messages';
            const fields = sorted.map((entry, index) => {
                const user = userMap.get(entry.userId);
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                const value = type === 'level' ? `Level ${entry.level}` :
                    type === 'xp' ? `${formatNumber(entry.xp)} XP` :
                        `${formatNumber(entry.messages)} messages`;
                
                return {
                    name: `${medal} ${user ? user.tag : 'Unknown User'}`,
                    value: value,
                    inline: false
                };
            });
            
            const leaderboardEmbed = {
                color: 0x3498DB,
                title: `[LEADERBOARD] Top ${typeLabel}`,
                description: `Top ${limit} users by ${typeLabel.toLowerCase()}`,
                fields: fields,
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [leaderboardEmbed] });
            
        } catch (error) {
            logger.error('[ERROR] Leaderboard command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while getting leaderboard.',
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

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}
