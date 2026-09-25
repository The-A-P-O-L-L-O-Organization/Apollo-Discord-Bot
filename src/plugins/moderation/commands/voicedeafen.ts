// Voice Deafen Command - Server deafen a user in a voice channel
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
    name: 'voicedeafen',
    description: 'Server deafen a user in a voice channel',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.DeafenMembers,
    dmPermission: false,
    options: [
        { name: 'user', description: 'The user to deafen', type: 6, required: true },
        { name: 'reason', description: 'The reason for deafening', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('voicedeafen.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedeafen.missingUserTitle'),
                    description: t('voicedeafen.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedeafen.memberNotFoundTitle'),
                    description: t('voicedeafen.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedeafen.errorNotInVoiceChannel'),
                    description: t('voicedeafen.userIsNotCurrentlyIn', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (member.voice.serverDeaf) {
                const errorEmbed = {
                    color: 0xFFFF00,
                    title: t('voicedeafen.infoAlreadyDeafened'),
                    description: t('voicedeafen.userIsAlreadyServerDeafened', { user: user.tag }),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.voice.channel.permissionsFor(interaction.guild!.members.me!).has('DeafenMembers')) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedeafen.errorMissingPermissions'),
                    description: t('voicedeafen.iDoNotHavePermission'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedeafen.selfActionTitle'),
                    description: t('voicedeafen.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedeafen.botProtectionTitle'),
                    description: t('voicedeafen.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('voicedeafen.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const channelName = member.voice.channel.name;

            await member.voice.setDeaf(true, reason);

            trackModAction(interaction.guild!.id, interaction.user.id, 'voice_deafen');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'voice_deafen',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('voicedeafen.successUserDeafened'),
                description: t('voicedeafen.userHasBeenServerDeafened', { user: user.tag, channelName: channelName }),
                fields: [
                    { name: t('voicedeafen.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('voicedeafen.fieldCaseId'), value: t('voicedeafen.caseid', { caseId: caseId }), inline: true },
                    { name: t('voicedeafen.fieldReason'), value: reason, inline: false },
                    { name: t('voicedeafen.infoChannel'), value: channelName, inline: true },
                    { name: t('voicedeafen.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'voice_deafen',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: { 'Channel': channelName, 'Case ID': `#${caseId}` }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was voice deafened by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('voicedeafen.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};