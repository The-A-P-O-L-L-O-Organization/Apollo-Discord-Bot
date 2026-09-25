// Reports Command - View and manage message reports
import type { ChatInputCommandInteraction} from 'discord.js';
import { EmbedBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface ReportEntry {
    reportId: string;
    messageId: string;
    channelId: string;
    authorId: string;
    authorTag: string;
    reporterId: string;
    reporterTag: string;
    content: string;
    timestamp: number;
    status: string;
    resolvedBy?: string;
    resolvedAt?: number;
}

interface ReportsGuildData {
    entries: ReportEntry[];
}

export default {
    name: 'reports',
    description: 'View and manage message reports',
    category: 'Moderation',
    defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'action',
            description: 'The action to perform',
            type: 3, // STRING
            required: true,
            choices: [
                { name: 'View Pending', value: 'pending' },
                { name: 'View All', value: 'all' },
                { name: 'View by ID', value: 'view' },
                { name: 'Dismiss', value: 'dismiss' }
            ]
        },
        {
            name: 'report_id',
            description: 'The report ID (for view/dismiss actions)',
            type: 3, // STRING
            required: false
        }
    ],

    async execute(interaction: ChatInputCommandInteraction) {
        const resolved = await i18n.resolveLocale({ locale: interaction.locale, guildLocale: interaction.guildLocale ?? undefined, guildId: interaction.guildId ?? undefined });
        const t = i18n.getFixedT(resolved, 'moderation');
        try {
            const action = interaction.options.getString('action');
            const reportId = interaction.options.getString('report_id');

            const guildData = await getGuildData('reports', interaction.guild!.id);
            const reports = (guildData as unknown as ReportsGuildData).entries ?? [];

            if (action === 'pending') {
                const pending = reports.filter(r => r.status === 'pending');

                if (pending.length === 0) {
                    await interaction.reply({
                        embeds: [{
                            color: 0x00FF00,
                            title: t('reports.infoNoPendingReports'),
                            description: t('reports.thereAreNoPendingReports'),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle(t('reports.pendingReports'))
                    .setDescription(t('reports.foundCountPendingReportS', { count: pending.length }))
                    .setTimestamp();

                pending.slice(0, 10).forEach((report, index) => {
                    const date = new Date(report.timestamp).toLocaleString();
                    embed.addFields({
                        name: t('reports.reportValueIdReportid', { value: index + 1, reportId: report.reportId }),
                        value: `**Author:** ${report.authorTag} (\`${report.authorId}\`)\n**Reporter:** ${report.reporterTag}\n**Channel:** <#${report.channelId}>\n**Date:** ${date}\n**Status:** ${report.status}`,
                        inline: false
                    });
                });

                if (pending.length > 10) {
                    embed.setFooter({ text: t('reports.showingOfCountReports', { count: pending.length }) });
                }

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } else if (action === 'all') {
                if (reports.length === 0) {
                    await interaction.reply({
                        embeds: [{
                            color: 0x00FF00,
                            title: t('reports.infoNoReports'),
                            description: t('reports.thereAreNoReportsIn'),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const pending = reports.filter(r => r.status === 'pending').length;
                const resolvedCount = reports.filter(r => r.status !== 'pending').length;

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(t('reports.allReports'))
                    .setDescription(t('reports.totalCountReports', { count: reports.length }))
                    .addFields(
                        { name: t('reports.pending'), value: t('reports.count', { count: pending }), inline: true },
                        { name: t('reports.resolved'), value: t('reports.count2', { count: resolvedCount }), inline: true }
                    )
                    .setTimestamp();

                reports.slice(-10).reverse().forEach((report, _index) => {
                    const date = new Date(report.timestamp).toLocaleString();
                    embed.addFields({
                        name: t('reports.reportid', { reportId: report.reportId }),
                        value: t('reports.authorValueNReporterValue2', { value: report.authorTag, value2: report.reporterTag, date: date, status: report.status }),
                        inline: true
                    });
                });

                if (reports.length > 10) {
                    embed.setFooter({ text: t('reports.showingMostRecentOfCount', { count: reports.length }) });
                }

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } else if (action === 'view') {
                if (!reportId) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('reports.errorMissingReportId'),
                            description: t('reports.pleaseProvideAReportId'),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const report = reports.find(r => r.reportId === reportId);

                if (!report) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('reports.errorReportNotFound'),
                            description: t('reports.noReportFoundWithId', { reportId: reportId }),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const date = new Date(report.timestamp).toLocaleString();

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(t('reports.reportDetailsReportid', { reportId: reportId }))
                    .addFields(
                        { name: t('reports.messageAuthor'), value: `${report.authorTag}\n\`${report.authorId}\``, inline: true },
                        { name: t('reports.reporter'), value: `${report.reporterTag}\n\`${report.reporterId}\``, inline: true },
                        { name: t('reports.status'), value: report.status, inline: true },
                        { name: t('reports.channel'), value: t('reports.value', { value: report.channelId }), inline: true },
                        { name: t('reports.date'), value: date, inline: true },
                        { name: t('reports.messageContent'), value: report.content || t('reports.noTextContent'), inline: false }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

            } else if (action === 'dismiss') {
                if (!reportId) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('reports.errorMissingReportId2'),
                            description: t('reports.pleaseProvideAReportId2'),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const reportIndex = reports.findIndex(r => r.reportId === reportId);

                if (reportIndex === -1) {
                    await interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: t('reports.errorReportNotFound2'),
                            description: t('reports.noReportFoundWithId2', { reportId: reportId }),
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                await updateGuildData('reports', interaction.guild!.id, (data: Record<string, unknown>) => {
                    const entries = ((data as unknown as ReportsGuildData).entries ?? []);
                    const entry = entries[reportIndex]!;
                    entry.status = 'dismissed';
                    entry.resolvedBy = interaction.user.id;
                    entry.resolvedAt = Date.now();
                    (data as unknown as ReportsGuildData).entries = entries;
                    return data;
                });

                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: t('reports.successReportDismissed'),
                        description: t('reports.reportReportidHasBeenDismissed', { reportId: reportId }),
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });

                logger.info({ msg: `[REPORT] Report ${reportId} dismissed by ${interaction.user.tag}` });
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? t('reports.anUnknownErrorOccurred');
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};