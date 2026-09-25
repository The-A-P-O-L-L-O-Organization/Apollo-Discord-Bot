import { logger } from '../../../utils/logger.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'ban',
    description: 'Ban a user from the server',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to ban',
            type: 6, // USER type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for banning',
            type: 3, // STRING type
            required: false
        },
        {
            name: 'delete-days',
            description: 'Number of days of messages to delete (0-7)',
            type: 4, // INTEGER type
            required: false,
            min_value: 0,
            max_value: 7
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            // Get the user to ban
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('ban.noReason');
            const deleteDays = interaction.options.getInteger('delete-days') ?? 0;

            // Check if user exists
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('ban.missingUserTitle'),
                    description: t('ban.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check if delete days is valid
            if (deleteDays < 0 || deleteDays > 7) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('ban.errorInvalidValue'),
                    description: t('ban.deleteDaysMustBeBetween'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Get the guild member if they're in the server (using improved fetching)
            const member = await fetchMember(interaction.guild!, user.id);

            // Check if the member can be banned (if they're in the server)
            if (member && !member.bannable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('ban.errorCannotBan'),
                    description: t('ban.iCannotBanThisUser'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check if the user is trying to ban themselves
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('ban.selfActionTitle'),
                    description: t('ban.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Check if the user is trying to ban the bot
            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('ban.botProtectionTitle'),
                    description: t('ban.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Hierarchy check
            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('ban.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            // Ban the user
            await interaction.guild!.bans.create(user.id, {
                reason: reason,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });

            // Track and flush analytics immediately for this critical action
            trackModAction(interaction.guild!.id, interaction.client.user.id, 'ban');
            await flushAnalyticsCritical();

            // Create mod case
            const caseId = await createModCase(interaction.guild!.id, {
                type: 'ban',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            // Create success embed
            const successEmbed = {
                color: 0x00FF00,
                title: t('ban.successUserBanned'),
                description: t('ban.userHasBeenBannedFrom', { user: user.tag }),
                fields: [
                    {
                        name: t('ban.fieldModerator'),
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: t('ban.fieldCaseId'),
                        value: t('ban.caseid', { caseId: caseId }),
                        inline: true
                    },
                    {
                        name: t('ban.fieldReason'),
                        value: reason,
                        inline: false
                    },
                    {
                        name: t('ban.infoDeleteDays'),
                        value: t('ban.deletedaysDays', { deleteDays: deleteDays }),
                        inline: true
                    },
                    {
                        name: t('ban.fieldUserId'),
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            // Send mod log
            await sendModLog(interaction.guild!, {
                action: 'ban',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Delete Days': `${deleteDays} days`,
                    'Case ID': `#${caseId}`
                }
            });

            // Log the action
            logger.info({ msg: `[MODERATION] User ${user.tag} was banned by ${interaction.user.tag}. Reason: ${reason}` });

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: t('ban.commandFailedTitle'),
                description: t('ban.commandFailedDescription'),
                fields: [
                    {
                        name: t('ban.errorDetails'),
                        value: safeError(error),
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};