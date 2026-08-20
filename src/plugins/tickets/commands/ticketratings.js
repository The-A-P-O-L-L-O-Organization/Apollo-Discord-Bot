import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';

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

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const guildId = interaction.guild.id;
        const subcommand = interaction.options.getSubcommand();
        const ticketConfig = await getGuildData('tickets', guildId);
        const closedTickets = ticketConfig.closedTickets || [];

        if (subcommand === 'staff') {
            const user = interaction.options.getUser('user');
            
            const staffTickets = closedTickets.filter(t => 
                t.assignedTo?.includes(user.id) || t.claimedBy === user.id
            );

            if (staffTickets.length === 0) {
                return interaction.editReply({
                    content: `No closed tickets found for ${user}.`
                });
            }

            const ratedTickets = staffTickets.filter(t => t.rating);
            
            if (ratedTickets.length === 0) {
                return interaction.editReply({
                    content: `${user} has handled ${staffTickets.length} ticket(s), but none have been rated yet.`
                });
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
                .setTitle(`⭐ Ratings for ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: 'Total Tickets Handled', value: `${staffTickets.length}`, inline: true },
                    { name: 'Tickets Rated', value: `${ratedTickets.length}`, inline: true },
                    { name: 'Average Rating', value: `${avgRating.toFixed(2)}/5.0 ${'⭐'.repeat(Math.round(avgRating))}`, inline: true }
                )
                .setTimestamp();

            const distribution = [
                `⭐⭐⭐⭐⭐: ${ratingCounts[5]} (${((ratingCounts[5] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐⭐⭐: ${ratingCounts[4]} (${((ratingCounts[4] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐⭐: ${ratingCounts[3]} (${((ratingCounts[3] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐: ${ratingCounts[2]} (${((ratingCounts[2] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐: ${ratingCounts[1]} (${((ratingCounts[1] / ratedTickets.length) * 100).toFixed(1)}%)`
            ].join('\n');

            embed.addFields({ name: 'Rating Distribution', value: distribution, inline: false });

            const recentFeedback = ratedTickets
                .filter(t => t.ratingFeedback)
                .sort((a, b) => b.closedAt - a.closedAt)
                .slice(0, 3);

            if (recentFeedback.length > 0) {
                const feedbackList = recentFeedback.map(t => 
                    `${'⭐'.repeat(t.rating)} (Ticket #${t.ticketNumber}): "${t.ratingFeedback.substring(0, 100)}${t.ratingFeedback.length > 100 ? '...' : ''}"`
                ).join('\n\n');

                embed.addFields({ name: 'Recent Feedback', value: feedbackList, inline: false });
            }

            return interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'category') {
            const category = interaction.options.getString('category');
            
            const categoryTickets = closedTickets.filter(t => t.category === category);

            if (categoryTickets.length === 0) {
                return interaction.editReply({
                    content: `No closed tickets found for category "${category}".`
                });
            }

            const ratedTickets = categoryTickets.filter(t => t.rating);
            
            if (ratedTickets.length === 0) {
                return interaction.editReply({
                    content: `${categoryTickets.length} ticket(s) in "${category}" category, but none have been rated yet.`
                });
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
                .setTitle(`⭐ Ratings for "${category.charAt(0).toUpperCase() + category.slice(1)}" Category`)
                .addFields(
                    { name: 'Total Tickets', value: `${categoryTickets.length}`, inline: true },
                    { name: 'Tickets Rated', value: `${ratedTickets.length}`, inline: true },
                    { name: 'Average Rating', value: `${avgRating.toFixed(2)}/5.0 ${'⭐'.repeat(Math.round(avgRating))}`, inline: true }
                )
                .setTimestamp();

            const distribution = [
                `⭐⭐⭐⭐⭐: ${ratingCounts[5]} (${((ratingCounts[5] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐⭐⭐: ${ratingCounts[4]} (${((ratingCounts[4] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐⭐: ${ratingCounts[3]} (${((ratingCounts[3] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐: ${ratingCounts[2]} (${((ratingCounts[2] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐: ${ratingCounts[1]} (${((ratingCounts[1] / ratedTickets.length) * 100).toFixed(1)}%)`
            ].join('\n');

            embed.addFields({ name: 'Rating Distribution', value: distribution, inline: false });

            return interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'overall') {
            const ratedTickets = closedTickets.filter(t => t.rating);
            
            if (ratedTickets.length === 0) {
                return interaction.editReply({
                    content: `${closedTickets.length} ticket(s) have been closed, but none have been rated yet.`
                });
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
                .setTitle('⭐ Overall Rating Statistics')
                .addFields(
                    { name: 'Total Tickets', value: `${closedTickets.length}`, inline: true },
                    { name: 'Tickets Rated', value: `${ratedTickets.length}`, inline: true },
                    { name: 'Rating Rate', value: `${((ratedTickets.length / closedTickets.length) * 100).toFixed(1)}%`, inline: true },
                    { name: 'Average Rating', value: `${avgRating.toFixed(2)}/5.0 ${'⭐'.repeat(Math.round(avgRating))}`, inline: false }
                )
                .setTimestamp();

            const distribution = [
                `⭐⭐⭐⭐⭐: ${ratingCounts[5]} (${((ratingCounts[5] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐⭐⭐: ${ratingCounts[4]} (${((ratingCounts[4] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐⭐: ${ratingCounts[3]} (${((ratingCounts[3] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐⭐: ${ratingCounts[2]} (${((ratingCounts[2] / ratedTickets.length) * 100).toFixed(1)}%)`,
                `⭐: ${ratingCounts[1]} (${((ratingCounts[1] / ratedTickets.length) * 100).toFixed(1)}%)`
            ].join('\n');

            embed.addFields({ name: 'Rating Distribution', value: distribution, inline: false });

            const categoryRatings = {};
            ratedTickets.forEach(t => {
                const cat = t.category || 'general';
                if (!categoryRatings[cat]) {
                    categoryRatings[cat] = [];
                }
                categoryRatings[cat].push(t.rating);
            });

            const categoryStats = Object.entries(categoryRatings)
                .map(([cat, ratings]) => {
                    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
                    return `${cat.charAt(0).toUpperCase() + cat.slice(1)}: **${avg.toFixed(2)}**/5.0 (${ratings.length} rated)`;
                })
                .join('\n');

            if (categoryStats) {
                embed.addFields({ name: 'Average Rating by Category', value: categoryStats, inline: false });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
