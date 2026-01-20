// Kick Command
// Removes a user from the server with a specified reason

import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../utils/modLog.js';

export default {
    name: 'kick',
    description: 'Kick a user from the server',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.KickMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to kick',
            type: 6, // USER type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for kicking',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            // Get the user to kick
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Check if user exists
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to kick.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Get the guild member using improved fetching
            const member = await fetchMember(interaction.guild, user.id);
            
            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Member Not Found',
                    description: 'This user is not a member of the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the member can be kicked
            if (!member.kickable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Kick',
                    description: 'I cannot kick this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the user is trying to kick themselves
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot kick yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Kick the user
            await member.kick(reason);
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Kicked',
                description: `${user.tag} has been kicked from the server.`,
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
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Send mod log
            await sendModLog(interaction.guild, {
                action: 'kick',
                target: user,
                moderator: interaction.user,
                reason: reason
            });
            
            // Log the action
            console.log(`[MODERATION] User ${user.tag} was kicked by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Kick command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to kick the user.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error.message,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};
