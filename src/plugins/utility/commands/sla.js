// SLA Command
// Displays SLA metrics and response time statistics

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { calculateSLAMetrics, formatTime, DEFAULT_SLA_THRESHOLDS } from '../../../utils/slaTracker.js';
import { getGuildData } from '../../../utils/db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('sla')
        .setDescription('View SLA metrics and response time statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    name: 'sla',
    category: 'utility',

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const metrics = calculateSLAMetrics(guildId);
        const ticketConfig = getGuildData('tickets', guildId);
        const slaThresholds = ticketConfig.slaThresholds || DEFAULT_SLA_THRESHOLDS;

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('📊 SLA Metrics & Response Times')
            .setDescription('Service Level Agreement statistics for ticket support')
            .setTimestamp();

        // Overall metrics
        const slaComplianceRate = metrics.totalTickets > 0 
            ? ((metrics.slaMet / metrics.totalTickets) * 100).toFixed(1)
            : 'N/A';

        embed.addFields({
            name: '📈 Overall Statistics',
            value: [
                `Total Closed Tickets: **${metrics.totalTickets}**`,
                `Average Response Time: **${formatTime(metrics.avgResponseTime)}**`,
                `Average Resolution Time: **${formatTime(metrics.avgResolutionTime)}**`,
                `SLA Compliance Rate: **${slaComplianceRate}%**`,
                `SLA Met: **${metrics.slaMet}** | Breached: **${metrics.slaBreached}**`
            ].join('\n'),
            inline: false
        });

        // Open tickets with breached SLA
        if (metrics.openTicketsBreached > 0) {
            embed.addFields({
                name: '⚠️ Open Tickets with Breached SLA',
                value: `**${metrics.openTicketsBreached}** open ticket(s) have exceeded their SLA threshold and need immediate attention.`,
                inline: false
            });
        }

        // SLA Thresholds
        embed.addFields({
            name: '⏱️ Current SLA Thresholds',
            value: [
                `🔴 Urgent: **${formatTime(slaThresholds.urgent)}**`,
                `🟠 High: **${formatTime(slaThresholds.high)}**`,
                `🟡 Medium: **${formatTime(slaThresholds.medium)}**`,
                `🔵 Low: **${formatTime(slaThresholds.low)}**`
            ].join('\n'),
            inline: true
        });

        // By Priority
        if (Object.keys(metrics.byPriority).length > 0) {
            const priorityStats = Object.entries(metrics.byPriority)
                .map(([priority, data]) => {
                    const emoji = priority === 'urgent' ? '🔴' : priority === 'high' ? '🟠' : priority === 'medium' ? '🟡' : '🔵';
                    return `${emoji} ${priority.charAt(0).toUpperCase() + priority.slice(1)}: **${data.count}** tickets, avg **${formatTime(data.avgResponseTime)}**`;
                })
                .join('\n');

            embed.addFields({
                name: '🎯 Response Time by Priority',
                value: priorityStats || 'No data',
                inline: false
            });
        }

        // By Category
        if (Object.keys(metrics.byCategory).length > 0) {
            const categoryStats = Object.entries(metrics.byCategory)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 5) // Top 5 categories
                .map(([category, data]) => {
                    return `**${category.charAt(0).toUpperCase() + category.slice(1)}**: ${data.count} tickets, avg **${formatTime(data.avgResponseTime)}**`;
                })
                .join('\n');

            embed.addFields({
                name: '📁 Response Time by Category (Top 5)',
                value: categoryStats || 'No data',
                inline: false
            });
        }

        // Recommendations
        if (metrics.openTicketsBreached > 0) {
            embed.addFields({
                name: '💡 Recommendations',
                value: '• Review open tickets with breached SLAs using `/ticketlist`\n• Consider adjusting SLA thresholds with `/ticketsetup sla`\n• Assign more support staff to high-priority categories',
                inline: false
            });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};
