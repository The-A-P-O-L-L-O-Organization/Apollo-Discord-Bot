import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';
import { formatTime, getPriorityColor, getPriorityEmoji } from '../../../utils/slaTracker.js';

export default {
    name: 'ticketinfo',
    data: new SlashCommandBuilder()
        .setName('ticketinfo')
        .setDescription('View detailed information about the current ticket or a specific ticket')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('Ticket number to view (defaults to current ticket)')
                .setRequired(false)
                .setMinValue(1)
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const ticketNumber = interaction.options.getInteger('number');

        const ticketConfig = await getGuildData('tickets', guildId);
        let ticket;

        if (ticketNumber) {
            ticket = ticketConfig.openTickets?.find(t => t.ticketNumber === ticketNumber) ||
                     ticketConfig.closedTickets?.find(t => t.ticketNumber === ticketNumber);
        } else {
            ticket = ticketConfig.openTickets?.find(t => t.channelId === channelId);
        }

        if (!ticket) {
            return interaction.reply({
                content: ticketNumber 
                    ? `Ticket #${ticketNumber} not found.`
                    : 'This channel is not a ticket channel. Use the `number` option to view a specific ticket.',
                ephemeral: true
            });
        }

        const priority = ticket.priority || 'medium';
        const category = ticket.category || 'general';
        const status = ticket.closedAt ? 'Closed' : ticket.status || 'open';

        const embed = new EmbedBuilder()
            .setColor(getPriorityColor(priority))
            .setTitle(`${getPriorityEmoji(priority)} Ticket #${ticket.ticketNumber} Information`)
            .setTimestamp();

        const creatorUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);
        embed.addFields(
            { name: 'Creator', value: creatorUser ? `${creatorUser} (${creatorUser.tag})` : `<@${ticket.userId}>`, inline: true },
            { name: 'Status', value: status.charAt(0).toUpperCase() + status.slice(1), inline: true },
            { name: 'Priority', value: `${getPriorityEmoji(priority)} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, inline: true },
            { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
            { name: 'Created', value: `<t:${Math.floor(ticket.createdAt / 1000)}:F>`, inline: true }
        );

        if (ticket.channelId) {
            embed.addFields({ name: 'Channel', value: `<#${ticket.channelId}>`, inline: true });
        }

        if (ticket.reason) {
            embed.addFields({ name: 'Reason', value: ticket.reason, inline: false });
        }

        if (ticket.claimedBy) {
            const claimedUser = await interaction.client.users.fetch(ticket.claimedBy).catch(() => null);
            embed.addFields({ 
                name: 'Claimed By', 
                value: claimedUser ? `${claimedUser} (${claimedUser.tag})` : `<@${ticket.claimedBy}>`, 
                inline: true 
            });
        }

        if (ticket.assignedTo && ticket.assignedTo.length > 0) {
            const assignedUsers = await Promise.all(
                ticket.assignedTo.map(id => interaction.client.users.fetch(id).catch(() => null))
            );
            const assignedList = assignedUsers
                .filter(u => u)
                .map(u => u.tag)
                .join(', ') || 'Unknown';
            
            embed.addFields({ 
                name: `Assigned Staff (${ticket.assignedTo.length})`, 
                value: assignedList, 
                inline: false 
            });
        } else {
            embed.addFields({ name: 'Assigned Staff', value: 'Unassigned', inline: true });
        }

        if (ticket.participants && ticket.participants.length > 1) {
            embed.addFields({ 
                name: 'Participants', 
                value: `${ticket.participants.length} user(s)`, 
                inline: true 
            });
        }

        if (ticket.firstResponseAt) {
            const responseTime = ticket.firstResponseAt - ticket.createdAt;
            embed.addFields({ 
                name: 'First Response Time', 
                value: formatTime(responseTime), 
                inline: true 
            });
        } else if (!ticket.closedAt) {
            const waitingTime = Date.now() - ticket.createdAt;
            embed.addFields({ 
                name: 'Waiting for Response', 
                value: formatTime(waitingTime), 
                inline: true 
            });
        }

        if (ticket.closedAt) {
            embed.addFields({ 
                name: 'Closed', 
                value: `<t:${Math.floor(ticket.closedAt / 1000)}:F>`, 
                inline: true 
            });

            const resolutionTime = ticket.closedAt - ticket.createdAt;
            embed.addFields({ 
                name: 'Resolution Time', 
                value: formatTime(resolutionTime), 
                inline: true 
            });

            if (ticket.closedBy) {
                const closedByUser = await interaction.client.users.fetch(ticket.closedBy).catch(() => null);
                embed.addFields({ 
                    name: 'Closed By', 
                    value: closedByUser ? closedByUser.tag : `<@${ticket.closedBy}>`, 
                    inline: true 
                });
            }

            if (ticket.closeReason) {
                embed.addFields({ name: 'Close Reason', value: ticket.closeReason, inline: false });
            }

            if (ticket.rating) {
                const stars = '⭐'.repeat(ticket.rating);
                embed.addFields({ 
                    name: 'Rating', 
                    value: `${stars} (${ticket.rating}/5)`, 
                    inline: true 
                });

                if (ticket.ratingFeedback) {
                    embed.addFields({ 
                        name: 'Feedback', 
                        value: ticket.ratingFeedback, 
                        inline: false 
                    });
                }
            }
        }

        if (ticket.tags && ticket.tags.length > 0) {
            embed.addFields({ 
                name: 'Tags', 
                value: ticket.tags.map(tag => `\`${tag}\``).join(', '), 
                inline: false 
            });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
