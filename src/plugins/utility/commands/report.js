import { logger } from '../../../utils/logger.js';
import { ContextMenuCommandBuilder } from '@discordjs/builders';
import { ApplicationCommandType } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    data: new ContextMenuCommandBuilder()
        .setName('ReportMessage')
        .setType(ApplicationCommandType.Message),
    name: 'reportmessage',
    description: 'Report a message to the moderators',
    category: 'Utility',

    async execute(interaction) {
        try {
            const message = interaction.options.getMessage('message');

            if (!message) {
                return interaction.reply({
                    content: '[ERROR] Could not find the message to report.',
                    flags: 64
                });
            }

            if (message.author.id === interaction.user.id) {
                return interaction.reply({
                    content: '[ERROR] You cannot report your own message.',
                    flags: 64
                });
            }

            const reasonModal = {
                title: 'Report Message',
                custom_id: 'report_reason_modal',
                components: [{
                    type: 1,
                    components: [{
                        type: 4,
                        custom_id: 'reason',
                        label: 'Reason for report',
                        style: 2,
                        placeholder: 'Please describe why you are reporting this message...',
                        required: true,
                        max_length: 500
                    }]
                }]
            };

            await interaction.showModal(reasonModal);

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
    }
};