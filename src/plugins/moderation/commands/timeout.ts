import { logger } from '../../../utils/logger.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { formatDuration, validateDuration } from '../../../utils/duration.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'timeout',
    description: 'Timeout a user (Discord native timeout)',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        { name: 'user', description: 'The user to timeout', type: 6, required: true },
        { name: 'duration', description: 'Timeout duration (e.g., 10m, 1h, 1d, 7d)', type: 3, required: true },
        { name: 'reason', description: 'The reason for timeout', type: 3, required: false }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') ?? t('timeout.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('timeout.missingUserTitle'),
                    description: t('timeout.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const validation = validateDuration(durationStr ?? '');
            if (!validation.valid || validation.durationMs == null) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('timeout.errorInvalidDuration'),
                    description: validation.error ?? t('timeout.invalidDuration'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const durationMs = validation.durationMs;
            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('timeout.memberNotFoundTitle'),
                    description: t('timeout.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('timeout.errorCannotTimeout'),
                    description: t('timeout.iCannotTimeoutThisUser'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('timeout.selfActionTitle'),
                    description: t('timeout.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('timeout.botProtectionTitle'),
                    description: t('timeout.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('timeout.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            await member.timeout(durationMs, reason);

            trackModAction(interaction.guild!.id, interaction.client.user.id, 'timeout');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'timeout',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const durationDisplay = formatDuration(durationMs);

            const successEmbed = {
                color: 0x00FF00,
                title: t('timeout.successUserTimedOut'),
                description: t('timeout.userHasBeenTimedOut', { user: user.tag, duration: durationDisplay }),
                fields: [
                    { name: t('timeout.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('timeout.fieldCaseId'), value: t('timeout.caseid', { caseId: caseId }), inline: true },
                    { name: t('timeout.fieldReason'), value: reason, inline: false },
                    { name: t('timeout.fieldDuration'), value: durationDisplay, inline: true },
                    { name: t('timeout.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'timeout',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: { 'Duration': durationDisplay, 'Case ID': `#${caseId}` }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was timed out by ${interaction.user.tag} for ${durationDisplay}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('timeout.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};