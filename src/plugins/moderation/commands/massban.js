// Mass Ban Command
export default {
// Bans multiple users by ID
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { sendModLog } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';

    name: 'massban',
    description: 'Ban multiple users by ID',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-ids',
            description: 'Comma-separated list of user IDs to ban',
            type: 3, // STRING type
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
    
    async execute(interaction) {try {
try {

        try {
            const userIdsStr = interaction.options.getString('user-ids');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete-days') || 0;
            
            if (!userIdsStr) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User IDs',
                    description: 'Please provide a comma-separated list of user IDs.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            if (deleteDays < 0 || deleteDays > 7) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Value',
                    description: 'Delete days must be between 0 and 7.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
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
                    description: 'Maximum 50 users per mass ban.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Check for self/bot
            if (userIds.includes(interaction.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot ban yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            if (userIds.includes(interaction.client.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot ban the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: 64 });
            }
            
            // Confirmation prompt for dangerous operation
            const confirmEmbed = {
                color: 0xFFFF00,
                title: '[WARN] Confirm Mass Ban',
                description: `You are about to **ban ${userIds.length} user(s)**.\n\n**Reason:** ${reason}\n**Delete Days:** ${deleteDays}\n\nThis action cannot be undone. Are you sure?`,
                timestamp: new Date().toISOString()
            };
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_massban')
                        .setLabel('Confirm Ban')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_massban')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.reply({ embeds: [confirmEmbed], components: [row], flags: 64 });
            
            // Wait for button interaction
            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 30000,
                max: 1
            });
            
            collector.on('collect', async (i) => {
                if (i.customId === 'cancel_massban') {
                    await i.update({ content: 'Mass ban cancelled.', embeds: [], components: [] });
                    return;
                }
                
                if (i.customId === 'confirm_massban') {
                    await i.update({ content: 'Processing mass ban...', embeds: [], components: [] });
                    
                    const results = {
                        success: [],
                        failed: []
                    };
                    
                    for (const userId of userIds) {
                        try {
                            // Rate limit: 100ms delay between operations to avoid Discord API limits
                            await new Promise(resolve => setTimeout(resolve, 100));
                            
                            await interaction.guild.bans.create(userId, {
                                reason: `[MASSBAN] ${reason}`,
                                deleteMessageSeconds: deleteDays * 24 * 60 * 60
                            });
                            
                            trackModAction(interaction.guild.id, interaction.user.id, 'massban');
                            
                            let userTag = `Unknown User (${userId})`;
                            try {
                                const user = await interaction.client.users.fetch(userId);
                                userTag = user.tag;
                            } catch {
                                // Use ID only
                            }
                            
                            const caseId = createModCase(interaction.guild.id, {
                                type: 'massban',
                                targetId: userId,
                                targetTag: userTag,
                                moderatorId: interaction.user.id,
                                moderatorTag: interaction.user.tag,
                                reason: reason
                            });
                            
                            results.success.push({ userId, userTag, caseId });
                            
                            // Log each to mod log
                            let targetUser = { id: userId, tag: userTag, displayAvatarURL: () => null };
                            try {
                                targetUser = await interaction.client.users.fetch(userId);
                            } catch {}
                            
                            await sendModLog(interaction.guild, {
                                action: 'massban',
                                target: targetUser,
                                moderator: interaction.user,
                                reason: reason,
                                extra: {
                                    'Delete Days': `${deleteDays} days`,
                                    'Case ID': `#${caseId}`,
                                    'Batch': 'Mass Ban'
                                }
                            });
                            
                        } catch (error) {
                            results.failed.push({ userId, error: error.message });
                        }
                    }
                    
                    await flushAnalyticsCritical();
                    
                    const successEmbed = {
                        color: results.failed.length === 0 ? 0x00FF00 : 0xFFFF00,
                        title: results.failed.length === 0 ? '[SUCCESS] Mass Ban Complete' : '[PARTIAL] Mass Ban Complete',
                        description: `Processed ${userIds.length} user(s). **${results.success.length} banned**, **${results.failed.length} failed**.`,
                        fields: [
                            { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                            { name: '[INFO] Reason', value: reason, inline: false }
                        ],
                        timestamp: new Date().toISOString()
                    };
                    
                    if (results.success.length > 0) {
                        successEmbed.fields.push({
                            name: `[SUCCESS] Banned (${results.success.length})`,
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
                    
                    logger.info(`[MODERATION] Mass ban by ${interaction.user.tag}: ${results.success.length} success, ${results.failed.length} failed. Reason: ${reason}`);
                }
            });
            
            collector.on('end', (collected) => {
                if (collected.size === 0) {
                    interaction.editReply({ content: 'Mass ban timed out (30s).', embeds: [], components: [] }).catch(() => {});
                }
            });
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to mass ban users.',
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
