// Report Command
// Context menu command for users to report messages to moderators
import { logger } from './utils/logger.js';

import { ContextMenuCommandBuilder } from '@discordjs/builders';
import { ApplicationCommandType } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
import { logger } from '../../../utils/logger.js';
    data: new ContextMenuCommandBuilder()
        .setName('ReportMessage')
        .setType(ApplicationCommandType.Message),
    name: 'reportmessage',
    description: 'Report a message to the moderators',
    category: 'Utility',
    
    async execute(interaction) {
        try {
            try {
                // Get the message that was reported
                const message = interaction.options.getMessage('message');
                
                if (!message) {
                    return interaction.reply({ 
                        content: '[ERROR] Could not find the message to report.',
                        flags: 64 
                    });
                }
                
                // Can't report your own message
                if (message.author.id === interaction.user.id) {
                    return interaction.reply({
                        content: '[ERROR] You cannot report your own message.',
                        flags: 64
                    });
                }
                
                // Get report reason from user
                const reasonModal = {
                    title: 'Report Message',
                    custom_id: 'report_reason_modal',
                    components: [{
                        type: 1, // ActionRow
                        components: [{
                            type: 4, // TextInput
                            custom_id: 'reason',
                            label: 'Reason for report',
                            style: 2, // Paragraph
                            placeholder: 'Please describe why you are reporting this message...',
                            required: true,
                            max_length: 500
                        }]
                    }]
                };
                
                // Show modal for reason
                await interaction.showModal(reasonModal);
                
                // Handle modal submission in interactionCreate event
                // This will be handled by the modal handler
                
            } catch (error) {
                logger.error('[ERROR] Report command error:', error);
                
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Report Failed',
                    description: 'An error occurred while trying to report the message.',
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
    }
};
