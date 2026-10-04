import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData, setGuildData } from '../../../../utils/db.js';
import { logger } from '../../../../utils/logger.js';
import { i18n } from '../../../../i18n/index.js';

export async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
    const resolved = await i18n.resolveLocale({ locale: interaction.locale ?? null, guildLocale: interaction.guildLocale ?? null, guildId: interaction.guildId ?? null });
    const t = i18n.getFixedT(resolved, 'automod');
    const setting = interaction.options.getString('setting', true);
    const valueStr = interaction.options.getString('value', true);

    // Parse value based on setting type
    let value: boolean | number;
    const booleanSettings = ['filterInvites', 'filterLinks', 'filterPhishingLinks', 'raidDetection', 'aiModeration', 'nsfwFilter'];
    const numberSettings = ['maxMentions', 'maxCapsPercent', 'minAccountAge', 'spamThreshold', 'spamInterval'];

    if (booleanSettings.includes(setting)) {
        value = valueStr.toLowerCase() === 'true' || valueStr === '1';
    } else if (numberSettings.includes(setting)) {
        value = parseInt(valueStr);
        if (isNaN(value)) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('set.invalidValueTitle'),
                    description: t('set.numberRequired', { setting }),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Validate ranges
        if (setting === 'maxCapsPercent' && (value < 0 || value > 100)) {
            await interaction.reply({
                embeds: [{
                    color: 0xFF0000,
                    title: t('set.invalidValueTitle'),
                    description: t('set.capsRange'),
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Validate positive numbers for numeric settings (except maxCapsPercent which can be 0)
        if (setting !== 'maxCapsPercent' && value <= 0) {
            await interaction.reply({
                content: t('set.positive', { setting }),
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    } else {
        await interaction.reply({
            embeds: [{
                color: 0xFF0000,
                title: t('set.invalidSettingTitle'),
                description: t('set.unknownSetting', { setting }),
                timestamp: new Date().toISOString()
            }],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const cfg = await getGuildData('automod', interaction.guild!.id);
    cfg[setting] = value;
    await setGuildData('automod', interaction.guild!.id, cfg);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(t('set.updatedTitle'))
        .setDescription(t('set.updatedDescription', { setting, value }))
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    logger.info({ msg: '[AUTOMOD] Setting updated', setting, value, guild: interaction.guild!.name });
}
