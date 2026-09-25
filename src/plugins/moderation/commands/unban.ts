import { logger } from '../../../utils/logger.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { sendModLog } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { removeTempban } from '../../../utils/tempbanScheduler.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'unban',
    description: 'Unban a previously banned user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-id',
            description: 'The ID of the user to unban',
            type: 3,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for unbanning',
            type: 3,
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const userId = interaction.options.getString('user-id')!;
            const reason = interaction.options.getString('reason') ?? t('unban.noReason');

            if (!userId) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unban.missingUserIdTitle'),
                    description: t('unban.pleaseProvideTheIdOf'),
                    fields: [
                        {
                            name: t('unban.hintHowToGetUser'),
                            value: t('unban.enableDeveloperModeInDiscord')
                        }
                    ],
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!/^\d{17,19}$/.test(userId)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unban.errorInvalidUserId'),
                    description: t('unban.pleaseProvideAValidDiscord'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const ban = await interaction.guild!.bans.fetch(userId).catch(() => null);

            if (!ban) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('unban.errorNotBanned'),
                    description: t('unban.thisUserIsNotBanned'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const bannedUser = ban.user;

            await interaction.guild!.bans.remove(userId, reason);

            await removeTempban(interaction.guild!.id, userId);

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'unban',
                targetId: userId,
                targetTag: `User ID: ${userId}`,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('unban.successUserUnbanned'),
                description: t('unban.userIdUseridHasBeen', { userId: userId }),
                fields: [
                    {
                        name: t('unban.fieldModerator'),
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: t('unban.fieldCaseId'),
                        value: t('unban.caseid', { caseId: caseId }),
                        inline: true
                    },
                    {
                        name: t('unban.fieldReason'),
                        value: reason,
                        inline: false
                    },
                    {
                        name: t('unban.fieldUserId'),
                        value: userId,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'unban',
                target: { tag: `User ID: ${userId}`, id: userId, displayAvatarURL: () => null },
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Case ID': `#${caseId}`
                }
            });

            logger.info({ msg: `[MODERATION] User ${bannedUser.tag} was unbanned by ${interaction.user.tag}. Reason: ${reason}` });

        } catch (error) {
            logger.error({ msg: '[ERROR] Unban command error:', err: error });

            const errorEmbed = {
                color: 0xFF0000,
                title: t('unban.commandFailedTitle'),
                description: t('unban.commandFailedDescription'),
                fields: [
                    {
                        name: t('unban.errorDetails'),
                        value: (error as Error).message,
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