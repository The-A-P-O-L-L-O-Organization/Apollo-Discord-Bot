import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';
import { calculateSLAMetrics, formatTime } from '../../../utils/slaTracker.js';

export default {
    name: 'ticketstats',
    data: new SlashCommandBuilder()
        .setName('ticketstats')
        .setDescription('View comprehensive ticket statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const guildId = interaction.guild.id;
        const ticketConfig = await getGuildData('tickets', guildId);
        const openTickets = ticketConfig.openTickets || [];
        const closedTickets = ticketConfig.closedTickets || [];
        const totalTickets = ticketConfig.totalTickets || 0;

        const metrics = await calculateSLAMetrics(guildId);

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('📊 Ticket System Statistics')
            .setTimestamp();

        embed.addFields({
            name: '🎯 Overall Statistics',
            value: [
                `Total Tickets Created: **${totalTickets}**`,
                `Currently Open: **${openTickets.length}**`,
                `Total Closed: **${closedTickets.length}**`,
                `Average Response Time: **${formatTime(metrics.avgResponseTime)}**`,
                `Average Resolution Time: **${formatTime(metrics.avgResolutionTime)}**`
            ].join('\n'),
            inline: false
        });

        if (openTickets.length > 0) {
            const unassigned = openTickets.filter(t => !t.assignedTo || t.assignedTo.length === 0).length;
            const awaitingResponse = openTickets.filter(t => !t.firstResponseAt).length;
            
            const priorityCounts = {
                urgent: openTickets.filter(t => t.priority === 'urgent').length,
                high: openTickets.filter(t => t.priority === 'high').length,
                medium: openTickets.filter(t => t.priority === 'medium').length,
                low: openTickets.filter(t => t.priority === 'low').length
            };

            embed.addFields({
                name: '🔓 Open Tickets Breakdown',
                value: [
                    `Unassigned: **${unassigned}**`,
                    `Awaiting Response: **${awaitingResponse}**`,
                    `🔴 Urgent: **${priorityCounts.urgent}**`,
                    `🟠 High: **${priorityCounts.high}**`,
                    `🟡 Medium: **${priorityCounts.medium}**`,
                    `🔵 Low: **${priorityCounts.low}**`
                ].join('\n'),
                inline: true
            });
        }

        const allTickets = [...openTickets, ...closedTickets];
        const categoryCounts = {};
        allTickets.forEach(ticket => {
            const cat = ticket.category || 'general';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        if (Object.keys(categoryCounts).length > 0) {
            const categoryList = Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, count]) => `${cat.charAt(0).toUpperCase() + cat.slice(1)}: **${count}**`)
                .join('\n');

            embed.addFields({
                name: '📁 Top Categories',
                value: categoryList,
                inline: true
            });
        }

        const ratedTickets = closedTickets.filter(t => t.rating);
        if (ratedTickets.length > 0) {
            const avgRating = ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length;
            const ratingCounts = {
                5: ratedTickets.filter(t => t.rating === 5).length,
                4: ratedTickets.filter(t => t.rating === 4).length,
                3: ratedTickets.filter(t => t.rating === 3).length,
                2: ratedTickets.filter(t => t.rating === 2).length,
                1: ratedTickets.filter(t => t.rating === 1).length
            };

            embed.addFields({
                name: '⭐ Rating Statistics',
                value: [
                    `Average Rating: **${avgRating.toFixed(1)}/5.0**`,
                    `Total Rated: **${ratedTickets.length}**`,
                    `5★: ${ratingCounts[5]} | 4★: ${ratingCounts[4]} | 3★: ${ratingCounts[3]}`,
                    `2★: ${ratingCounts[2]} | 1★: ${ratingCounts[1]}`
                ].join('\n'),
                inline: false
            });
        }

        if (closedTickets.length > 0) {
            const slaRate = ((metrics.slaMet / metrics.totalTickets) * 100).toFixed(1);
            embed.addFields({
                name: '⏱️ SLA Compliance',
                value: [
                    `Compliance Rate: **${slaRate}%**`,
                    `Met: **${metrics.slaMet}** | Breached: **${metrics.slaBreached}**`,
                    `Current Breached: **${metrics.openTicketsBreached}**`
                ].join('\n'),
                inline: false
            });
        }

        const staffStats = {};
        closedTickets.forEach(ticket => {
            if (ticket.assignedTo && ticket.assignedTo.length > 0) {
                ticket.assignedTo.forEach(staffId => {
                    if (!staffStats[staffId]) {
                        staffStats[staffId] = { count: 0, responseTimes: [] };
                    }
                    staffStats[staffId].count++;
                    if (ticket.firstResponseAt) {
                        staffStats[staffId].responseTimes.push(ticket.firstResponseAt - ticket.createdAt);
                    }
                });
            }
        });

        const topStaff = Object.entries(staffStats)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5);

        if (topStaff.length > 0) {
            const staffList = await Promise.all(
                topStaff.map(async([staffId, data]) => {
                    const user = await interaction.client.users.fetch(staffId).catch(() => null);
                    const avgTime = data.responseTimes.length > 0
                        ? data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length
                        : 0;
                    return `${user ? user.tag : 'Unknown'}: **${data.count}** tickets | Avg: ${formatTime(avgTime)}`;
                })
            );

            embed.addFields({
                name: '👥 Top Support Staff',
                value: staffList.join('\n'),
                inline: false
            });
        }

        const recentClosed = closedTickets
            .sort((a, b) => b.closedAt - a.closedAt)
            .slice(0, 1)[0];

        if (recentClosed) {
            embed.addFields({
                name: '🕒 Last Closed Ticket',
                value: `Ticket #${recentClosed.ticketNumber} closed <t:${Math.floor(recentClosed.closedAt / 1000)}:R>`,
                inline: false
            });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};
