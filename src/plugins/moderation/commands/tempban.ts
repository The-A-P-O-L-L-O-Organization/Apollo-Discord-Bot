// Tempban Command - Temporarily ban a user from the server
import type { ChatInputCommandInteraction} from 'discord.js';
import { MessageFlags } from 'discord.js';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { addTempban } from '../../../utils/tempbanScheduler.js';
import { createModCase } from './case.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'tempban',
    description: 'Temporarily ban a user from the server',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to temporarily ban',
            type: 6,
            required: true
        },
        {
            name: 'duration',
            description: 'Duration (e.g., 1h, 1d, 1w)',
            type: 3,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for the temporary ban',
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
            const durationStr = interaction.options.getString('duration') ?? '';
            const reason = interaction.options.getString('reason') ?? t('tempban.noReason');
            const deleteDays = interaction.options.getInteger('delete-days') ?? 0;

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('tempban.missingUserTitle'),
                    description: t('tempban.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const match = /^(\d+)([mhdw])$/.exec(durationStr);
            if (!match) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('tempban.errorInvalidDuration'),
                    description: t('tempban.invalidDurationFormatUse1m'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const value = parseInt(match[1] ?? '');
            const unit = match[2];

            let durationMs: number;
            let durationText: string;

            switch (unit) {
            case 'm':
                durationMs = value * 60000;
                durationText = `${value} minute(s)`;
                break;
            case 'h':
                durationMs = value * 3600000;
                durationText = `${value} hour(s)`;
                break;
            case 'd':
                durationMs = value * 86400000;
                durationText = `${value} day(s)`;
                break;
            case 'w':
                durationMs = value * 604800000;
                durationText = `${value} week(s)`;
                break;
            default:
                durationMs = 0;
                durationText = '';
            }

            if (durationMs < 60000) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('tempban.errorDurationTooShort'),
                    description: t('tempban.minimumTempbanDurationIsMinute'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (member && !member.bannable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('tempban.errorCannotBan'),
                    description: t('tempban.iCannotBanThisUser'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('tempban.selfActionTitle'),
                    description: t('tempban.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('tempban.botProtectionTitle'),
                    description: t('tempban.botProtectionDescription'),
                    timestamp: new Date().toISOString()
                };
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                return;
            }

            const bannedAt = Date.now();
            const unbanAt = bannedAt + durationMs;

            await interaction.guild!.bans.create(user.id, {
                reason: `Temporary ban by ${interaction.user.tag}: ${reason} (Duration: ${durationText})`,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });

            await addTempban({
                userId: user.id,
                guildId: interaction.guild!.id,
                reason: reason,
                duration: durationText,
                bannedAt: bannedAt,
                unbanAt: unbanAt,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag
            });

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'tempban',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason,
                duration: durationText
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('tempban.successUserTemporarilyBanned'),
                description: t('tempban.userHasBeenTemporarilyBanned', { user: user.tag }),
                fields: [
                    { name: t('tempban.fieldModerator'), value: interaction.user.tag, inline: true },
                    { name: t('tempban.fieldDuration'), value: durationText, inline: true },
                    { name: t('tempban.fieldCaseId'), value: t('tempban.caseid', { caseId: caseId }), inline: true },
                    { name: t('tempban.fieldReason'), value: reason, inline: false },
                    { name: t('tempban.infoUnbanTime'), value: t('tempban.tValueFNT', { value: Math.floor(unbanAt / 1000), value2: Math.floor(unbanAt / 1000) }), inline: false },
                    { name: t('tempban.fieldUserId'), value: user.id, inline: true },
                    { name: t('tempban.infoDeleteDays'), value: t('tempban.deletedaysDays', { deleteDays: deleteDays }), inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'tempban',
                target: user,
                moderator: interaction.user,
                reason: reason,
                duration: durationText,
                extra: {
                    'Duration': durationText,
                    'Unban Time': `<t:${Math.floor(unbanAt / 1000)}:F>`,
                    'Delete Days': `${deleteDays} days`,
                    'Case ID': `#${caseId}`
                }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was temporarily banned by ${interaction.user.tag}. Duration: ${durationText}. Reason: ${reason}. Case ID: ${caseId}` });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('tempban.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};