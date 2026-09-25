import { logger } from '../../../utils/logger.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { setUserData } from '../../../utils/db.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'mute',
    description: 'Temporarily mute a user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.MuteMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to mute',
            type: 6,
            required: true
        },
        {
            name: 'duration',
            description: 'Duration (e.g., 1m, 1h, 1d, 1w)',
            type: 3,
            required: false
        },
        {
            name: 'reason',
            description: 'The reason for muting',
            type: 3,
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const user = interaction.options.getUser('user');
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') ?? t('mute.noReason');

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('mute.missingUserTitle'),
                    description: t('mute.missingUserDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild!, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('mute.memberNotFoundTitle'),
                    description: t('mute.memberNotFoundDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('mute.errorCannotMute'),
                    description: t('mute.iCannotMuteThisUser'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('mute.selfActionTitle'),
                    description: t('mute.selfActionDescription'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild!, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('mute.hierarchyTitle'),
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            let durationMs = 3600000;
            let durationText = '1 hour';

            if (duration) {
                const match = /^(\d+)([mhdw])$/.exec(duration);
                if (!match) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: t('mute.errorInvalidDuration'),
                        description: t('mute.invalidDurationFormatUse1m'),
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }

                const value = parseInt(match[1]!);
                const unit = match[2]!;

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
                }
            }

            const maxTimeout = 28 * 24 * 60 * 60 * 1000;
            if (durationMs > maxTimeout) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('mute.errorDurationTooLong'),
                    description: t('mute.maximumMuteDurationIsDays'),
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const roleIds = Array.from(member.roles.cache.keys()).filter(roleId => roleId !== interaction.guild!.id);
            await setUserData('muted-roles', interaction.guild!.id, user.id, {
                roles: roleIds,
                mutedAt: Date.now()
            });

            try {
                await member.timeout(durationMs, reason);
            } catch {
                logger.info({ msg: '[INFO] Timeout failed, checking for mute role...' });

                let muteRole = interaction.guild!.roles.cache.find(
                    role => role.name === 'Muted'
                );

                if (!muteRole) {
                    try {
                        muteRole = await interaction.guild!.roles.create({
                            name: t('mute.muted'),
                            permissions: [],
                            reason: 'Mute role for moderation bot'
                        });
                        logger.info({ msg: '[SUCCESS] Created Muted role' });
                    } catch (roleError) {
                        logger.error({ msg: '[ERROR] Failed to create mute role:', err: roleError });
                        const errorEmbed = {
                            color: 0xFF0000,
                            title: t('mute.errorMuteRoleMissing'),
                            description: t('mute.couldNotFindOrCreate'),
                            timestamp: new Date().toISOString()
                        };
                        return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                }

                await member.roles.add(muteRole, reason);
            }

            trackModAction(interaction.guild!.id, interaction.client.user.id, 'mute');
            await flushAnalyticsCritical();

            const caseId = await createModCase(interaction.guild!.id, {
                type: 'mute',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason,
                duration: durationText
            });

            const successEmbed = {
                color: 0x00FF00,
                title: t('mute.successUserMuted'),
                description: t('mute.userHasBeenMuted', { user: user.tag }),
                fields: [
                    {
                        name: t('mute.fieldModerator'),
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: t('mute.fieldDuration'),
                        value: durationText,
                        inline: true
                    },
                    {
                        name: t('mute.fieldCaseId'),
                        value: t('mute.caseid', { caseId: caseId }),
                        inline: true
                    },
                    {
                        name: t('mute.fieldReason'),
                        value: reason,
                        inline: false
                    },
                    {
                        name: t('mute.fieldUserId'),
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild!, {
                action: 'mute',
                target: user,
                moderator: interaction.user,
                reason: reason,
                duration: durationText,
                extra: {
                    'Case ID': `#${caseId}`
                }
            });

            logger.info({ msg: `[MODERATION] User ${user.tag} was muted by ${interaction.user.tag}. Duration: ${durationText}. Reason: ${reason}` });

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: t('mute.commandFailedTitle'),
                description: t('mute.commandFailedDescription'),
                fields: [
                    {
                        name: t('mute.errorDetails'),
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