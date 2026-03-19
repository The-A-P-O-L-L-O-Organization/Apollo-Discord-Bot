// Assign Command
// Allows staff to assign tickets to specific support members

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../utils/db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign the current ticket to a staff member')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The staff member to assign this ticket to')
                .setRequired(true)
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const assignUser = interaction.options.getUser('user');

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
                content: 'You do not have permission to assign tickets.',
                ephemeral: true
            });
        }

        // Check if user is already assigned
        if (!ticket.assignedTo) ticket.assignedTo = [];
        
        if (ticket.assignedTo.includes(assignUser.id)) {
            return interaction.reply({
                content: `${assignUser} is already assigned to this ticket.`,
                ephemeral: true
            });
        }

        // Assign the user
        ticket.assignedTo.push(assignUser.id);

        // Update participants
        if (!ticket.participants) ticket.participants = [ticket.userId];
        if (!ticket.participants.includes(assignUser.id)) {
            ticket.participants.push(assignUser.id);
        }

        setGuildData('tickets', guildId, ticketConfig);

        // Grant channel permissions to assigned user
        try {
            await interaction.channel.permissionOverwrites.edit(assignUser.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });
        } catch (error) {
            console.error('[ERROR] Failed to update channel permissions:', error);
        }

        // Send assignment notification
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Ticket Assigned')
            .setDescription(`${assignUser} has been assigned to this ticket.`)
            .addFields(
                { name: 'Assigned by', value: `${interaction.user}`, inline: true },
                { name: 'Assigned to', value: `${assignUser}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ 
            content: `${assignUser}`,
            embeds: [embed] 
        });

        // Try to DM the assigned user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('Ticket Assigned to You')
                .setDescription(`You have been assigned to ticket #${ticket.ticketNumber} in **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Ticket', value: `<#${channelId}>`, inline: true },
                    { name: 'Category', value: ticket.category || 'general', inline: true }
                )
                .setTimestamp();

            await assignUser.send({ embeds: [dmEmbed] });
        } catch (error) {
            // User has DMs disabled
        }
    }
};
