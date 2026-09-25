// Masskick Command - Kick multiple users
import type { ChatInputCommandInteraction} from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'masskick',
    description: 'Kick multiple users',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.KickMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-ids',
            description: 'Comma-separated list of user IDs to kick',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for kicking',
            type: 3, // STRING type
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const userIdsStr = interaction.options.getString('user-ids');
            const reason = interaction.options.getString('reason') ?? t('masskick.noReason');

            if (!userIdsStr) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('masskick.errorMissingUserIds'),
                    description: t('masskick.pleaseProvideACommaSeparated'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Parse user IDs
            const userIds = userIdsStr.split(/[,\s]+/).filter(id => id.trim() && /^\d{17,19}$/.test(id.trim()));

            if (userIds.length === 0) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('masskick.errorNoValidUserIds'),
                    description: t('masskick.pleaseProvideValidUserIds'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (userIds.length > 50) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('masskick.errorTooManyUsers'),
                    description: t('masskick.maximumUsersPerMassKick'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check for self/bot
            if (userIds.includes(interaction.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('masskick.selfActionTitle'),
                    description: t('masskick.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (userIds.includes(interaction.client.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('masskick.botProtectionTitle'),
                    description: t('masskick.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Confirmation prompt for dangerous operation
            const confirmEmbed = {
                color: 0xFFFF00,
                title: t('masskick.warnConfirmMassKick'),
                description: t('masskick.youAreAboutToKick', { count: userIds.length, reason: reason }),
                timestamp: new Date().toISOString()
            };

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_masskick')
                        .setLabel(t('masskick.confirmKick'))
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_masskick')
                        .setLabel(t('masskick.cancel'))
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: MessageFlags.Ephemeral });

            // Wait for button interaction
            const collector = interaction.channel!.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 30000,
                max: 1
            });

            collector.on('collect', (i) => { void (async () => {
                if (i.customId === 'cancel_masskick') {
                    await i.update({ content: t('masskick.massKickCancelled'), embeds: [], components: [] });
                    return;
                }

                if (i.customId === 'confirm_masskick') {
                    await i.update({ content: t('masskick.processingMassKick'), embeds: [], components: [] });

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
                                results.failed.push({ userId, error: t('masskick.userNotInServer') });
                                continue;
                            }

                            if (!member.kickable) {
                                results.failed.push({ userId, error: t('masskick.cannotKickHigherPermissionsOr') });
                                continue;
                            }

                            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
                            if (!hierarchy.ok) {
                                results.failed.push({ userId, error: hierarchy.reason ?? t('masskick.hierarchyTitle') });
                                continue;
                            }

                            const userTag = member.user.tag;

                            await member.kick(`[MASSKICK] ${reason}`);

                            trackModAction(interaction.guild!.id, interaction.user.id, 'masskick');

                            const caseId = await createModCase(interaction.guild!.id, {
                                type: 'masskick',
                                targetId: userId,
                                targetTag: userTag,
                                moderatorId: interaction.user.id,
                                moderatorTag: interaction.user.tag,
                                reason: reason
                            });

                            results.success.push({ userId, userTag, caseId });

                            await sendModLog(interaction.guild!, {
                                action: 'masskick',
                                target: member.user,
                                moderator: interaction.user,
                                reason: reason,
                                extra: {
                                    'Case ID': `#${caseId}`,
                                    'Batch': 'Mass Kick'
                                }
                            });

                        } catch (error) {
                            results.failed.push({ userId, error: (error as Error).message });
                        }
                    }

                    await flushAnalyticsCritical();

                    const successEmbed = {
                        color: results.failed.length === 0 ? 0x00FF00 : 0xFFFF00,
                        title: results.failed.length === 0 ? '[SUCCESS] Mass Kick Complete' : '[PARTIAL] Mass Kick Complete',
                        description: t('masskick.processedCountUserSCount2', { count: userIds.length, count2: results.success.length, count3: results.failed.length }),
                        fields: [
                            { name: t('masskick.fieldModerator'), value: interaction.user.tag, inline: true },
                            { name: t('masskick.fieldReason'), value: reason, inline: false }
                        ],
                        timestamp: new Date().toISOString()
                    };

                    if (results.success.length > 0) {
                        successEmbed.fields.push({
                            name: t('masskick.successKickedCount', { count: results.success.length }),
                            value: results.success.map(r => `• ${r.userTag} (\`${r.userId}\`) - Case #${r.caseId}`).join('\n'),
                            inline: false
                        });
                    }

                    if (results.failed.length > 0) {
                        successEmbed.fields.push({
                            name: t('masskick.errorFailedCount', { count: results.failed.length }),
                            value: results.failed.map(r => `• \`${r.userId}\` - ${r.error}`).join('\n'),
                            inline: false
                        });
                    }

                    await interaction.editReply({ embeds: [successEmbed] });

                    logger.info({ msg: `[MODERATION] Mass kick by ${interaction.user.tag}: ${results.success.length} success, ${results.failed.length} failed. Reason: ${reason}` });
                }
            })(); });

            collector.on('end', (collected) => {
                if (collected.size === 0) {
                    interaction.editReply({ content: t('masskick.massKickTimedOut30s'), embeds: [], components: [] }).catch(() => undefined);
                }
            });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('masskick.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};