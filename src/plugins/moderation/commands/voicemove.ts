// Voice Move Command - Move a user to a different voice channel
import type { ChatInputCommandInteraction, VoiceChannel } from 'discord.js';
import { PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'voicemove',
    description: 'Move a user to a different voice channel',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.MoveMembers,
    dmPermission: false,
    options: [
        { name: 'user', description: 'The user to move', type: 6, required: true },
        { name: 'channel', description: 'The voice channel to move the user to', type: 7, required: true, channel_types: [ChannelType.GuildVoice] },
        { name: 'reason', description: 'The reason for moving', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            const targetChannel = interaction.options.getChannel('channel') as VoiceChannel | null;
            const reason = interaction.options.getString('reason') ?? t('voicemove.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.missingUserTitle'),
                    description: t('voicemove.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!targetChannel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.errorMissingChannel'),
                    description: t('voicemove.pleaseSpecifyAValidVoice'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.memberNotFoundTitle'),
                    description: t('voicemove.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.errorNotInVoiceChannel'),
                    description: t('voicemove.userIsNotCurrentlyIn', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!targetChannel.permissionsFor(interaction.guild!.members.me!).has('MoveMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.errorMissingPermissions'),
                    description: t('voicemove.iDoNotHavePermission'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel.permissionsFor(interaction.guild!.members.me!).has('MoveMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.errorMissingPermissions2'),
                    description: t('voicemove.iDoNotHavePermission2'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.selfActionTitle'),
                    description: t('voicemove.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.botProtectionTitle'),
                    description: t('voicemove.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicemove.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const sourceChannelName = member.voice.channel.name;
            const targetChannelName = targetChannel.name;

            await member.voice.setChannel(targetChannel, reason);

            trackModAction(interaction.guild!.id, interaction.user.id, 'voice_move');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'voice_move',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('voicemove.successUserMoved'),
                description: t('voicemove.userHasBeenMovedFrom', { user: user.tag, sourceChannel: sourceChannelName, targetChannel: targetChannelName }),
                fields: [
                    { name: t('voicemove.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('voicemove.fieldCaseId'), value: t('voicemove.caseid', { caseId: caseId }), inline: true },
                    { name: t('voicemove.fieldReason'), value: reason, inline: false },
                    { name: t('voicemove.infoFrom'), value: sourceChannelName, inline: true },
                    { name: t('voicemove.infoTo'), value: targetChannelName, inline: true },
                    { name: t('voicemove.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'voice_move',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: { 'From Channel': sourceChannelName, 'To Channel': targetChannelName, 'Case ID': `#${caseId}` }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was moved from ${sourceChannelName} to ${targetChannelName} by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('voicemove.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};