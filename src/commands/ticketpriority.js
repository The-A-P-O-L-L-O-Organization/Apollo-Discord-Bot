// Ticket Priority Command
// Allows staff to change the priority of an existing ticket

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../utils/db.js';
import { getPriorityColor, getPriorityEmoji } from '../utils/slaTracker.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticketpriority')
        .setDescription('Change the priority of the current ticket')
        .addStringOption(option =>
            option
                .setName('priority')
                .setDescription('New priority level')
                .setRequired(true)
                .addChoices(
                    { name: '🔴 Urgent', value: 'urgent' },
                    { name: '🟠 High', value: 'high' },
                    { name: '🟡 Medium', value: 'medium' },
                    { name: '🔵 Low', value: 'low' }
                )
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const newPriority = interaction.options.getString('priority');

        // Get ticket configuration
        const ticketConfig = getGuildData('tickets', guildId);

        // Find the ticket
        const ticket = ticketConfig.openTickets?.find(t => t.channelId === channelId);

        if (!ticket) {
            return interaction.reply({
                content: 'This channel is not a ticket channel.',
                ephemeral: true
            });
        }

        // Check permissions - support role or admin only
        const member = interaction.member;
        const hasSupport = ticketConfig.supportRoleId && member.roles.cache.has(ticketConfig.supportRoleId);
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasSupport && !isAdmin) {
            return interaction.reply({
                content: 'You do not have permission to change ticket priority.',
                ephemeral: true
            });
        }

        const oldPriority = ticket.priority || 'medium';

        if (oldPriority === newPriority) {
            return interaction.reply({
                content: `This ticket is already set to **${newPriority}** priority.`,
                ephemeral: true
            });
        }

        // Update the priority
        ticket.priority = newPriority;

        // Update tags
        if (!ticket.tags) ticket.tags = [];
        ticket.tags = ticket.tags.filter(tag => tag !== oldPriority);
        ticket.tags.push(newPriority);

        setGuildData('tickets', guildId, ticketConfig);

        // Update channel topic
        try {
            const newTopic = `${getPriorityEmoji(newPriority)} Ticket #${ticket.ticketNumber} | ${ticket.category || 'general'} | ${newPriority} priority | Created by ${(await interaction.guild.members.fetch(ticket.userId).catch(() => null))?.user?.tag || 'Unknown'}`;
            await interaction.channel.setTopic(newTopic);
        } catch (error) {
            console.error('[ERROR] Failed to update channel topic:', error);
        }

        // Send update message
        const embed = new EmbedBuilder()
            .setColor(getPriorityColor(newPriority))
            .setTitle('Ticket Priority Updated')
            .setDescription(`Priority changed from **${getPriorityEmoji(oldPriority)} ${oldPriority.toUpperCase()}** to **${getPriorityEmoji(newPriority)} ${newPriority.toUpperCase()}**`)
            .addFields(
                { name: 'Updated by', value: `${interaction.user}`, inline: true },
                { name: 'New Priority', value: `${getPriorityEmoji(newPriority)} ${newPriority.charAt(0).toUpperCase() + newPriority.slice(1)}`, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
