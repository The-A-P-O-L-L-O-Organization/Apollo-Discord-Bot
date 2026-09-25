// Raidmode Command - Enable or disable raid mode (locks all channels)
import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { enableRaidMode, disableRaidMode, isRaidModeEnabled } from '../../../utils/raidDetection.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'raidmode',
    description: 'Enable or disable raid mode (locks all channels)',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.Administrator,
    dmPermission: false,
    options: [
        {
            name: 'action',
            description: 'Enable or disable raid mode',
            type: 3,
            required: true,
            choices: [
                { name: 'Enable', value: 'enable' },
                { name: 'Disable', value: 'disable' },
                { name: 'Status', value: 'status' }
            ]
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const action = interaction.options.getString('action');

            if (action === 'status') {
                const isEnabled = await isRaidModeEnabled(interaction.guild!.id);

                const embed = new EmbedBuilder()
                    .setColor(isEnabled ? '#FF0000' : '#00FF00')
                    .setTitle(t('raidmode.raidModeStatus'))
                    .setDescription(t('raidmode.raidModeIsCurrentlyValue', { value: isEnabled ? 'ENABLED' : 'DISABLED' }))
                    .setTimestamp();

                if (isEnabled) {
                    embed.addFields({
                        name: t('raidmode.note'),
                        value: 'All channels are locked. Use `/raidmode disable` to unlock.',
                        inline: false
                    });
                }

                await interaction.reply({ embeds: [embed] });

            } else if (action === 'enable') {
                await interaction.deferReply();

                const result = await enableRaidMode(interaction.guild!);

                if (!result.success) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('raidmode.errorAlreadyEnabled'),
                            description: result.reason,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle(t('raidmode.raidModeEnabled'))
                    .setDescription(t('raidmode.allChannelsHaveBeenLocked'))
                    .addFields(
                        { name: t('raidmode.channelsLocked'), value: t('raidmode.value', { value: result.locked }), inline: true },
                        { name: t('raidmode.failed'), value: t('raidmode.value2', { value: result.failed }), inline: true },
                        { name: t('raidmode.totalChannels'), value: t('raidmode.value3', { value: result.total }), inline: true }
                    )
                    .addFields({
                        name: t('raidmode.nextSteps'),
                        value: '• Review recent member joins\n• Ban raiders manually\n• Use `/raidmode disable` when clear',
                        inline: false
                    })
                    .setTimestamp()
                    .setFooter({ text: `Activated by ${interaction.user.tag}` });

                await interaction.editReply({ embeds: [embed] });

                logger.info({ msg: `[RAID] Raid mode enabled by ${interaction.user.tag} in ${interaction.guild!.name}` });

            } else if (action === 'disable') {
                await interaction.deferReply();

                const result = await disableRaidMode(interaction.guild!);

                if (!result.success) {
                    return interaction.editReply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('raidmode.errorNotEnabled'),
                            description: result.reason,
                            timestamp: new Date().toISOString()
                        }]
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(t('raidmode.successRaidModeDisabled'))
                    .setDescription(t('raidmode.allChannelsHaveBeenUnlocked'))
                    .addFields(
                        { name: t('raidmode.channelsUnlocked'), value: t('raidmode.value4', { value: result.unlocked }), inline: true },
                        { name: t('raidmode.failed2'), value: t('raidmode.value5', { value: result.failed }), inline: true },
                        { name: t('raidmode.totalChannels2'), value: t('raidmode.value6', { value: result.total }), inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Deactivated by ${interaction.user.tag}` });

                await interaction.editReply({ embeds: [embed] });

                logger.info({ msg: `[RAID] Raid mode disabled by ${interaction.user.tag} in ${interaction.guild!.name}` });
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('raidmode.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};