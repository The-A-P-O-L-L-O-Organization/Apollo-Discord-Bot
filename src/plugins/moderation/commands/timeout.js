// Timeout Command
// Applies Discord native timeout to a member

import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { parseDuration, formatDuration, validateDuration } from '../../../utils/duration.js';

export default {
    name: 'timeout',
    description: 'Timeout a user (Discord native timeout)',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to timeout',
            type: 6, // USER type
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
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to timeout.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Parse and validate duration
            const validation = validateDuration(durationStr);
            if (!validation.valid) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Duration',
                    description: validation.error,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            const durationMs = validation.durationMs;
            
            const member = await fetchMember(interaction.guild, user.id);
            
            if (!member) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] User Not In Server',
                    description: 'This user is not in the server. Use /forceban to ban by ID.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            if (!member.moderatable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Timeout',
                    description: 'I cannot timeout this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot timeout yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot timeout the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            const hierarchy = canModerate(interaction.guild, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Hierarchy Check Failed',
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Apply timeout
            await member.timeout(durationMs, reason);
            
            trackModAction(interaction.guild.id, interaction.user.id, 'timeout');
            await flushAnalyticsCritical();
            
            const caseId = createModCase(interaction.guild.id, {
                type: 'timeout',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });
            
            const durationDisplay = formatDuration(durationMs);
            
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Timed Out',
                description: `${user.tag} has been timed out for ${durationDisplay}.`,
                fields: [
                    { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                    { name: '[INFO] Case ID', value: `#${caseId}`, inline: true },
                    { name: '[INFO] Reason', value: reason, inline: false },
                    { name: '[INFO] Duration', value: durationDisplay, inline: true },
                    { name: '[INFO] User ID', value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            await sendModLog(interaction.guild, {
                action: 'timeout',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Duration': durationDisplay,
                    'Case ID': `#${caseId}`
                }
            });
            
            console.log(`[MODERATION] User ${user.tag} was timed out by ${interaction.user.tag} for ${durationDisplay}. Reason: ${reason}`);
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to timeout the user.',
                fields: [
                    { name: '[ERROR] Details', value: safeError(error), inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
        }
    }
};