import { logger } from '../../../utils/logger.js';
import { PermissionsBitField } from 'discord.js';
import { getUserData, appendToUserArray, generateId, getGuildData, setGuildData } from '../../../utils/db.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { config } from '../../../config/config.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

function getNextThreshold(currentCount, thresholds) {
    const sorted = [
        { action: 'mute', count: thresholds.mute },
        { action: 'kick', count: thresholds.kick },
        { action: 'ban', count: thresholds.ban }
    ].filter(t => t.count).sort((a, b) => a.count - b.count);

    return sorted.find(t => t.count > currentCount) || null;
}

export default {
    name: 'warn',
    description: 'Issue a warning to a user',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to warn',
            type: 6,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for the warning',
            type: 3,
            required: true
        }
    ],

    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');

            if (!user) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Missing User',
                        description: 'Please specify a valid user to warn.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (user.bot) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Target',
                        description: 'You cannot warn bots.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (user.id === interaction.user.id) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Self Action',
                        description: 'You cannot warn yourself.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }

            const member = await fetchMember(interaction.guild, user.id);

            if (!member) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Member Not Found',
                        description: 'This user is not a member of the server.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
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

            const warning = {
                id: generateId(),
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                timestamp: Date.now(),
                active: true
            };

            await appendToUserArray('warnings', interaction.guild.id, user.id, warning);

            const userWarnings = await getUserData('warnings', interaction.guild.id, user.id) || [];
            const activeWarnings = userWarnings.filter(w => w.active !== false);
            const warningCount = activeWarnings.length;

            const caseId = createModCase(interaction.guild.id, {
                type: 'warn',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });

            const guildSettings = await getGuildData('warnings-config', interaction.guild.id);
            const thresholds = guildSettings.thresholds || config.warnings.thresholds;
            const muteDuration = guildSettings.muteDuration || config.warnings.muteDuration;

            let dmSent = false;
            if (config.warnings.dmOnWarn) {
                try {
                    const dmEmbed = {
                        color: 0xFFA500,
                        title: `[!] Warning in ${interaction.guild.name}`,
                        description: 'You have been warned by a moderator.',
                        fields: [
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Total Warnings', value: `${warningCount}`, inline: true },
                            { name: 'Warning ID', value: warning.id, inline: true }
                        ],
                        timestamp: new Date().toISOString(),
                        footer: { text: 'Please follow the server rules to avoid further action.' }
                    };

                    await user.send({ embeds: [dmEmbed] });
                    dmSent = true;
                } catch (dmError) {
                    logger.info(`[INFO] Could not DM user ${user.tag} about warning`);
                }
            }

            let autoPunishment = null;

            if (thresholds.ban && warningCount >= thresholds.ban) {
                try {
                    await interaction.guild.bans.create(user.id, {
                        reason: `Auto-ban: Reached ${warningCount} warnings. Latest: ${reason}`
                    });
                    autoPunishment = 'banned';
                    trackModAction(interaction.guild.id, interaction.client.user.id, 'ban');
                    await flushAnalyticsCritical();
                } catch (banError) {
                    logger.error('[ERROR] Auto-ban failed:', banError);
                }
            } else if (thresholds.kick && warningCount >= thresholds.kick) {
                try {
                    if (member.kickable) {
                        await member.kick(`Auto-kick: Reached ${warningCount} warnings. Latest: ${reason}`);
                        autoPunishment = 'kicked';
                        trackModAction(interaction.guild.id, interaction.client.user.id, 'kick');
                        await flushAnalyticsCritical();
                    }
                } catch (kickError) {
                    logger.error('[ERROR] Auto-kick failed:', kickError);
                }
            } else if (thresholds.mute && warningCount >= thresholds.mute) {
                try {
                    if (member.moderatable) {
                        await member.timeout(muteDuration, `Auto-mute: Reached ${warningCount} warnings. Latest: ${reason}`);
                        autoPunishment = 'muted';
                        trackModAction(interaction.guild.id, interaction.client.user.id, 'mute');
                        await flushAnalyticsCritical();
                    }
                } catch (muteError) {
                    logger.error('[ERROR] Auto-mute failed:', muteError);
                }
            }

            const successEmbed = {
                color: 0xFFA500,
                title: '[SUCCESS] User Warned',
                description: `${user.tag} has been warned.`,
                fields: [
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Case ID', value: `#${caseId}`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Total Warnings', value: `${warningCount}`, inline: true },
                    { name: 'Warning ID', value: warning.id, inline: true },
                    { name: 'DM Sent', value: dmSent ? 'Yes' : 'No', inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            if (autoPunishment) {
                successEmbed.fields.push({
                    name: '[!] Auto-Punishment Applied',
                    value: `User has been **${autoPunishment}** for reaching ${warningCount} warnings.`,
                    inline: false
                });
            }

            if (!autoPunishment) {
                const nextThreshold = getNextThreshold(warningCount, thresholds);
                if (nextThreshold) {
                    successEmbed.fields.push({
                        name: 'Next Threshold',
                        value: `${nextThreshold.action} at ${nextThreshold.count} warnings (${nextThreshold.count - warningCount} more)`,
                        inline: false
                    });
                }
            }

            await interaction.reply({ embeds: [successEmbed] });

            await sendModLog(interaction.guild, {
                action: 'warn',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Warning Count': `${warningCount}`,
                    'Warning ID': warning.id,
                    'Case ID': `#${caseId}`,
                    'Auto-Punishment': autoPunishment || 'None'
                }
            });

            logger.info(`[MODERATION] User ${user.tag} warned by ${interaction.user.tag}. Total: ${warningCount}. Reason: ${reason}`);

        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to warn the user.',
                fields: [{ name: 'Error', value: safeError(error), inline: true }],
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