import type { MessageContextMenuCommandInteraction} from 'discord.js';
import { MessageFlags, ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { i18n } from '../../../i18n/index.js';

export default {
    data: new ContextMenuCommandBuilder()
        .setName('ReportMessage')
        .setType(ApplicationCommandType.Message),
    name: 'reportmessage',
    description: 'Report a message to the moderators',
    category: 'Utility',

    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const message = interaction.options.getMessage('message');

            if (!message) {
                await interaction.reply({
                    content: t('report.notFound'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (message.author.id === interaction.user.id) {
                await interaction.reply({
                    content: t('report.ownMessage'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const reasonModal = {
                title: t('report.modalTitle'),
                custom_id: 'report_reason_modal',
                components: [{
                    type: 1,
                    components: [{
                        type: 4,
                        custom_id: 'reason',
                        label: t('report.reasonLabel'),
                        style: 2,
                        placeholder: t('report.reasonPlaceholder'),
                        required: true,
                        max_length: 500
                    }]
                }]
            };

            await interaction.showModal(reasonModal);

        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] Report command error' });
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');

            const errorEmbed = {
                color: 0xFF0000,
                title: t('report.failedTitle'),
                description: t('report.failedDesc'),
                fields: [
                    {
                        name: t('report.details'),
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