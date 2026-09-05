import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { calculateSLAMetrics, formatTime, DEFAULT_SLA_THRESHOLDS } from '../../../utils/slaTracker.js';
import { getGuildData } from '../../../utils/db.js';
// @ts-expect-error discordErrors.js not yet migrated
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

interface SLAMetrics {
    totalTickets: number;
    avgResponseTime: number;
    avgResolutionTime: number;
    slaMet: number;
    slaBreached: number;
    openTicketsBreached: number;
    byPriority: Record<string, { count: number; avgResponseTime: number }>;
    byCategory: Record<string, { count: number; avgResponseTime: number }>;
}

interface SLAThresholds {
    urgent: number;
    high: number;
    medium: number;
    low: number;
}

interface TicketConfig {
    slaThresholds?: SLAThresholds;
}

export default {
    data: new SlashCommandBuilder()
        .setName('sla')
        .setDescription('View SLA metrics and response time statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    name: 'sla',
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = interaction.guild!.id;
            const metrics = await calculateSLAMetrics(guildId) as SLAMetrics;
            const ticketConfig = await getGuildData('tickets', guildId) as TicketConfig | null;
            const slaThresholds = ticketConfig?.slaThresholds ?? DEFAULT_SLA_THRESHOLDS;

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Statistics SLA Metrics & Response Times')
                .setDescription('Service Level Agreement statistics for ticket support')
                .setTimestamp();

            const slaComplianceRate = metrics.totalTickets > 0
                ? ((metrics.slaMet / metrics.totalTickets) * 100).toFixed(1)
                : 'N/A';

            embed.addFields({
                name: 'Chart Overall Statistics',
                value: [
                    `Total Closed Tickets: **${metrics.totalTickets}**`,
                    `Average Response Time: **${formatTime(metrics.avgResponseTime)}**`,
                    `Average Resolution Time: **${formatTime(metrics.avgResolutionTime)}**`,
                    `SLA Compliance Rate: **${slaComplianceRate}%**`,
                    `SLA Met: **${metrics.slaMet}** | Breached: **${metrics.slaBreached}**`
                ].join('\n'),
                inline: false
            });

            if (metrics.openTicketsBreached > 0) {
                embed.addFields({
                    name: '[WARNING] Open Tickets with Breached SLA',
                    value: `**${metrics.openTicketsBreached}** open ticket(s) have exceeded their SLA threshold and need immediate attention.`,
                    inline: false
                });
            }

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

            if (Object.keys(metrics.byPriority).length > 0) {
                const priorityStats = Object.entries(metrics.byPriority)
                    .map(([priority, data]) => {
                        const emoji = priority === 'urgent' ? '🔴' : priority === 'high' ? '🟠' : priority === 'medium' ? '🟡' : '🔵';
                        return `${emoji} ${priority.charAt(0).toUpperCase() + priority.slice(1)}: **${data.count}** tickets, avg **${formatTime(data.avgResponseTime)}**`;
                    })
                    .join('\n');

                embed.addFields({
                    name: ' Response Time by Priority',
                    value: priorityStats || 'No data',
                    inline: false
                });
            }

            if (Object.keys(metrics.byCategory).length > 0) {
                const categoryStats = Object.entries(metrics.byCategory)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 5)
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

            if (metrics.openTicketsBreached > 0) {
                embed.addFields({
                    name: 'Recommendations Recommendations',
                    value: '• Review open tickets with breached SLAs using `/ticketlist`\n• Consider adjusting SLA thresholds with `/ticketsetup sla`\n• Assign more support staff to high-priority categories',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
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