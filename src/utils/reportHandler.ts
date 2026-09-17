// Report Modal Handler
// Handles report submissions from users

import { updateGuildData, generateId } from './db.js';
import { flushAnalyticsCritical } from './analyticsCollector.js';
import { logger } from './logger.js';
import { getLoggingConfig } from './guildLogging.js';
import type { Message} from 'discord.js';
import { MessageFlags, type TextChannel } from 'discord.js';

interface ReportData {
    reportId: string;
    messageId: string;
    channelId: string;
    channelName: string | null;
    guildId: string;
    authorId: string;
    authorTag: string;
    reporterId: string;
    reporterTag: string;
    reason: string;
    timestamp: number;
    status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
    reviewedBy: string | null;
    reviewedAt: number | null;
    resolution: string | null;
}

export async function handleReportSubmission(
    interaction: {
        isModalSubmit(): boolean;
        customId: string;
        fields: { getTextInputValue(name: string): string };
        message?: { reference?: { messageId?: string } };
        channel: { messages: { fetch(id: string): Promise<Message | null> } };
        user: { id: string; tag: string };
        guild: { id: string; channels: { cache: Map<string, any> } };
        reply(options: { embeds?: any[]; flags?: number; content?: string }): Promise<any>;
    },
    _client: any
): Promise<boolean> {
    try {
        if (!interaction.isModalSubmit()) { return false; }
        if (interaction.customId !== 'report_reason_modal') { return false; }

        const reason = interaction.fields.getTextInputValue('reason');
        const messageId = interaction.message?.reference?.messageId;

        if (!messageId) {
            await interaction.reply({
                content: '[ERROR] Could not find the original message. The report has been cancelled.',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        // Fetch the reported message
        const channel = interaction.channel;
        let reportedMessage: Message | null = null;

        try {
            reportedMessage = await channel.messages.fetch(messageId);
        } catch {
            await interaction.reply({
                content: '[ERROR] Could not fetch the message. It may have been deleted.',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (!reportedMessage) {
            await interaction.reply({
                content: '[ERROR] Could not fetch the message. It may have been deleted.',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const reporter = interaction.user;
        const author = reportedMessage.author;

        // Create report
        const reportId = generateId();
        const channelTyped = channel as TextChannel;
        const reportData: ReportData = {
            reportId,
            messageId: reportedMessage.id,
            channelId: channelTyped.id,
            channelName: channelTyped.name ?? null,
            guildId: interaction.guild.id,
            authorId: author.id,
            authorTag: author.tag,
            reporterId: reporter.id,
            reporterTag: reporter.tag,
            reason,
            timestamp: Date.now(),
            status: 'pending',
            reviewedBy: null,
            reviewedAt: null,
            resolution: null
        };

        // Save report to database
        await updateGuildData('reports', interaction.guild.id, (data: any) => {
            data.reports ??= [];
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
                    value: `<#${channelTyped.id}>`,
                    inline: true
                }
            ],
            timestamp: new Date().toISOString()
        };

        await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

        // Send report to moderators
        const reportEmbed = {
            color: 0xFFA500,
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
                    value: `<#${channelTyped.id}>`,
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
        const messageLink = `https://discord.com/channels/${interaction.guild.id}/${(channel as TextChannel).id}/${reportedMessage.id}`;
        reportEmbed.fields.push({
            name: '[LINK] Message Link',
            value: messageLink,
            inline: false
        });

        // Add thumbnail if author has avatar
        if (author.displayAvatarURL()) {
            (reportEmbed as any).thumbnail = {
                url: author.displayAvatarURL()
            };
        }

        // Get logging channel and send report
        const logConfig = await getLoggingConfig(interaction.guild.id);

        if (logConfig?.channelId) {
            const logChannel = interaction.guild.channels.cache.get(logConfig.channelId);
            if (logChannel) {
                // Create action buttons
                const actionRow = {
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 3,
                            label: 'Review',
                            custom_id: `report_review_${reportId}`
                        },
                        {
                            type: 2,
                            style: 4,
                            label: 'Dismiss',
                            custom_id: `report_dismiss_${reportId}`
                        },
                        {
                            type: 2,
                            style: 1,
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

        logger.info({ msg: `[MODERATION] Report #${reportId} submitted by ${reporter.tag} against ${author.tag}` });

        return true;

    } catch (error) {
        // @ts-expect-error pino logger overload mismatch with test expectations
        logger.error('[ERROR] Report submission error:', error as Error);
        return false;
    }
}