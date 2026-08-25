import { logger } from '../../../utils/logger.js';
import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { setUserData } from '../../../utils/db.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

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

    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const duration = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to mute.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const member = await fetchMember(interaction.guild, user.id);

            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Member Not Found',
                    description: 'This user is not a member of the server.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Mute',
                    description: 'I cannot mute this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot mute yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const hierarchy = canModerate(interaction.guild, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Hierarchy Check Failed',
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            let durationMs = 3600000;
            let durationText = '1 hour';

            if (duration) {
                const match = duration.match(/^(\d+)([mhdw])$/);
                if (!match) {
                    const errorEmbed = {
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Duration',
                        description: 'Invalid duration format. Use: 1m (minutes), 1h (hours), 1d (days), 1w (weeks)',
                        timestamp: new Date().toISOString()
                    };
                    return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                }

                const value = parseInt(match[1]);
                const unit = match[2];

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
                    title: '[ERROR] Duration Too Long',
                    description: 'Maximum mute duration is 28 days (4 weeks).',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }

            const roleIds = Array.from(member.roles.cache.keys()).filter(roleId => roleId !== interaction.guild.id);
            await setUserData('muted-roles', interaction.guild.id, user.id, {
                roles: roleIds,
                mutedAt: Date.now()
            });

            try {
                await member.timeout(durationMs, reason);
            } catch (timeoutError) {
                logger.info('[INFO] Timeout failed, checking for mute role...');

                let muteRole = interaction.guild.roles.cache.find(
                    role => role.name === 'Muted'
                );

                if (!muteRole) {
                    try {
                        muteRole = await interaction.guild.roles.create({
                            name: 'Muted',
                            permissions: [],
                            reason: 'Mute role for moderation bot'
                        });
                        logger.info('[SUCCESS] Created Muted role');
                    } catch (roleError) {
                        logger.error('[ERROR] Failed to create mute role:', roleError);
                        const errorEmbed = {
                            color: 0xFF0000,
                            title: '[ERROR] Mute Role Missing',
                            description: 'Could not find or create a "Muted" role. Please create it manually.',
                            timestamp: new Date().toISOString()
                        };
                        return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
                    }
                }

                await member.roles.add(muteRole, reason);
            }

            trackModAction(interaction.guild.id, interaction.user.id, 'mute');
            await flushAnalyticsCritical();

            const caseId = createModCase(interaction.guild.id, {
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
                title: '[SUCCESS] User Muted',
                description: `${user.tag} has been muted.`,
                fields: [
                    {
                        name: '[INFO] Moderator',
                        value: interaction.user.tag,
                        inline: true
                    },
                    {
                        name: '[INFO] Duration',
                        value: durationText,
                        inline: true
                    },
                    {
                        name: '[INFO] Case ID',
                        value: `#${caseId}`,
                        inline: true
                    },
                    {
                        name: '[INFO] Reason',
                        value: reason,
                        inline: false
                    },
                    {
                        name: '[INFO] User ID',
                        value: user.id,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild, {
                action: 'mute',
                target: user,
                moderator: interaction.user,
                reason: reason,
                duration: durationText,
                extra: {
                    'Case ID': `#${caseId}`
                }
            });

            logger.info(`[MODERATION] User ${user.tag} was muted by ${interaction.user.tag}. Duration: ${durationText}. Reason: ${reason}`);

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to mute the user.',
                fields: [
                    {
                        name: '[ERROR] Details',
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