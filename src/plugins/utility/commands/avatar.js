import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';
export default {
// Avatar Command
// Display a user's avatar
import { logger } from '../../../utils/logger.js';

    name: 'avatar',
    description: 'Display a user\'s avatar',
    category: 'Utility',
    
    dmPermission: true,
    options: [
        {
            name: 'user',
            description: 'The user to get avatar for',
            type: 6, // USER type
            required: false
        },
        {
            name: 'server',
            description: 'Show server-specific avatar instead of global',
            type: 5, // BOOLEAN
            required: false
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            const user = interaction.options.getUser('user') || interaction.user;
            const serverAvatar = interaction.options.getBoolean('server') || false;
            
            // Get member if checking server avatar
            let member = null;
            let avatarURL = null;
            let avatarType = 'Global Avatar';
            
            if (serverAvatar && interaction.guild) {
                member = await interaction.guild.members.fetch(user.id);
                if (member && member.avatar) {
                    avatarURL = member.avatarURL({ dynamic: true, size: 4096 });
                    avatarType = 'Server Avatar';
                }
            }
            
            // Fall back to global avatar
            if (!avatarURL) {
                avatarURL = user.displayAvatarURL({ dynamic: true, size: 4096 });
            }
            
            // Determine format
            const format = avatarURL.includes('.gif') ? 'GIF' : 'PNG';
            
            // Create avatar embed
            const avatarEmbed = {
                color: 0x3498DB,
                title: `[AVATAR] ${user.tag}`,
                description: `${avatarType} (${format})`,
                image: {
                    url: avatarURL
                },
                fields: [
                    {
                        name: '[INFO] User ID',
                        value: user.id,
                        inline: true
                    },
                    {
                        name: '[LINK] Download',
                        value: `[Click here](${avatarURL})`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [avatarEmbed] });
            
        } catch (error) {
            logger.error('[ERROR] Avatar command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while getting avatar.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
