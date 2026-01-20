// Purge Command
// Deletes multiple messages from a channel

import { ApplicationCommandType, PermissionsBitField } from 'discord.js';
import { sendModLog } from '../utils/modLog.js';

export default {
    name: 'purge',
    description: 'Delete multiple messages from a channel',
    category: 'Moderation',
    type: ApplicationCommandType.ChatInput,
    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    dmPermission: false,
    options: [
        {
            name: 'amount',
            description: 'Number of messages to delete (1-100)',
            type: 4, // INTEGER type
            required: true,
            min_value: 1,
            max_value: 100
        },
        {
            name: 'user',
            description: 'Only delete messages from this user',
            type: 6, // USER type
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for deleting messages',
            type: 3, // STRING type
            required: false
        }
    ],
    
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
            
            // Check if bulkDelete failed to delete messages (messages older than 14 days)
            if (deletedMessages.size === 0 && messages.size > 0) {
                return interaction.reply({
                    content: 'Could not delete messages - they may be older than 14 days.',
                    ephemeral: true
                });
            }
            
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
            
            // Send mod log (create a pseudo-target for purge actions)
            await sendModLog(interaction.guild, {
                action: 'purge',
                target: targetUser || interaction.user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `#${channel.name}`,
                    'Messages Deleted': `${deletedMessages.size}`,
                    'Filter': targetUser ? `Messages from ${targetUser.tag}` : 'All messages'
                }
            });
            
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
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
