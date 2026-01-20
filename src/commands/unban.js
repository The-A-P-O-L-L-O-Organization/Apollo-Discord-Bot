// Unban Command
// Unbans a previously banned user from the server

import { PermissionsBitField } from 'discord.js';
import { sendModLog } from '../utils/modLog.js';

export default {
    name: 'unban',
    description: 'Unban a previously banned user',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-id',
            description: 'The ID of the user to unban',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for unbanning',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            // Get the user ID to unban
            const userId = interaction.options.getString('user-id');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if user ID is provided
            if (!userId) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User ID',
                    description: 'Please provide the ID of the user to unban.',
                    fields: [
                        {
                            name: '[HINT] How to get user ID',
                            value: '1. Enable Developer Mode in Discord settings\n2. Right-click on the user\n3. Select "Copy ID"'
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Validate user ID format
            if (!/^\d{17,19}$/.test(userId)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid User ID',
                    description: 'Please provide a valid Discord user ID (17-19 digits).',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the user is actually banned
            const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
            
            if (!ban) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Not Banned',
                    description: 'This user is not banned from the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Get the banned user object for logging
            const bannedUser = ban.user;
            
            // Unban the user
            await interaction.guild.bans.remove(userId, reason);
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Unbanned',
                description: `${bannedUser.tag} has been unbanned from the server.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: true
                    },
                    {
                        name: '[INFO] User ID',
                        value: userId,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'unban',
                target: bannedUser,
                moderator: interaction.user,
                reason: reason
            });
            
            // Log the action
            console.log(`[MODERATION] User ${bannedUser.tag} was unbanned by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Unban command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to unban the user.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
