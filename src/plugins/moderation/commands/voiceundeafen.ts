// Voice Undeafen Command - Server undeafen a user in a voice channel
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
    name: 'voiceundeafen',
    description: 'Server undeafen a user in a voice channel',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.DeafenMembers,
    dmPermission: false,
    options: [
        { name: 'user', description: 'The user to undeafen', type: 6, required: true },
        { name: 'reason', description: 'The reason for undeafening', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('voiceundeafen.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceundeafen.missingUserTitle'),
                    description: t('voiceundeafen.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceundeafen.memberNotFoundTitle'),
                    description: t('voiceundeafen.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceundeafen.errorNotInVoiceChannel'),
                    description: t('voiceundeafen.userIsNotCurrentlyIn', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.serverDeaf) {
                const errorEmbed = {
                    color: 0xFFFF00,
                    title: t('voiceundeafen.infoNotDeafened'),
                    description: t('voiceundeafen.userIsNotCurrentlyServer', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel.permissionsFor(interaction.guild!.members.me!).has('DeafenMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceundeafen.errorMissingPermissions'),
                    description: t('voiceundeafen.iDoNotHavePermission'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceundeafen.selfActionTitle'),
                    description: t('voiceundeafen.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceundeafen.botProtectionTitle'),
                    description: t('voiceundeafen.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voiceundeafen.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const channelName = member.voice.channel.name;

            await member.voice.setDeaf(false, reason);

            trackModAction(interaction.guild!.id, interaction.user.id, 'voice_undeafen');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'voice_undeafen',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('voiceundeafen.successUserUndeafened'),
                description: t('voiceundeafen.userHasBeenServerUndeafened', { user: user.tag, channelName: channelName }),
                fields: [
                    { name: t('voiceundeafen.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('voiceundeafen.fieldCaseId'), value: t('voiceundeafen.caseid', { caseId: caseId }), inline: true },
                    { name: t('voiceundeafen.fieldReason'), value: reason, inline: false },
                    { name: t('voiceundeafen.infoChannel'), value: channelName, inline: true },
                    { name: t('voiceundeafen.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'voice_undeafen',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: { 'Channel': channelName, 'Case ID': `#${caseId}` }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was voice undeafened by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('voiceundeafen.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};