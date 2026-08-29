// Tempban Command
import { logger } from '../../../utils/logger.js';
import { PermissionsBitField } from 'discord.js';
import { sendModLog, fetchMember } from '../../../utils/modLog.js';
import { addTempban } from '../../../utils/tempbanScheduler.js';
import { createModCase } from './case.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'tempban',
    description: 'Temporarily ban a user from the server',
    category: 'Moderation',
    
    defaultMemberPermissions: PermissionsBitField.Flags.BanMembers,
    dmPermission: false,
    options: [
        {
            name: 'user',
            description: 'The user to temporarily ban',
            type: 6,
            required: true
        },
        {
            name: 'duration',
            description: 'Duration (e.g., 1h, 1d, 1w)',
            type: 3,
            required: true
        },
        {
            name: 'reason',
            description: 'The reason for the temporary ban',
            type: 3,
            required: false
        },
        {
            name: 'delete-days',
            description: 'Number of days of messages to delete (0-7)',
            type: 4,
            required: false,
            min_value: 0,
            max_value: 7
        }
    ],
    
    async execute(interaction) {
        try {
            const user = interaction.options.getUser('user');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete-days') || 0;
            
            if (!user) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Missing User',
                    description: 'Please specify a valid user to ban.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            const match = durationStr.match(/^(\d+)([mhdw])$/);
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
            
            let durationMs;
            let durationText;
            
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
            
            if (durationMs < 60000) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Duration Too Short',
                    description: 'Minimum tempban duration is 1 minute.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            const member = await fetchMember(interaction.guild, user.id);
            
            if (member && !member.bannable) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Cannot Ban',
                    description: 'I cannot ban this user. They may have higher permissions than me.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            if (user.id === interaction.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Self Action',
                    description: 'You cannot ban yourself.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            if (user.id === interaction.client.user.id) {
                const errorEmbed = {
                    color: 0xFF0000,
                    title: '[ERROR] Bot Protection',
                    description: 'You cannot ban the bot.',
                    timestamp: new Date().toISOString()
                };
                return interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
            
            const bannedAt = Date.now();
            const unbanAt = bannedAt + durationMs;
            
            await interaction.guild.bans.create(user.id, {
                reason: `Temporary ban by ${interaction.user.tag}: ${reason} (Duration: ${durationText})`,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });
            
            await addTempban({
                userId: user.id,
                guildId: interaction.guild.id,
                reason: reason,
                duration: durationText,
                bannedAt: bannedAt,
                unbanAt: unbanAt,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag
            });
            
            const caseId = createModCase(interaction.guild.id, {
                type: 'tempban',
                targetId: user.id,
                targetTag: user.tag,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                reason: reason,
                duration: durationText
            });
            
            const successEmbed = {
                color: 0x00FF00,
                title: '[SUCCESS] User Temporarily Banned',
                description: `${user.tag} has been temporarily banned from the server.`,
                fields: [
                    { name: '[INFO] Moderator', value: interaction.user.tag, inline: true },
                    { name: '[INFO] Duration', value: durationText, inline: true },
                    { name: '[INFO] Case ID', value: `#${caseId}`, inline: true },
                    { name: '[INFO] Reason', value: reason, inline: false },
                    { name: '[INFO] Unban Time', value: `<t:${Math.floor(unbanAt / 1000)}:F>\n(<t:${Math.floor(unbanAt / 1000)}:R>)`, inline: false },
                    { name: '[INFO] User ID', value: user.id, inline: true },
                    { name: '[INFO] Delete Days', value: `${deleteDays} days`, inline: true }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [successEmbed] });
            
            await sendModLog(interaction.guild, {
                action: 'tempban',
                target: user,
                moderator: interaction.user,
                reason: reason,
                duration: durationText,
                extra: {
                    'Duration': durationText,
                    'Unban Time': `<t:${Math.floor(unbanAt / 1000)}:F>`,
                    'Delete Days': `${deleteDays} days`,
                    'Case ID': `#${caseId}`
                }
            });
            
            logger.info(`[MODERATION] User ${user.tag} was temporarily banned by ${interaction.user.tag}. Duration: ${durationText}. Reason: ${reason}. Case ID: ${caseId}`);
        } catch (error) {
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};