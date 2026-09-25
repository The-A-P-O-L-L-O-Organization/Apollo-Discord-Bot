import { logger } from '../../../utils/logger.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import { PermissionsBitField, MessageFlags } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

export default {
    name: 'kick',
    description: 'Kick a user from the server',
    category: 'Moderation',

    defaultMemberPermissions: PermissionsBitField.Flags.KickMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to kick',
            type: 6, // USER type
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
            try {
                // Get the user to kick
                const user = interaction.options.getUser('user');
                const reason = interaction.options.getString('reason') ?? t('kick.noReason');

                // Check if user exists
                if (!user) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: t('kick.missingUserTitle'),
                        description: t('kick.missingUserDescription'),
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }

                // Get the guild member using improved fetching
                const member = await fetchMember(interaction.guild!, user.id);

                if (!member) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: t('kick.memberNotFoundTitle'),
                        description: t('kick.memberNotFoundDescription'),
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }

                // Check if the member can be kicked
                if (!member.kickable) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: t('kick.errorCannotKick'),
                        description: t('kick.iCannotKickThisUser'),
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }

                // Check if the user is trying to kick themselves
                if (user.id === interaction.user.id) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: t('kick.selfActionTitle'),
                        description: t('kick.selfActionDescription'),
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }

                // Hierarchy check
                const hierarchy = canModerate(interaction.guild!, interaction.member, member);
                if (!hierarchy.ok) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: t('kick.hierarchyTitle'),
                        description: hierarchy.reason,
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }

                // Kick the user
                await member.kick(reason);

                // Track and flush analytics immediately for this critical action
                trackModAction(interaction.guild!.id, interaction.client.user.id, 'kick');
                await flushAnalyticsCritical();

                // Create mod case
                const caseId = await createModCase(interaction.guild!.id, {
                    type: 'kick',
                    targetId: user.id,
                    targetTag: user.tag,
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    reason: reason
                });

                // Create success embed
                const successEmbed = {
                    color: 0x00FF00,
                    title: t('kick.successUserKicked'),
                    description: t('kick.userHasBeenKickedFrom', { user: user.tag }),
                    fields: [
                        {
                            name: t('kick.fieldModerator'),
                            value: interaction.user.tag,
                            inline: true
                        },
                        {
                            name: t('kick.fieldCaseId'),
                            value: t('kick.caseid', { caseId: caseId }),
                            inline: true
                        },
                        {
                            name: t('kick.fieldReason'),
                            value: reason,
                            inline: false
                        },
                        {
                            name: t('kick.fieldUserId'),
                            value: user.id,
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString()
                };

                await interaction.reply({ embeds: [successEmbed] });

                // Send mod log
                await sendModLog(interaction.guild!, {
                    action: 'kick',
                    target: user,
                    moderator: interaction.user,
                    reason: reason,
                    extra: {
                        'Case ID': `#${caseId}`
                    }
                });

                // Log the action
                logger.info({ msg: `[MODERATION] User ${user.tag} was kicked by ${interaction.user.tag}. Reason: ${reason}` });

            } catch (error) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: t('kick.commandFailedTitle'),
                    description: t('kick.commandFailedDescription'),
                    fields: [
                        {
                            name: t('kick.errorDetails'),
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

        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('kick.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};