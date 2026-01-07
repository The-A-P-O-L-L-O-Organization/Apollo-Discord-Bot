// Ban Command
// Bans a user from the server with a specified reason

import { ApplicationCommandType, PermissionsBitField } from 'discord.js';

export default {
    name: 'ban',
    description: 'Ban a user from the server',
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    
    async execute(interaction) {
        try {
            // Get the user to ban
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete-days') || 0;
            
            // Check if user exists
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to ban.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if delete days is valid
            if (deleteDays < 0 || deleteDays > 7) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Value',
                    description: 'Delete days must be between 0 and 7.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Get the guild member if they're in the server
            const member = interaction.guild.members.cache.get(user.id);
            
            // Check if the member can be banned
            if (member && !member.bannable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Ban',
                    description: 'I cannot ban this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the user is trying to ban themselves
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot ban yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check if the user is trying to ban the bot
            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot ban the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Ban the user
            await interaction.guild.bans.create(user.id, {
                reason: reason,
                deleteMessageDays: deleteDays
            });
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Banned',
                description: `${user.tag} has been banned from the server.`,
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
                        name: '[INFO] Delete Days',
                        value: `${deleteDays} days`,
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
            
            // Log the action
            console.log(`[MODERATION] User ${user.tag} was banned by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Ban command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to ban the user.',
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

