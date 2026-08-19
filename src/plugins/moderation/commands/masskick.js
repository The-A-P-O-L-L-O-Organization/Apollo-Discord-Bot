// Mass Kick Command
// Kicks multiple users

import { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';

export default {
    name: 'masskick',
    description: 'Kick multiple users',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.KickMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-ids',
            description: 'Comma-separated list of user IDs to kick',
            type: 3, // STRING type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for kicking',
            type: 3, // STRING type
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            const userIdsStr = interaction.options.getString('user-ids');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            if (!userIdsStr) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User IDs',
                    description: 'Please provide a comma-separated list of user IDs.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
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
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (userIds.length > 50) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Too Many Users',
                    description: 'Maximum 50 users per mass kick.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Check for self/bot
            if (userIds.includes(interaction.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot kick yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (userIds.includes(interaction.client.user.id)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot kick the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Confirmation prompt for dangerous operation
            const confirmEmbed = {
                color: 0xFFFF00,
                title: '[WARN] Confirm Mass Kick',
                description: `You are about to **kick ${userIds.length} user(s)**.\n\n**Reason:** ${reason}\n\nThis action cannot be undone. Are you sure?`,
                timestamp: new Date().toISOString()
            };
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_masskick')
                        .setLabel('Confirm Kick')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_masskick')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );
            
            await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
            
            // Wait for button interaction
            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 30000,
                max: 1
            });
            
            collector.on('collect', async (i) => {
                if (i.customId === 'cancel_masskick') {
                    await i.update({ content: 'Mass kick cancelled.', embeds: [], components: [] });
                    return;
                }
                
                if (i.customId === 'confirm_masskick') {
                    await i.update({ content: 'Processing mass kick...', embeds: [], components: [] });
                    
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
                            
                            if (!member.kickable) {
                                results.failed.push({ userId, error: 'Cannot kick (higher permissions or missing bot permissions)' });
                                continue;
                            }
                            
                            const hierarchy = canModerate(interaction.guild, interaction.member, member);
                            if (!hierarchy.ok) {
                                results.failed.push({ userId, error: hierarchy.reason });
                                continue;
                            }
                            
                            const userTag = member.user.tag;
                            
                            await member.kick(`[MASSKICK] ${reason}`);
                            
                            trackModAction(interaction.guild.id, interaction.user.id, 'masskick');
                            
                            const caseId = createModCase(interaction.guild.id, {
                                type: 'masskick',
                                targetId: userId,
                                targetTag: userTag,
                                moderatorId: interaction.user.id,
                                moderatorTag: interaction.user.tag,
                                reason: reason
                            });
                            
                            results.success.push({ userId, userTag, caseId });
                            
                            await sendModLog(interaction.guild, {
                                action: 'masskick',
                                target: member.user,
                                moderator: interaction.user,
                                reason: reason,
                                extra: {
                                    'Case ID': `#${caseId}`,
                                    'Batch': 'Mass Kick'
                                }
                            });
                            
                        } catch (error) {
                            results.failed.push({ userId, error: error.message });
                        }
                    }
                    
                    await flushAnalyticsCritical();
                    
                    const successEmbed = {
                        color: results.failed.length === 0 ? 0x00FF00 : 0xFFFF00,
                        title: results.failed.length === 0 ? '[SUCCESS] Mass Kick Complete' : '[PARTIAL] Mass Kick Complete',
                        description: `Processed ${userIds.length} user(s). **${results.success.length} kicked**, **${results.failed.length} failed**.`,
                        fields: [
                            { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                            { name: '[INFO] Reason', value: reason, inline: false }
                        ],
                        timestamp: new Date().toISOString()
                    };
                    
                    if (results.success.length > 0) {
                        successEmbed.fields.push({
                            name: `[SUCCESS] Kicked (${results.success.length})`,
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
                    
                    console.log(`[MODERATION] Mass kick by ${interaction.user.tag}: ${results.success.length} success, ${results.failed.length} failed. Reason: ${reason}`);
                }
            });
            
            collector.on('end', (collected) => {
                if (collected.size === 0) {
                    interaction.editReply({ content: 'Mass kick timed out (30s).', embeds: [], components: [] }).catch(() => {});
                }
            });
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to mass kick users.',
                fields: [
                    { name: '[ERROR] Details', value: safeError(error), inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};