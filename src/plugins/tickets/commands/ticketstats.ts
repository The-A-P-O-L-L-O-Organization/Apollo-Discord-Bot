import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';
import { calculateSLAMetrics, formatTime } from '../../../utils/slaTracker.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface TicketData {
    ticketNumber: number;
    userId: string;
    channelId?: string;
    category?: string;
    priority?: string;
    status?: string;
    createdAt: number;
    closedAt?: number;
    closedBy?: string;
    closeReason?: string;
    reason?: string;
    firstResponseAt?: number;
    assignedTo?: string[];
    participants?: string[];
    tags?: string[];
    rating?: number;
    ratingFeedback?: string;
    claimedBy?: string;
}

export default {
    name: 'ticketstats',
    data: new SlashCommandBuilder()
        .setName('ticketstats')
        .setDescription('View comprehensive ticket statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'tickets');

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = interaction.guild!.id;
            const ticketConfig = await getGuildData('tickets', guildId);
            const openTickets = (ticketConfig['openTickets'] as TicketData[]) || [];
            const closedTickets = (ticketConfig['closedTickets'] as TicketData[]) || [];
            const totalTickets = (ticketConfig['totalTickets'] as number) || 0;

            const metrics = await calculateSLAMetrics(guildId);

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(t('ticketstats.title'))
                .setTimestamp();

            embed.addFields({
                name: t('ticketstats.fieldOverall'),
                value: [
                    t('ticketstats.lineTotal', { count: totalTickets }),
                    t('ticketstats.lineOpen', { count: openTickets.length }),
                    t('ticketstats.lineClosed', { count: closedTickets.length }),
                    t('ticketstats.lineAvgResponse', { value: formatTime(metrics.avgResponseTime) }),
                    t('ticketstats.lineAvgResolution', { value: formatTime(metrics.avgResolutionTime) })
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
                    name: t('ticketstats.fieldOpenBreakdown'),
                    value: [
                        t('ticketstats.lineUnassigned', { count: unassigned }),
                        t('ticketstats.lineAwaiting', { count: awaitingResponse }),
                        t('ticketstats.lineUrgent', { count: priorityCounts.urgent }),
                        t('ticketstats.lineHigh', { count: priorityCounts.high }),
                        t('ticketstats.lineMedium', { count: priorityCounts.medium }),
                        t('ticketstats.lineLow', { count: priorityCounts.low })
                    ].join('\n'),
                    inline: true
                });
            }

            const allTickets = [...openTickets, ...closedTickets];
            const categoryCounts: Record<string, number> = {};
            allTickets.forEach(ticket => {
                const cat = ticket.category ?? 'general';
                categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
            });

            if (Object.keys(categoryCounts).length > 0) {
                const categoryList = Object.entries(categoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([cat, count]) => t('ticketstats.lineCategoryRow', { name: cat.charAt(0).toUpperCase() + cat.slice(1), count }))
                    .join('\n');

                embed.addFields({
                    name: t('ticketstats.fieldTopCategories'),
                    value: categoryList,
                    inline: true
                });
            }

            const ratedTickets = closedTickets.filter(t => t.rating !== undefined);
            if (ratedTickets.length > 0) {
                const avgRating = ratedTickets.reduce((sum, t) => sum + (t.rating ?? 0), 0) / ratedTickets.length;
                const ratingCounts = {
                    5: ratedTickets.filter(t => (t.rating ?? 0) === 5).length,
                    4: ratedTickets.filter(t => (t.rating ?? 0) === 4).length,
                    3: ratedTickets.filter(t => (t.rating ?? 0) === 3).length,
                    2: ratedTickets.filter(t => (t.rating ?? 0) === 2).length,
                    1: ratedTickets.filter(t => (t.rating ?? 0) === 1).length
                };

                embed.addFields({
                    name: t('ticketstats.fieldRatings'),
                    value: [
                        t('ticketstats.lineAvgRating', { value: avgRating.toFixed(1) }),
                        t('ticketstats.lineTotalRated', { count: ratedTickets.length }),
                        t('ticketstats.lineDistHigh', { a: ratingCounts[5], b: ratingCounts[4], c: ratingCounts[3] }),
                        t('ticketstats.lineDistLow', { a: ratingCounts[2], b: ratingCounts[1] })
                    ].join('\n'),
                    inline: false
                });
            }

            if (closedTickets.length > 0) {
                const slaRate = ((metrics.slaMet / metrics.totalTickets) * 100).toFixed(1);
                embed.addFields({
                    name: t('ticketstats.fieldSla'),
                    value: [
                        t('ticketstats.lineCompliance', { value: slaRate }),
                        t('ticketstats.lineSlaMet', { met: metrics.slaMet, breached: metrics.slaBreached }),
                        t('ticketstats.lineCurrentBreached', { count: metrics.openTicketsBreached })
                    ].join('\n'),
                    inline: false
                });
            }

            const staffStats: Record<string, { count: number; responseTimes: number[] }> = {};
            closedTickets.forEach(ticket => {
                if (ticket.assignedTo && ticket.assignedTo.length > 0) {
                    ticket.assignedTo.forEach(staffId => {
                        staffStats[staffId] ??= { count: 0, responseTimes: [] };
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
                        return t('ticketstats.lineStaffRow', { name: user ? user.tag : t('ticketstats.unknown'), count: data.count, duration: formatTime(avgTime) });
                    })
                );

                embed.addFields({
                    name: t('ticketstats.fieldTopStaff'),
                    value: staffList.join('\n'),
                    inline: false
                });
            }

            const recentClosed = closedTickets
                .filter(t => t.closedAt !== undefined)
                .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
                .slice(0, 1)[0];

            if (recentClosed?.closedAt) {
                embed.addFields({
                    name: t('ticketstats.fieldLastClosed'),
                    value: t('ticketstats.lineLastClosed', { number: recentClosed.ticketNumber, ts: Math.floor(recentClosed.closedAt / 1000) }),
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};