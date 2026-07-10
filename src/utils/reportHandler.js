/* eslint-disable no-console */
// Report Modal Handler
// Handles report submissions from users

import { updateGuildData, generateId } from '../utils/db.js';
import { flushAnalyticsCritical } from './analyticsCollector.js';

export async function handleReportSubmission(interaction, _client) {
    try {
        if (!interaction.isModalSubmit()) {return false;}
        if (interaction.customId !== 'report_reason_modal') {return false;}
        
        const reason = interaction.fields.getTextInputValue('reason');
        const messageId = interaction.message?.reference?.messageId;
        
        if (!messageId) {
            await interaction.reply({
                content: '[ERROR] Could not find the original message. The report has been cancelled.',
                ephemeral: true
            });
            return true;
        }
        
        // Fetch the reported message
        const channel = interaction.channel;
        let reportedMessage;
        
        try {
            reportedMessage = await channel.messages.fetch(messageId);
        } catch {
            await interaction.reply({
                content: '[ERROR] Could not fetch the message. It may have been deleted.',
                ephemeral: true
            });
            return true;
        }
        
        const reporter = interaction.user;
        const author = reportedMessage.author;
        
        // Create report
        const reportId = generateId();
        const reportData = {
            reportId,
            messageId: reportedMessage.id,
            channelId: channel.id,
            channelName: channel.name,
            guildId: interaction.guild.id,
            authorId: author.id,
            authorTag: author.tag,
            reporterId: reporter.id,
            reporterTag: reporter.tag,
            reason,
            timestamp: Date.now(),
            status: 'pending', // pending, reviewing, resolved, dismissed
            reviewedBy: null,
            reviewedAt: null,
            resolution: null
        };
        
        // Save report to database
        await updateGuildData('reports', interaction.guild.id, data => {
            if (!data.reports) {data.reports = [];}
            data.reports.push(reportData);
            return data;
        });
        
        // Flush critical analytics for report submission
        await flushAnalyticsCritical();
        
        // Create success embed for user
        const successEmbed = {
            color: 0x00FF00,
            title: '[SUCCESS] Report Submitted',
            description: 'Your report has been submitted to the moderators.',
            fields: [
                {
                    name: '[INFO] Report ID',
                    value: `#${reportId}`,
                    inline: true
                },
                {
                    name: '[INFO] Reported User',
                    value: author.tag,
                    inline: true
                },
                {
                    name: '[INFO] Channel',
                    value: `<#${channel.id}>`,
                    inline: true
                }
            ],
            timestamp: new Date().toISOString()
        };
        
        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        
        // Send report to moderators
        const reportEmbed = {
            color: 0xFFA500, // Orange
            title: '[MODERATION] New Message Report',
            fields: [
                {
                    name: '[INFO] Report ID',
                    value: `#${reportId}`,
                    inline: true
                },
                {
                    name: '[INFO] Reporter',
                    value: `${reporter.tag}\n\`${reporter.id}\``,
                    inline: true
                },
                {
                    name: '[INFO] Reported User',
                    value: `${author.tag}\n\`${author.id}\``,
                    inline: true
                },
                {
                    name: '[INFO] Channel',
                    value: `<#${channel.id}>`,
                    inline: true
                },
                {
                    name: '[INFO] Reason',
                    value: reason,
                    inline: false
                },
                {
                    name: '[INFO] Reported Message',
                    value: reportedMessage.content?.substring(0, 500) || '[No text content]',
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: `Use /reports view ${reportId} to manage this report`
            }
        };
        
        // Add message link
        const messageLink = `https://discord.com/channels/${interaction.guild.id}/${channel.id}/${reportedMessage.id}`;
        reportEmbed.fields.push({
            name: '[LINK] Message Link',
            value: messageLink,
            inline: false
        });
        
        // Add thumbnail if author has avatar
        if (author.displayAvatarURL()) {
            reportEmbed.thumbnail = {
                url: author.displayAvatarURL({ dynamic: true })
            };
        }
        
        // Get logging channel and send report
        const logConfig = await import('../utils/logger.js').then(m => m.getLoggingConfig(interaction.guild.id));
        
        if (logConfig && logConfig.channelId) {
            const logChannel = interaction.guild.channels.cache.get(logConfig.channelId);
            if (logChannel) {
                // Create action buttons
                const actionRow = {
                    type: 1, // ActionRow
                    components: [
                        {
                            type: 2, // Button
                            style: 3, // Success
                            label: 'Review',
                            custom_id: `report_review_${reportId}`
                        },
                        {
                            type: 2, // Button
                            style: 4, // Danger
                            label: 'Dismiss',
                            custom_id: `report_dismiss_${reportId}`
                        },
                        {
                            type: 2, // Button
                            style: 1, // Secondary
                            label: 'View Message',
                            url: messageLink
                        }
                    ]
                };
                
                await logChannel.send({ 
                    embeds: [reportEmbed],
                    components: [actionRow]
                });
            }
        }
        
        console.log(`[MODERATION] Report #${reportId} submitted by ${reporter.tag} against ${author.tag}`);
        
        return true;
        
    } catch (error) {
        console.error('[ERROR] Report submission error:', error);
        return false;
    }
}
