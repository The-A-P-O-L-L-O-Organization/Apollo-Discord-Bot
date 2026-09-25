import { logger } from '../../../utils/logger.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'softban',
    description: 'Softban a user (ban + immediate unban to clear messages)',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to softban',
            type: 6,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for softbanning',
            type: 3,
            required: false
        },
        {
            name: 'delete-days',
            description: 'Number of days of messages to delete (0-7)',
            type: 4,
            required: false,
            min_value: 0,
            max_value: 7
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') ?? t('softban.noReason');
            const deleteDays = interaction.options.getInteger('delete-days') ?? 1;

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('softban.missingUserTitle'),
                    description: t('softban.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (deleteDays < 0 || deleteDays > 7) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('softban.errorInvalidValue'),
                    description: t('softban.deleteDaysMustBeBetween'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (member && !member.bannable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('softban.errorCannotSoftban'),
                    description: t('softban.iCannotBanThisUser'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('softban.selfActionTitle'),
                    description: t('softban.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('softban.botProtectionTitle'),
                    description: t('softban.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('softban.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            await interaction.guild!.bans.create(user.id, {
                reason: `[SOFTBAN] ${reason}`,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });

            await interaction.guild!.bans.remove(user.id, `[SOFTBAN] Softban completed - ${reason}`);

            trackModAction(interaction.guild!.id, interaction.client.user.id, 'softban');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'softban',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('softban.successUserSoftbanned'),
                description: t('softban.userHasBeenSoftbannedBanned', { user: user.tag }),
                fields: [
                    { name: t('softban.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('softban.fieldCaseId'), value: t('softban.caseid', { caseId: caseId }), inline: true },
                    { name: t('softban.fieldReason'), value: reason, inline: false },
                    { name: t('softban.infoDeleteDays'), value: t('softban.deletedaysDays', { deleteDays: deleteDays }), inline: true },
                    { name: t('softban.fieldUserId'), value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'softban',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Delete Days': `${deleteDays} days`,
                    'Case ID': `#${caseId}`
                }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was softbanned by ${interaction.user.tag}. Reason: ${reason}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('softban.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};