// Forceban Command
export default {
// Bans a user by ID without requiring them to be in the server
import { logger } from '../../../utils/logger.js';

import { PermissionsBitField } from 'discord.js';
import { sendModLog } from '../../../utils/modLog.js';
import { createModCase } from './case.js';
import { flushAnalyticsCritical, trackModAction } from '../../../utils/analyticsCollector.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

    name: 'forceban',
    description: 'Ban a user by ID (works even if user is not in the server)',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user-id',
            description: 'The user ID to ban',
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
    
    async execute(interaction) {
    try {

        try {
            const userId = interaction.options.getString('user-id');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete-days') || 0;
            
            if (!userId || !/^\d{17,19}$/.test(userId)) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid User ID',
                    description: 'Please provide a valid user ID (17-19 digits).',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            if (deleteDays < 0 || deleteDays > 7) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Invalid Value',
                    description: 'Delete days must be between 0 and 7.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            if (userId === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot forceban yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            if (userId === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot forceban the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            // Try to fetch user info for better logging
            let userTag = `Unknown User (${userId})`;
            try {
                const user = await interaction.client.users.fetch(userId);
                userTag = user.tag;
            } catch {
                // User not found, use ID only
            }
            
            // Ban the user by ID
            await interaction.guild.bans.create(userId, {
                reason: `[FORCEBAN] ${reason}`,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });
            
            trackModAction(interaction.guild.id, interaction.user.id, 'forceban');
            await flushAnalyticsCritical();
            
            const caseId = createModCase(interaction.guild.id, {
                type: 'forceban',
                targetId: userId,
                targetTag: userTag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason
            });
            
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Forcebanned',
                description: `${userTag} has been banned from the server.`,
                fields: [
                    { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                    { name: '[INFO] Case ID', value: `#${caseId}`, inline: true },
                    { name: '[INFO] Reason', value: reason, inline: false },
                    { name: '[INFO] Delete Days', value: `${deleteDays} days`, inline: true },
                    { name: '[INFO] User ID', value: userId, inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            // Try to get user object for mod log
            let targetUser = { id: userId, tag: userTag, displayAvatarURL: () => null };
            try {
                targetUser = await interaction.client.users.fetch(userId);
            } catch {
                // Use fallback
            }
            
            await sendModLog(interaction.guild, {
                action: 'forceban',
                target: targetUser,
                moderator: interaction.user,
                reason: reason,
                extra: {
                    'Delete Days': `${deleteDays} days`,
                    'Case ID': `#${caseId}`,
                    'Type': 'Forceban (by ID)'
                }
            });
            
            logger.info(`[MODERATION] User ${userTag} (${userId}) was forcebanned by ${interaction.user.tag}. Reason: ${reason}`);
            
        } catch (error) {
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Command Failed',
                description: 'An error occurred while trying to forceban the user.',
                fields: [
                    { name: '[ERROR] Details', value: safeError(error), inline: true }
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
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
}
