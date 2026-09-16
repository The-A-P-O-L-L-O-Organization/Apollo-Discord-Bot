// Report Message Command - Context menu command to report messages
import type {
    MessageContextMenuCommandInteraction} from 'discord.js';
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { generateId, appendToGuildArray } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

export default {
    data: {
        name: 'Report Message',
        type: 3 // ApplicationCommandType.Message
    },

    async execute(interaction: MessageContextMenuCommandInteraction) {
        try {
            const message = interaction.targetMessage;

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

            const reportId = generateId();
            const report = {
                reportId,
                messageId: message.id,
                channelId: message.channel.id,
                authorId: message.author.id,
                authorTag: message.author.tag,
                reporterId: interaction.user.id,
                reporterTag: interaction.user.tag,
                content: message.content.substring(0, 1000),
                timestamp: Date.now(),
                status: 'pending'
            };

            await appendToGuildArray('reports', interaction.guild!.id, 'entries', report);

            const modChannel = interaction.guild!.channels.cache.find(
                ch => ch.name === config.moderation.moderationLogChannel
            );

            if (modChannel?.isTextBased()) {
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

                if (message.attachments.size > 0) {
                    reportEmbed.addFields({
                        name: 'Attachments',
                        value: message.attachments.map(a => `[${a.name}](${a.url})`).join('\n'),
                        inline: false
                    });
                }

                const row = new ActionRowBuilder<ButtonBuilder>()
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

            logger.info({ msg: `[REPORT] Message ${message.id} reported by ${interaction.user.tag} (Report ID: ${reportId})` });
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