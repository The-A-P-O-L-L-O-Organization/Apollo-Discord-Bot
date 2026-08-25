// Report Message Context Menu Command
export default {
// Allows users to report messages to moderators
import { logger } from '../../../utils/logger.js';

import { 
    ContextMenuCommandBuilder, 
    ApplicationCommandType, 
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} from 'discord.js';
import { generateId, appendToGuildArray } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

    data: new ContextMenuCommandBuilder()
        .setName('Report Message')
        .setType(ApplicationCommandType.Message),
    
    async execute(interaction) {try {
try {

        try {
            // Get the target message
            const message = interaction.targetMessage;
            
            // Can't report own messages
            if (message.author.id === interaction.user.id) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Action',
                        description: 'You cannot report your own messages.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Can't report bot messages
            if (message.author.bot) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFF0000,
                        title: '[ERROR] Invalid Target',
                        description: 'You cannot report bot messages.',
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Create report
            const reportId = generateId();
            const report = {
                reportId,
                messageId: message.id,
                channelId: message.channel.id,
                authorId: message.author.id,
                authorTag: message.author.tag,
                reporterId: interaction.user.id,
                reporterTag: interaction.user.tag,
                content: message.content.substring(0, 1000), // Limit content length
                timestamp: Date.now(),
                status: 'pending'
            };
            
            // Save report
            await appendToGuildArray('reports', interaction.guild.id, 'entries', report);
            
            // Find mod channel
            const modChannel = interaction.guild.channels.cache.find(
                ch => ch.name === config.moderation.moderationLogChannel
            );
            
            if (modChannel) {
                // Create report embed
                const reportEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('[!] Message Reported')
                    .setDescription(`A message has been reported by ${interaction.user}`)
                    .addFields(
                        { 
                            name: 'Reported Message Author', 
                            value: `${message.author.tag}\n\`${message.author.id}\``, 
                            inline: true 
                        },
                        { 
                            name: 'Reporter', 
                            value: `${interaction.user.tag}\n\`${interaction.user.id}\``, 
                            inline: true 
                        },
                        { 
                            name: 'Channel', 
                            value: `<#${message.channel.id}>`, 
                            inline: true 
                        },
                        { 
                            name: 'Message Content', 
                            value: message.content ? (message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content) : '*No text content*', 
                            inline: false 
                        },
                        { 
                            name: 'Message Link', 
                            value: `[Jump to Message](${message.url})`, 
                            inline: false 
                        },
                        { 
                            name: 'Report ID', 
                            value: reportId, 
                            inline: true 
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Use buttons below to take action' });
                
                // If message has attachments, note them
                if (message.attachments.size > 0) {
                    reportEmbed.addFields({
                        name: 'Attachments',
                        value: message.attachments.map(a => `[${a.name}](${a.url})`).join('\n'),
                        inline: false
                    });
                }
                
                // Create action buttons
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`report_delete_${reportId}`)
                            .setLabel('Delete Message')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`report_warn_${reportId}`)
                            .setLabel('Warn Author')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId(`report_dismiss_${reportId}`)
                            .setLabel('Dismiss Report')
                            .setStyle(ButtonStyle.Secondary)
                    );
                
                await modChannel.send({ 
                    embeds: [reportEmbed], 
                    components: [row] 
                });
            }
            
            // Confirm to reporter
            await interaction.reply({
                embeds: [{
                    color: 0x00FF00,
                    title: '[SUCCESS] Message Reported',
                    description: 'Thank you for your report. Our moderation team has been notified.',
                    fields: [
                        { name: 'Report ID', value: reportId, inline: true }
                    ],
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
            
            logger.info(`[REPORT] Message ${message.id} reported by ${interaction.user.tag} (Report ID: ${reportId})`);
            
        } catch (error) {
            logger.error('[ERROR] Report message error:', error);
            
            const errorEmbed = {
                color: 0xFF0000,
                title: '[ERROR] Report Failed',
                description: 'An error occurred while submitting your report.',
                fields: [{ name: 'Error', value: error.message, inline: true }],
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

} catch (error) {
  const errorMessage = handleDiscordError(error);
  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage);
  } else {
    await safeReply(interaction, errorMessage);
  }
};
