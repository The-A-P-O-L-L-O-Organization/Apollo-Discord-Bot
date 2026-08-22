// Nickname Command
// Force nickname changes for users

import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

export default {
    name: 'nickname',
    description: 'Change a user\'s nickname',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ManageNicknames,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user whose nickname to change',
            type: 6, // USER type
            required: true
        },
        {
            name: 'nickname',
            description: 'The new nickname (leave empty to reset)',
            type: 3, // STRING type
            required: false,
            max_length: 32
        },
        {
            name: 'reason',
            description: 'The reason for changing the nickname',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {try {
try {

        try {
            // Get options
            const user = interaction.options.getUser('user');
            const nickname = interaction.options.getString('nickname');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if user exists
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Get the guild member
            const member = await fetchMember(interaction.guild, user.id);
            
            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Member Not Found',
                    description: 'This user is not a member of the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Check if the member's nickname can be changed
            if (!member.manageable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Change Nickname',
                    description: 'I cannot change this user\'s nickname. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Check if the user is trying to change their own nickname when they shouldn't
            if (user.id === interaction.guild.ownerId && interaction.user.id !== interaction.guild.ownerId) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Change Nickname',
                    description: 'You cannot change the server owner\'s nickname.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Store old nickname
            const oldNickname = member.nickname || member.user.username;
            
            // Change nickname
            await member.setNickname(nickname, 
                `Nickname change by ${interaction.user.tag}: ${reason}`);
            
            // Format new nickname
            const newNickname = nickname || user.username;
            const action = nickname ? 'changed' : 'reset';
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: `[SUCCESS] Nickname ${nickname ? 'Changed' : 'Reset'}`,
                description: `${user.tag}'s nickname has been ${action}.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Old Nickname',
                        value: oldNickname,
                        inline: true
                    },
                    {
                        name: '[INFO] New Nickname',
                        value: newNickname,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: false
                    },
                    {
                        name: '[INFO] User ID',
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'nickname',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Old Nickname': oldNickname,
                    'New Nickname': newNickname
                }
            });
            
            // Log the action
            console.log(`[MODERATION] User ${user.tag}'s nickname was ${action} by ${interaction.user.tag}. Old: "${oldNickname}", New: "${newNickname}". Reason: ${reason}`);
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to change the nickname.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: safeError(error),
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
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
