// Massmute Command - Timeout multiple users
import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { formatDuration, validateDuration } from '../../../utils/duration.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'massmute',
    description: 'Timeout multiple users',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-ids',
            description: 'Comma-separated list of user IDs to timeout',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'duration',
            description: 'Timeout duration (e.g., 10m, 1h, 1d, 7d)',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for timeout',
            type: 3, // STRING type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const userIdsStr = interaction.options.getString('user-ids');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') ?? t('massmute.noReason');

            if (!userIdsStr) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('massmute.errorMissingUserIds'),
                    description: t('massmute.pleaseProvideACommaSeparated'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Parse and validate duration
            const validation = validateDuration(durationStr ?? '');
            if (!validation.valid || validation.durationMs == null) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('massmute.errorInvalidDuration'),
                    description: validation.error ?? t('massmute.invalidDuration'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const durationMs = validation.durationMs;

            // Parse user IDs
            const userIds = userIdsStr.split(/[,\s]+/).filter(id => id.trim() && /^\d{17,19}$/.test(id.trim()));

            if (userIds.length === 0) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('massmute.errorNoValidUserIds'),
                    description: t('massmute.pleaseProvideValidUserIds'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (userIds.length > 50) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('massmute.errorTooManyUsers'),
                    description: t('massmute.maximumUsersPerMassMute'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            // Check for self/bot
            if (userIds.includes(interaction.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('massmute.selfActionTitle'),
                    description: t('massmute.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (userIds.includes(interaction.client.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('massmute.botProtectionTitle'),
                    description: t('massmute.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const results = {
                success: [] as { userId: string; userTag: string; caseId: number }[],
                failed: [] as { userId: string; error: string }[]
            };

            for (const userId of userIds) {
                try {
                    // Rate limit: 100ms delay between operations to avoid Discord API limits
                    await new Promise(resolve => setTimeout(resolve, 100));

                    const member = await fetchMember(interaction.guild!, userId);

                    if (!member) {
                        results.failed.push({ userId, error: t('massmute.userNotInServer') });
                        continue;
                    }

                    if (!member.moderatable) {
                        results.failed.push({ userId, error: t('massmute.cannotTimeoutHigherPermissionsOr') });
                        continue;
                    }

                    const hierarchy = canModerate(interaction.guild!, interaction.member, member);
                    if (!hierarchy.ok) {
                        results.failed.push({ userId, error: hierarchy.reason ?? t('massmute.hierarchyTitle') });
                        continue;
                    }

                    const userTag = member.user.tag;

                    await member.timeout(durationMs, `[MASSMUTE] ${reason}`);

                    trackModAction(interaction.guild!.id, interaction.user.id, 'massmute');

                    const caseId = await createModCase(interaction.guild!.id, {
                        type: 'massmute',
                        targetId: userId,
                        targetTag: userTag,
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        reason: reason
                    });

                    results.success.push({ userId, userTag, caseId });

                    await sendModLog(interaction.guild!, {
                        action: 'massmute',
                        target: member.user,
                        moderator: interaction.user,
                        reason: reason,
                        extra: {
                            'Duration': formatDuration(durationMs),
                            'Case ID': `#${caseId}`,
                            'Batch': 'Mass Mute'
                        }
                    });

                } catch (error) {
                    results.failed.push({ userId, error: (error as Error).message });
                }
            }

            await flushAnalyticsCritical();

            const durationDisplay = formatDuration(durationMs);

            const successEmbed = {
                color: results.failed.length === 0 ? 0x00FF00 : 0xFFFF00,
                title: results.failed.length === 0 ? '[SUCCESS] Mass Mute Complete' : '[PARTIAL] Mass Mute Complete',
                description: t('massmute.processedCountUserSCount2', { count: userIds.length, count2: results.success.length, count3: results.failed.length }),
                fields: [
                    { name: t('massmute.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('massmute.fieldDuration'), value: durationDisplay, inline: true },
                    { name: t('massmute.fieldReason'), value: reason, inline: false }
                ],
                timestamp: new Date().toISOString()
            };

            if (results.success.length > 0) {
                successEmbed.fields.push({
                    name: t('massmute.successTimedOutCount', { count: results.success.length }),
                    value: results.success.map(r => `• ${r.userTag} (\`${r.userId}\`) - Case #${r.caseId}`).join('\n'),
                    inline: false
                });
            }

            if (results.failed.length > 0) {
                successEmbed.fields.push({
                    name: t('massmute.errorFailedCount', { count: results.failed.length }),
                    value: results.failed.map(r => `• \`${r.userId}\` - ${r.error}`).join('\n'),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [successEmbed] });

            logger.info({ msg: `[MODERATION] Mass mute by ${interaction.user.tag}: ${results.success.length} success, ${results.failed.length} failed. Duration: ${durationDisplay}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('massmute.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};