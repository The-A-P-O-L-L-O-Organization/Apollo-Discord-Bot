// Mass Mute Command
export default {
// Timeouts multiple users
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';
import { parseDuration, formatDuration, validateDuration } from '../../../utils/duration.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

    name: 'massmute',
    description: 'Timeout multiple users',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-ids',
            description: 'Comma-separated list of user IDs to timeout',
            type: 3, // STRING type
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
    
    async execute(interaction) {try {
try {

        try {
            const userIdsStr = interaction.options.getString('user-ids');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            if (!userIdsStr) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User IDs',
                    description: 'Please provide a comma-separated list of user IDs.',
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
            
            // Parse user IDs
            const userIds = userIdsStr.split(/[,\s]+/).filter(id => id.trim() && /^\d{17,19}$/.test(id.trim()));
            
            if (userIds.length === 0) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] No Valid User IDs',
                    description: 'Please provide valid user IDs (17-19 digits each).',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            if (userIds.length > 50) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Too Many Users',
                    description: 'Maximum 50 users per mass mute.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Check for self/bot
            if (userIds.includes(interaction.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot timeout yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            if (userIds.includes(interaction.client.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot timeout the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            await interaction.deferReply({ flags: 64 });
            
            const results = {
                success: [],
                failed: []
            };
            
            for (const userId of userIds) {
                try {
                    // Rate limit: 100ms delay between operations to avoid Discord API limits
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    const member = await fetchMember(interaction.guild, userId);
                    
                    if (!member) {
                        results.failed.push({ userId, error: 'User not in server' });
                        continue;
                    }
                    
                    if (!member.moderatable) {
                        results.failed.push({ userId, error: 'Cannot timeout (higher permissions or missing bot permissions)' });
                        continue;
                    }
                    
                    const hierarchy = canModerate(interaction.guild, interaction.member, member);
                    if (!hierarchy.ok) {
                        results.failed.push({ userId, error: hierarchy.reason });
                        continue;
                    }
                    
                    const userTag = member.user.tag;
                    
                    await member.timeout(durationMs, `[MASSMUTE] ${reason}`);
                    
                    trackModAction(interaction.guild.id, interaction.user.id, 'massmute');
                    
                    const caseId = createModCase(interaction.guild.id, {
                        type: 'massmute',
                        targetId: userId,
                        targetTag: userTag,
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        reason: reason
                    });
                    
                    results.success.push({ userId, userTag, caseId });
                    
                    await sendModLog(interaction.guild, {
                        action: 'massmute',
                        target: member.user,
                        moderator: interaction.user,
                        reason: reason,
                        extra: {
                            'Duration': formatDuration(durationMs),
                            'Case ID': `#${caseId}`,
                            'Batch': 'Mass Mute'
                        }
                    });
                    
                } catch (error) {
                    results.failed.push({ userId, error: error.message });
                }
            }
            
            await flushAnalyticsCritical();
            
            const durationDisplay = formatDuration(durationMs);
            
            const successEmbed = {
                color: results.failed.length === 0 ? 0x00FF00 : 0xFFFF00,
                title: results.failed.length === 0 ? '[SUCCESS] Mass Mute Complete' : '[PARTIAL] Mass Mute Complete',
                description: `Processed ${userIds.length} user(s). **${results.success.length} timed out**, **${results.failed.length} failed**.`,
                fields: [
                    { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                    { name: '[INFO] Duration', value: durationDisplay, inline: true },
                    { name: '[INFO] Reason', value: reason, inline: false }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (results.success.length > 0) {
                successEmbed.fields.push({
                    name: `[SUCCESS] Timed Out (${results.success.length})`,
                    value: results.success.map(r => `• ${r.userTag} (\`${r.userId}\`) - Case #${r.caseId}`).join('\n'),
                    inline: false
                });
            }
            
            if (results.failed.length > 0) {
                successEmbed.fields.push({
                    name: `[ERROR] Failed (${results.failed.length})`,
                    value: results.failed.map(r => `• \`${r.userId}\` - ${r.error}`).join('\n'),
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [successEmbed] });
            
            logger.info(`[MODERATION] Mass mute by ${interaction.user.tag}: ${results.success.length} success, ${results.failed.length} failed. Duration: ${durationDisplay}. Reason: ${reason}`);
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to mass mute users.',
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
    
} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}

} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
};
