// Voice Unmute Command - Server unmute a user in a voice channel
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'voiceunmute',
    description: 'Server unmute a user in a voice channel',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.MuteMembers,
    dmPermission: false,
    options: [
        { name: 'user', description: 'The user to unmute', type: 6, required: true },
        { name: 'reason', description: 'The reason for unmuting', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('voiceunmute.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceunmute.missingUserTitle'),
                    description: t('voiceunmute.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceunmute.memberNotFoundTitle'),
                    description: t('voiceunmute.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceunmute.errorNotInVoiceChannel'),
                    description: t('voiceunmute.userIsNotCurrentlyIn', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.serverMute) {
                const errorEmbed = {
                    color: 0xFFFF00,
                    title: t('voiceunmute.infoNotMuted'),
                    description: t('voiceunmute.userIsNotCurrentlyServer', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel.permissionsFor(interaction.guild!.members.me!).has('MuteMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceunmute.errorMissingPermissions'),
                    description: t('voiceunmute.iDoNotHavePermission'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceunmute.selfActionTitle'),
                    description: t('voiceunmute.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceunmute.botProtectionTitle'),
                    description: t('voiceunmute.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceunmute.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const channelName = member.voice.channel.name;

            await member.voice.setMute(false, reason);

            trackModAction(interaction.guild!.id, interaction.user.id, 'voice_unmute');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'voice_unmute',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('voiceunmute.successUserUnmuted'),
                description: t('voiceunmute.userHasBeenServerUnmuted', { user: user.tag, channelName: channelName }),
                fields: [
                    { name: t('voiceunmute.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('voiceunmute.fieldCaseId'), value: t('voiceunmute.caseid', { caseId: caseId }), inline: true },
                    { name: t('voiceunmute.fieldReason'), value: reason, inline: false },
                    { name: t('voiceunmute.infoChannel'), value: channelName, inline: true },
                    { name: t('voiceunmute.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'voice_unmute',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: { 'Channel': channelName, 'Case ID': `#${caseId}` }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was voice unmuted by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('voiceunmute.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};