import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData, setGuildData } from '../../../../utils/db.js';
import { logger } from '../../../../utils/logger.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleRemoveWord(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const word = interaction.options.getString('word', true).toLowerCase();
    const guildConfig = await getGuildData('automod', interaction.guild!.id);

    const bannedWords = guildConfig['bannedWords'] as string[] ?? [];

    if (!bannedWords.includes(word)) {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('removeWord.notFoundTitle'),
                description: t('removeWord.notFoundDescription', { word }),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    guildConfig['bannedWords'] = bannedWords.filter((w: string) => w !== word);
    await setGuildData('automod', interaction.guild!.id, guildConfig);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('removeWord.removedTitle'))
        .setDescription(t('removeWord.removedDescription', { word }))
        .addFields({ name: t('removeWord.totalTitle'), value: `${(guildConfig['bannedWords'] as string[]).length}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info({ msg: '[AUTOMOD] Removed banned word', guild: interaction.guild!.name });
}
