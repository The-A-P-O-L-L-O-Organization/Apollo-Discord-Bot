// Purge Command
// Deletes multiple messages from a channel

import { ApplicationCommandType, PermissionsBitField } from 'discord.js';

export default {
    name: 'purge',
    description: 'Delete multiple messages from a channel',
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    dmPermission: false,
    
    async execute(interaction) {
        try {
            // Get the number of messages to delete
            const amount = interaction.options.getInteger('amount');
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            // Validate amount
            if (!amount || amount < 1 || amount > 100) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Amount',
                    description: 'Please specify a number between 1 and 100.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Get the channel
            const channel = interaction.channel;
            
            // Check if we can delete messages
            if (!channel.permissionsFor(interaction.client.user).has(PermissionsBitField.Flags.ManageMessages)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing Permissions',
                    description: 'I do not have permission to delete messages in this channel.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Fetch messages
            let messages = await channel.messages.fetch({ limit: amount });
            
            // Filter by user if specified
            if (targetUser) {
                messages = messages.filter(msg => msg.author.id === targetUser.id);
                
                // Limit to 100 messages max
                messages = new Map([...messages].slice(0, 100));
            }
            
            // Check if there are messages to delete
            if (messages.size === 0) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] No Messages Found',
                    description: targetUser 
                        ? `No messages from ${targetUser.tag} found to delete.`
                        : 'No messages found to delete.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Bulk delete messages
            const deletedMessages = await channel.bulkDelete(messages, true);
            
            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] Messages Deleted',
                description: `Successfully deleted ${deletedMessages.size} message(s).`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Channel',
                        value: channel.name,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            // Add user filter info if applicable
            if (targetUser) {
                successEmbed.fields.splice(3, 0, {
                    name: '[INFO] Filtered User',
                    value: targetUser.tag,
                    inline: true
                });
            }
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Log the action
            console.log(`[MODERATION] ${deletedMessages.size} messages deleted by ${interaction.user.tag}. Channel: ${channel.name}. Reason: ${reason}`);
            
        } catch (error) {
            console.error('[ERROR] Purge command error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to delete messages.',
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

