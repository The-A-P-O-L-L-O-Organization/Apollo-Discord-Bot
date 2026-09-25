import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface ClosedTicket {
    assignedTo?: string[];
    claimedBy?: string;
    rating?: number;
    ratingFeedback?: string;
    closedAt: number;
    category?: string;
    ticketNumber?: number;
}

export default {
    name: 'ticketratings',
    data: new SlashCommandBuilder()
        .setName('ticketratings')
        .setDescription('View ticket rating statistics')
        .addSubcommand(subcommand =>
            subcommand
                .setName('staff')
                .setDescription('View ratings for a specific staff member')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The staff member to view ratings for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('category')
                .setDescription('View ratings by category')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('The category to view ratings for')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Technical Support', value: 'technical' },
                            { name: 'Billing', value: 'billing' },
                            { name: 'General', value: 'general' },
                            { name: 'Report', value: 'report' },
                            { name: 'Other', value: 'other' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('overall')
                .setDescription('View overall rating statistics')
        )
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
            const subcommand = interaction.options.getSubcommand();
            const ticketConfig = await getGuildData('tickets', guildId);
            const closedTickets = (ticketConfig['closedTickets'] ?? []) as ClosedTicket[];

            if (subcommand === 'staff') {
                const user = interaction.options.getUser('user')!;

                const staffTickets = closedTickets.filter(t =>
                    t.assignedTo?.includes(user.id) ?? t.claimedBy === user.id
                );

                if (staffTickets.length === 0) {
                    await interaction.editReply({
                        content: t('ticketratings.noStaffTickets', { user: user.id })
                    });
                    return;
                }

                const ratedTickets = staffTickets.filter((t): t is ClosedTicket & { rating: number } => Boolean(t.rating));

                if (ratedTickets.length === 0) {
                    await interaction.editReply({
                        content: t('ticketratings.staffUnrated', { user: user.id, count: staffTickets.length })
                    });
                    return;
                }

                const avgRating = ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length;
                const ratingCounts = {
                    5: ratedTickets.filter(t => t.rating === 5).length,
                    4: ratedTickets.filter(t => t.rating === 4).length,
                    3: ratedTickets.filter(t => t.rating === 3).length,
                    2: ratedTickets.filter(t => t.rating === 2).length,
                    1: ratedTickets.filter(t => t.rating === 1).length
                };

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(t('ticketratings.staffTitle', { user: user.tag }))
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: t('ticketratings.fieldTotalHandled'), value: `${staffTickets.length}`, inline: true },
                        { name: t('ticketratings.fieldTicketsRated'), value: `${ratedTickets.length}`, inline: true },
                        { name: t('ticketratings.fieldAverageRating'), value: t('ticketratings.avgRatingValue', { value: avgRating.toFixed(2), stars: '★'.repeat(Math.round(avgRating)) }), inline: true }
                    )
                    .setTimestamp();

                const distribution = [
                    t('ticketratings.distFive', { count: ratingCounts[5], pct: ((ratingCounts[5] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distFour', { count: ratingCounts[4], pct: ((ratingCounts[4] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distThree', { count: ratingCounts[3], pct: ((ratingCounts[3] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distTwo', { count: ratingCounts[2], pct: ((ratingCounts[2] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distOne', { count: ratingCounts[1], pct: ((ratingCounts[1] / ratedTickets.length) * 100).toFixed(1) })
                ].join('\n');

                embed.addFields({ name: t('ticketratings.fieldDistribution'), value: distribution, inline: false });

                const recentFeedback = ratedTickets
                    .filter((t): t is ClosedTicket & { rating: number; ratingFeedback: string } => Boolean(t.ratingFeedback))
                    .sort((a, b) => b.closedAt - a.closedAt)
                    .slice(0, 3);

                if (recentFeedback.length > 0) {
                    const feedbackList = recentFeedback.map(fb =>
                        t('ticketratings.feedbackRow', { stars: '★'.repeat(fb.rating), number: fb.ticketNumber, feedback: fb.ratingFeedback.substring(0, 100), suffix: fb.ratingFeedback.length > 100 ? '...' : '' })
                    ).join('\n\n');

                    embed.addFields({ name: t('ticketratings.fieldRecentFeedback'), value: feedbackList, inline: false });
                }

                await interaction.editReply({ embeds: [embed] });
                return;

            } else if (subcommand === 'category') {
                const category = interaction.options.getString('category')!;

                const categoryTickets = closedTickets.filter(t => t.category === category);

                if (categoryTickets.length === 0) {
                    await interaction.editReply({
                        content: t('ticketratings.noCategoryTickets', { category })
                    });
                    return;
                }

                const ratedTickets = categoryTickets.filter((t): t is ClosedTicket & { rating: number } => Boolean(t.rating));

                if (ratedTickets.length === 0) {
                    await interaction.editReply({
                        content: t('ticketratings.categoryUnrated', { count: categoryTickets.length, category })
                    });
                    return;
                }

                const avgRating = ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length;
                const ratingCounts = {
                    5: ratedTickets.filter(t => t.rating === 5).length,
                    4: ratedTickets.filter(t => t.rating === 4).length,
                    3: ratedTickets.filter(t => t.rating === 3).length,
                    2: ratedTickets.filter(t => t.rating === 2).length,
                    1: ratedTickets.filter(t => t.rating === 1).length
                };

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(t('ticketratings.categoryTitle', { category: category.charAt(0).toUpperCase() + category.slice(1) }))
                    .addFields(
                        { name: t('ticketratings.fieldTotalTickets'), value: `${categoryTickets.length}`, inline: true },
                        { name: t('ticketratings.fieldTicketsRated'), value: `${ratedTickets.length}`, inline: true },
                        { name: t('ticketratings.fieldAverageRating'), value: t('ticketratings.avgRatingValue', { value: avgRating.toFixed(2), stars: '★'.repeat(Math.round(avgRating)) }), inline: true }
                    )
                    .setTimestamp();

                const distribution = [
                    t('ticketratings.distFive', { count: ratingCounts[5], pct: ((ratingCounts[5] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distFour', { count: ratingCounts[4], pct: ((ratingCounts[4] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distThree', { count: ratingCounts[3], pct: ((ratingCounts[3] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distTwo', { count: ratingCounts[2], pct: ((ratingCounts[2] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distOne', { count: ratingCounts[1], pct: ((ratingCounts[1] / ratedTickets.length) * 100).toFixed(1) })
                ].join('\n');

                embed.addFields({ name: t('ticketratings.fieldDistribution'), value: distribution, inline: false });

                await interaction.editReply({ embeds: [embed] });
                return;

            } else if (subcommand === 'overall') {
                const ratedTickets = closedTickets.filter((t): t is ClosedTicket & { rating: number } => Boolean(t.rating));

                if (ratedTickets.length === 0) {
                    await interaction.editReply({
                        content: t('ticketratings.noRated', { count: closedTickets.length })
                    });
                    return;
                }

                const avgRating = ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length;
                const ratingCounts = {
                    5: ratedTickets.filter(t => t.rating === 5).length,
                    4: ratedTickets.filter(t => t.rating === 4).length,
                    3: ratedTickets.filter(t => t.rating === 3).length,
                    2: ratedTickets.filter(t => t.rating === 2).length,
                    1: ratedTickets.filter(t => t.rating === 1).length
                };

                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle(t('ticketratings.overallTitle'))
                    .addFields(
                        { name: t('ticketratings.fieldTotalTickets'), value: `${closedTickets.length}`, inline: true },
                        { name: t('ticketratings.fieldTicketsRated'), value: `${ratedTickets.length}`, inline: true },
                        { name: t('ticketratings.fieldRatingRate'), value: `${((ratedTickets.length / closedTickets.length) * 100).toFixed(1)}%`, inline: true },
                        { name: t('ticketratings.fieldAverageRating'), value: t('ticketratings.avgRatingValue', { value: avgRating.toFixed(2), stars: '★'.repeat(Math.round(avgRating)) }), inline: false }
                    )
                    .setTimestamp();

                const distribution = [
                    t('ticketratings.distFive', { count: ratingCounts[5], pct: ((ratingCounts[5] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distFour', { count: ratingCounts[4], pct: ((ratingCounts[4] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distThree', { count: ratingCounts[3], pct: ((ratingCounts[3] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distTwo', { count: ratingCounts[2], pct: ((ratingCounts[2] / ratedTickets.length) * 100).toFixed(1) }),
                    t('ticketratings.distOne', { count: ratingCounts[1], pct: ((ratingCounts[1] / ratedTickets.length) * 100).toFixed(1) })
                ].join('\n');

                embed.addFields({ name: t('ticketratings.fieldDistribution'), value: distribution, inline: false });

                const categoryRatings: Record<string, number[]> = {};
                ratedTickets.forEach(t => {
                    const cat = t.category ?? 'general';
                    categoryRatings[cat] ??= [];
                    categoryRatings[cat].push(t.rating);
                });

                const categoryStats = Object.entries(categoryRatings)
                    .map(([cat, ratings]) => {
                        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
                        return t('ticketratings.categoryAvgRow', { name: cat.charAt(0).toUpperCase() + cat.slice(1), value: avg.toFixed(2), count: ratings.length });
                    })
                    .join('\n');

                if (categoryStats) {
                    embed.addFields({ name: t('ticketratings.fieldByCategory'), value: categoryStats, inline: false });
                }

                await interaction.editReply({ embeds: [embed] });
                return;
            }
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