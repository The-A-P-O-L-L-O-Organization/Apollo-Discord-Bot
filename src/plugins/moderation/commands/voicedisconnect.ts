// Voice Disconnect Command - Disconnect a user from a voice channel
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
    name: 'voicedisconnect',
    description: 'Disconnect a user from a voice channel',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.MoveMembers,
    dmPermission: false,
    options: [
        { name: 'user', description: 'The user to disconnect', type: 6, required: true },
        { name: 'reason', description: 'The reason for disconnecting', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('voicedisconnect.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedisconnect.missingUserTitle'),
                    description: t('voicedisconnect.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedisconnect.memberNotFoundTitle'),
                    description: t('voicedisconnect.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedisconnect.errorNotInVoiceChannel'),
                    description: t('voicedisconnect.userIsNotCurrentlyIn', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel.permissionsFor(interaction.guild!.members.me!).has('MoveMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedisconnect.errorMissingPermissions'),
                    description: t('voicedisconnect.iDoNotHavePermission'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedisconnect.selfActionTitle'),
                    description: t('voicedisconnect.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedisconnect.botProtectionTitle'),
                    description: t('voicedisconnect.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedisconnect.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const channelName = member.voice.channel.name;

            await member.voice.disconnect(reason);

            trackModAction(interaction.guild!.id, interaction.user.id, 'voice_disconnect');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'voice_disconnect',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('voicedisconnect.successUserDisconnected'),
                description: t('voicedisconnect.userHasBeenDisconnectedFrom', { user: user.tag, channelName: channelName }),
                fields: [
                    { name: t('voicedisconnect.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('voicedisconnect.fieldCaseId'), value: t('voicedisconnect.caseid', { caseId: caseId }), inline: true },
                    { name: t('voicedisconnect.fieldReason'), value: reason, inline: false },
                    { name: t('voicedisconnect.infoChannel'), value: channelName, inline: true },
                    { name: t('voicedisconnect.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'voice_disconnect',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: { 'Channel': channelName, 'Case ID': `#${caseId}` }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was disconnected from voice by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('voicedisconnect.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};