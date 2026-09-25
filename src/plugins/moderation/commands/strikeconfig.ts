// Strike Config Command
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface StrikeConfig {
    banThreshold?: number;
    kickThreshold?: number;
    autoKick?: boolean;
    [key: string]: unknown;
}

export default {
    name: 'strikeconfig',
    description: 'Configure strike system settings',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'action',
            description: 'Configuration action',
            type: 3,
            required: true,
            choices: [
                { name: 'View Settings', value: 'view' },
                { name: 'Set Ban Threshold', value: 'ban_threshold' },
                { name: 'Set Kick Threshold', value: 'kick_threshold' },
                { name: 'Toggle Auto-Kick', value: 'auto_kick' }
            ]
        },
        {
            name: 'value',
            description: 'The value to set (for threshold settings)',
            type: 4,
            required: false,
            min_value: 1,
            max_value: 10
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const action = interaction.options.getString('action', true);
            const value = interaction.options.getInteger('value');

            const guildSettings = (await getGuildData('strike-config', interaction.guild!.id)) as StrikeConfig;

            if (action === 'view') {
                const banThreshold = guildSettings.banThreshold ?? 3;
                const kickThreshold = guildSettings.kickThreshold ?? 2;
                const autoKick = guildSettings.autoKick ?? true;

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(t('strikeconfig.strikeSystemConfiguration'))
                    .setDescription(t('strikeconfig.currentStrikeSystemSettingsFor'))
                    .addFields(
                        { name: t('strikeconfig.banThreshold'), value: t('strikeconfig.valueStrikes', { value: banThreshold }), inline: true },
                        { name: t('strikeconfig.kickThreshold'), value: t('strikeconfig.valueStrikes2', { value: kickThreshold }), inline: true },
                        { name: t('strikeconfig.autoKickEnabled'), value: autoKick ? 'Yes' : 'No', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: t('strikeconfig.useStrikeconfigToModifySettings') });

                await interaction.reply({ embeds: [embed] });

            } else if (action === 'ban_threshold') {
                if (!value) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('strikeconfig.errorMissingValue'),
                            description: t('strikeconfig.pleaseProvideAValueFor'),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                guildSettings.banThreshold = value;
                await setGuildData('strike-config', interaction.guild!.id, guildSettings);

                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: t('strikeconfig.successSettingUpdated'),
                        description: t('strikeconfig.banThresholdSetToValue', { value: value }),
                        timestamp: new Date().toISOString()
                    }]
                });

                logger.info({ msg: `[CONFIG] Ban threshold set to ${value} in ${interaction.guild!.name}` });

            } else if (action === 'kick_threshold') {
                if (!value) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('strikeconfig.errorMissingValue2'),
                            description: t('strikeconfig.pleaseProvideAValueFor2'),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                guildSettings.kickThreshold = value;
                await setGuildData('strike-config', interaction.guild!.id, guildSettings);

                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: t('strikeconfig.successSettingUpdated2'),
                        description: t('strikeconfig.kickThresholdSetToValue', { value: value }),
                        timestamp: new Date().toISOString()
                    }]
                });

                logger.info({ msg: `[CONFIG] Kick threshold set to ${value} in ${interaction.guild!.name}` });

            } else if (action === 'auto_kick') {
                const currentState = guildSettings.autoKick ?? true;
                const newState = !currentState;

                guildSettings.autoKick = newState;
                await setGuildData('strike-config', interaction.guild!.id, guildSettings);

                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: t('strikeconfig.successSettingUpdated3'),
                        description: t('strikeconfig.autoKickIsNowValue', { value: newState ? 'enabled' : 'disabled' }),
                        timestamp: new Date().toISOString()
                    }]
                });

                logger.info({ msg: `[CONFIG] Auto-kick ${newState ? 'enabled' : 'disabled'} in ${interaction.guild!.name}` });
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('strikeconfig.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};