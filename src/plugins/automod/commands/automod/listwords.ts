import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getAutomodConfig } from '../../../../utils/automod.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleListWords(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const cfg = await getAutomodConfig(interaction.guild!.id);

    if (cfg.bannedWords.length === 0) {
        await interaction.reply({
            embeds: [{
                color: 0xFFFF00,
                title: t('listWords.title'),
                description: t('listWords.emptyDescription'),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Censor the words partially for display
    const censoredWords = cfg.bannedWords.map(w => {
        if (w.length <= 2) { return '*'.repeat(w.length); }
        return w[0] + '*'.repeat(w.length - 2) + w[w.length - 1];
    });

    const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(t('listWords.title'))
        .setDescription(t('listWords.description', { count: cfg.bannedWords.length, words: censoredWords.join(', ') }))
        .setTimestamp()
        .setFooter({ text: t('listWords.footer') });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
