// Voice Mute Command - Server mute a user in a voice channel
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
    name: 'voicemute',
    description: 'Server mute a user in a voice channel',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.MuteMembers,
    dmPermission: false,
    options: [
        { name: 'user', description: 'The user to mute', type: 6, required: true },
        { name: 'reason', description: 'The reason for muting', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('voicemute.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemute.missingUserTitle'),
                    description: t('voicemute.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemute.memberNotFoundTitle'),
                    description: t('voicemute.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemute.errorNotInVoiceChannel'),
                    description: t('voicemute.userIsNotCurrentlyIn', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (member.voice.serverMute) {
                const errorEmbed = {
                    color: 0xFFFF00,
                    title: t('voicemute.infoAlreadyMuted'),
                    description: t('voicemute.userIsAlreadyServerMuted', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel.permissionsFor(interaction.guild!.members.me!).has('MuteMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemute.errorMissingPermissions'),
                    description: t('voicemute.iDoNotHavePermission'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemute.selfActionTitle'),
                    description: t('voicemute.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemute.botProtectionTitle'),
                    description: t('voicemute.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemute.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const channelName = member.voice.channel.name;

            await member.voice.setMute(true, reason);

            trackModAction(interaction.guild!.id, interaction.user.id, 'voice_mute');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'voice_mute',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('voicemute.successUserMuted'),
                description: t('voicemute.userHasBeenServerMuted', { user: user.tag, channelName: channelName }),
                fields: [
                    { name: t('voicemute.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('voicemute.fieldCaseId'), value: t('voicemute.caseid', { caseId: caseId }), inline: true },
                    { name: t('voicemute.fieldReason'), value: reason, inline: false },
                    { name: t('voicemute.infoChannel'), value: channelName, inline: true },
                    { name: t('voicemute.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'voice_mute',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: { 'Channel': channelName, 'Case ID': `#${caseId}` }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was voice muted by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('voicemute.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};