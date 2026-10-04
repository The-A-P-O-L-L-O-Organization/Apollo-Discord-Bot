import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData, setGuildData } from '../../../../utils/db.js';
import { logger } from '../../../../utils/logger.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleAddWord(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const word = interaction.options.getString('word', true).toLowerCase();
    const guildConfig = await getGuildData('automod', interaction.guild!.id);

    const bannedWords = guildConfig['bannedWords'] as string[] ?? [];
    guildConfig['bannedWords'] = bannedWords;

    if (bannedWords.includes(word)) {
        await interaction.reply({
            embeds: [{
                color: 0xFFFF00,
                title: t('addWord.alreadyTitle'),
                description: t('addWord.alreadyDescription', { word }),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    bannedWords.push(word);
    await setGuildData('automod', interaction.guild!.id, guildConfig);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('addWord.addedTitle'))
        .setDescription(t('addWord.addedDescription', { word }))
        .addFields({ name: t('addWord.totalTitle'), value: `${bannedWords.length}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    logger.info({ msg: '[AUTOMOD] Added banned word', guild: interaction.guild!.name });
}
