import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../../../../utils/db.js';
import { logger } from '../../../../utils/logger.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleDisable(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const cfg = await getGuildData('automod', interaction.guild!.id);
    cfg['enabled'] = false;
    await setGuildData('automod', interaction.guild!.id, cfg);

    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle(t('disable.title'))
        .setDescription(t('disable.description'))
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ msg: '[AUTOMOD] Disabled', guild: interaction.guild!.name });
}
