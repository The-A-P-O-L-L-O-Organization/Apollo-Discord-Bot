import type { ChatInputCommandInteraction } from 'discord.js';
import { AttachmentBuilder, MessageFlags } from 'discord.js';
import { exportAnalytics, cleanupExport } from '../../../../utils/exportAnalytics.js';
import { readFileSync } from 'fs';
import { logger } from '../../../../utils/logger.js';
import { i18n } from '../../../../i18n/index.js';

/**
 * Handles analytics export
 */
export async function handleExport(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const format = interaction.options.getString('format', true);
    const days = interaction.options.getInteger('days') ?? 30;
    const guildId = interaction.guild!.id;

    try {
        // Export the data
        const result = await exportAnalytics(guildId, format, {
            types: ['commands', 'messages', 'violations', 'modactions', 'members'],
            days
        });

        // Read the file
        const fileData = readFileSync(result.filepath);
        const attachment = new AttachmentBuilder(fileData, { name: result.filename });

        await interaction.editReply({
            content: t('analytics.exportOk', { format: format.toUpperCase(), days, size: (result.size / 1024).toFixed(2) }),
            files: [attachment]
        });

        // Clean up the temporary file after 5 seconds
        setTimeout(() => {
            cleanupExport(result.filepath);
        }, 5000);

    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Analytics export failed:' });
        await interaction.editReply({
            content: t('analytics.exportFail')
        });
    }
}
