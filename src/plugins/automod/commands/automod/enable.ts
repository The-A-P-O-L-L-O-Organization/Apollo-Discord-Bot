import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../../../../utils/db.js';
import { logger } from '../../../../utils/logger.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleEnable(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const cfg = await getGuildData('automod', interaction.guild!.id);
    cfg['enabled'] = true;
    await setGuildData('automod', interaction.guild!.id, cfg);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('enable.title'))
        .setDescription(t('enable.description'))
        .addFields({
            name: t('enable.nextStepsTitle'),
            value: t('enable.nextStepsValue')
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ msg: '[AUTOMOD] Enabled', guild: interaction.guild!.name });
}
