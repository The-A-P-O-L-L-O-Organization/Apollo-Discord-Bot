// Softban Command
// Bans a user and immediately unbans them to clear their messages

import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { canModerate } from '../../../utils/moderation.js';
import { safeError } from '../../../utils/safeError.js';

export default {
    name: 'softban',
    description: 'Softban a user (ban + immediate unban to clear messages)',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to softban',
            type: 6, // USER type
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for softbanning',
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
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete-days') || 1;
            
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to softban.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (deleteDays < 0 || deleteDays > 7) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Value',
                    description: 'Delete days must be between 0 and 7.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const member = await fetchMember(interaction.guild, user.id);
            
            if (member && !member.bannable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Softban',
                    description: 'I cannot ban this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot softban yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot softban the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            const hierarchy = canModerate(interaction.guild, interaction.member, member);
            if (!hierarchy.ok) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Hierarchy Check Failed',
                    description: hierarchy.reason,
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            
            // Ban the user
            await interaction.guild.bans.create(user.id, {
                reason: `[SOFTBAN] ${reason}`,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });
            
            // Immediately unban
            await interaction.guild.bans.remove(user.id, `[SOFTBAN] Softban completed - ${reason}`);
            
            trackModAction(interaction.guild.id, interaction.user.id, 'softban');
            await flushAnalyticsCritical();
            
            const caseId = createModCase(interaction.guild.id, {
                type: 'softban',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });
            
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Softbanned',
                description: `${user.tag} has been softbanned (banned and immediately unbanned).`,
                fields: [
                    { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                    { name: '[INFO] Case ID', value: `#${caseId}`, inline: true },
                    { name: '[INFO] Reason', value: reason, inline: false },
                    { name: '[INFO] Delete Days', value: `${deleteDays} days`, inline: true },
                    { name: '[INFO] User ID', value: user.id, inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            await sendModLog(interaction.guild, {
                action: 'softban',
                target: user,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Delete Days': `${deleteDays} days`,
                    'Case ID': `#${caseId}`
                }
            });
            
            console.log(`[MODERATION] User ${user.tag} was softbanned by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to softban the user.',
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