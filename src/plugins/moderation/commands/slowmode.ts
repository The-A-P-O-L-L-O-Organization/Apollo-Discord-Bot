// Slowmode Command - Set channel slowmode (rate limit)
import type { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog } from '../../../utils/modLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'slowmode',
    description: 'Set channel slowmode (rate limit)',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageChannels,
    dmPermission: false,
    options: [
        {
            name: 'duration',
            description: 'Slowmode duration in seconds (0-21600, 0 to disable)',
            type: 4,
            required: true,
            min_value: 0,
            max_value: 21600
        },
        {
            name: 'channel',
            description: 'The channel to set slowmode on (defaults to current channel)',
            type: 7,
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for setting slowmode',
            type: 3,
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const duration = interaction.options.getInteger('duration') ?? 0;
            const channel = interaction.options.getChannel('channel') ?? interaction.channel;
            const reason = interaction.options.getString('reason') ?? t('slowmode.noReason');

            const textChannel = channel as TextChannel;

            if (!textChannel.isTextBased()) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('slowmode.errorInvalidChannel'),
                    description: t('slowmode.youCanOnlySetSlowmode'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (duration < 0 || duration > 21600) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('slowmode.errorInvalidDuration'),
                    description: t('slowmode.slowmodeDurationMustBeBetween'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const previousSlowmode = textChannel.rateLimitPerUser ?? 0;

            await textChannel.setRateLimitPerUser(duration, `Slowmode set by ${interaction.user.tag}: ${reason}`);

            let durationText;
            if (duration === 0) {
                durationText = 'Disabled';
            } else if (duration < 60) {
                durationText = `${duration} second(s)`;
            } else if (duration < 3600) {
                durationText = `${Math.floor(duration / 60)} minute(s)`;
            } else {
                durationText = `${Math.floor(duration / 3600)} hour(s)`;
            }

            const successEmbed = {
                color: 0x00FF00,
                title: duration === 0 ? '[SUCCESS] Slowmode Disabled' : '[SUCCESS] Slowmode Enabled',
                description: t('slowmode.slowmodeHasBeenDurationFor', { duration: duration === 0 ? 'disabled' : 'set', channelId: textChannel.id }),
                fields: [
                    { name: t('slowmode.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('slowmode.fieldDuration'), value: durationText, inline: true },
                    { name: t('slowmode.infoPrevious'), value: previousSlowmode === 0 ? 'Disabled' : `${previousSlowmode}s`, inline: true },
                    { name: t('slowmode.fieldReason'), value: reason, inline: false }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            if (textChannel.id !== interaction.channel!.id) {
                try {
                    const slowmodeNotice = {
                        color: duration === 0 ? 0x00FF00 : 0xFFFF00,
                        title: duration === 0 ? '[SLOWMODE] Disabled' : '[SLOWMODE] Enabled',
                        description: duration === 0 ?
                            'Slowmode has been disabled for this channel.' :
                            `Slowmode has been enabled. Members must wait ${durationText} between messages.`,
                        fields: [{ name: t('slowmode.fieldReason2'), value: reason, inline: false }],
                        timestamp: new Date().toISOString()
                    };
                    await textChannel.send({ embeds: [slowmodeNotice] });
                } catch (err) {
                    logger.info({ msg: '[WARNING] Could not send slowmode notice to channel:', err: (err as Error).message });
                }
            }

            await sendModLog(interaction.guild!, {
                action: 'slowmode',
                target: { tag: `#${textChannel.name}`, id: textChannel.id, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Channel': `<#${textChannel.id}>`,
                    'Duration': durationText,
                    'Previous': previousSlowmode === 0 ? 'Disabled' : `${previousSlowmode}s`
                }
            });

            logger.info({ msg: `[MODERATION] Slowmode ${duration === 0 ? 'disabled' : 'set to ' + duration + 's'} for channel ${textChannel.name} by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('slowmode.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};