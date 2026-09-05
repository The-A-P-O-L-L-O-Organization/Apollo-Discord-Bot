import { MessageContextMenuCommandInteraction, MessageFlags, ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { logger } from '../../../utils/logger.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    data: new ContextMenuCommandBuilder()
        .setName('ReportMessage')
        .setType(ApplicationCommandType.Message),
    name: 'reportmessage',
    description: 'Report a message to the moderators',
    category: 'Utility',

    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        try {
            const message = interaction.options.getMessage('message');

            if (!message) {
                await interaction.reply({
                    content: '[ERROR] Could not find the message to report.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (message.author.id === interaction.user.id) {
                await interaction.reply({
                    content: '[ERROR] You cannot report your own message.',
                    flags: MessageFlags.Ephemeral
                });
                return;
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
            logger.error({ err: error, msg: '[ERROR] Report command error' });

            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Report Failed',
                description: 'An error occurred while trying to report the message.',
                fields: [
                    {
                        name: '[ERROR] Details',
                        value: error instanceof Error ? error.message : 'Unknown error',
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        }
    }
};