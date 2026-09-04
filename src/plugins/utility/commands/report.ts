import { MessageContextMenuCommandInteraction, MessageFlags } from 'discord.js';
import { ContextMenuCommandBuilder, ApplicationCommandType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
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

            const modal = new ModalBuilder()
                .setCustomId('report_reason_modal')
                .setTitle('Report Message')
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('reason')
                            .setLabel('Reason for report')
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder('Please describe why you are reporting this message...')
                            .setRequired(true)
                            .setMaxLength(500)
                    )
                );

            await interaction.showModal(modal);

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