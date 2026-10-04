import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getAutomodConfig } from '../../../../utils/automod.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const cfg = await getAutomodConfig(interaction.guild!.id);
    const state = cfg.enabled ? t('status.stateEnabled') : t('status.stateDisabled');
    const onOff = (on: boolean) => on ? t('status.stateEnabled') : t('status.stateDisabled');
    const yesNo = (on: boolean) => on ? t('status.yes') : t('status.no');

    const embed = new EmbedBuilder()
        .setColor(cfg.enabled ? '#00FF00' : '#FF0000')
        .setTitle(t('status.title'))
        .setDescription(t('status.statusLine', { state }))
        .addFields(
            { name: t('status.fieldFilterInvites'), value: yesNo(cfg.filterInvites), inline: true },
            { name: t('status.fieldFilterLinks'), value: yesNo(cfg.filterLinks), inline: true },
            { name: t('status.fieldFilterPhishing'), value: yesNo(cfg.filterPhishingLinks), inline: true },
            { name: t('status.fieldRaid'), value: onOff(cfg.raidDetection), inline: true },
            { name: t('status.fieldMaxMentions'), value: `${cfg.maxMentions}`, inline: true },
            { name: t('status.fieldMaxCaps'), value: `${cfg.maxCapsPercent}%`, inline: true },
            { name: t('status.fieldMinAge'), value: cfg.minAccountAge > 0 ? t('status.minAgeValue', { count: cfg.minAccountAge }) : t('status.stateDisabled'), inline: true },
            { name: t('status.fieldSpam'), value: t('status.spamValue', { threshold: cfg.spamThreshold, seconds: cfg.spamInterval / 1000 }), inline: true },
            { name: t('status.fieldBannedWords'), value: cfg.bannedWords.length > 0 ? t('status.bannedValue', { count: cfg.bannedWords.length }) : t('status.noneConfigured'), inline: true },
            { name: t('status.fieldExemptChannels'), value: t('status.exemptValue', { count: cfg.exemptChannels.length }), inline: true },
            { name: t('status.fieldExemptRoles'), value: t('status.roleValue', { count: cfg.exemptRoles.length }), inline: true },
            { name: t('status.fieldAi'), value: onOff(cfg.aiModeration), inline: true },
            { name: t('status.fieldNsfw'), value: onOff(cfg.nsfwFilter), inline: true }
        )
        .setTimestamp()
        .setFooter({ text: t('status.footer') });

    await interaction.reply({ embeds: [embed] });
}
