// Ticket Transfer Command
// Allows staff to transfer/handoff tickets to other staff members

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../utils/db.js';

export default {
    data: new SlashCommandBuilder()
        .setName('tickettransfer')
        .setDescription('Transfer the current ticket to another staff member')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The staff member to transfer this ticket to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('Transfer note/reason')
                .setRequired(false)
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const transferUser = interaction.options.getUser('user');
        const note = interaction.options.getString('note') || 'No note provided';

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

        // Check permissions - must be assigned to ticket or have support role/admin
        const member = interaction.member;
        const isAssigned = ticket.assignedTo && ticket.assignedTo.includes(interaction.user.id);
        const isClaimed = ticket.claimedBy === interaction.user.id;
        const hasSupport = ticketConfig.supportRoleId && member.roles.cache.has(ticketConfig.supportRoleId);
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isAssigned && !isClaimed && !hasSupport && !isAdmin) {
            return interaction.reply({
                content: 'You do not have permission to transfer this ticket.',
                ephemeral: true
            });
        }

        // Cannot transfer to yourself
        if (transferUser.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot transfer a ticket to yourself.',
                ephemeral: true
            });
        }

        // Store old assignee info
        const oldAssignees = [...(ticket.assignedTo || [])];
        const oldClaimed = ticket.claimedBy;

        // Update ticket assignment
        ticket.assignedTo = [transferUser.id];
        ticket.claimedBy = transferUser.id;

        // Add to participants if not already there
        if (!ticket.participants) {ticket.participants = [ticket.userId];}
        if (!ticket.participants.includes(transferUser.id)) {
            ticket.participants.push(transferUser.id);
        }

        setGuildData('tickets', guildId, ticketConfig);

        // Grant channel permissions to new assignee
        try {
            await interaction.channel.permissionOverwrites.edit(transferUser.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });
        } catch (error) {
            console.error('[ERROR] Failed to update channel permissions:', error);
        }

        // Send transfer notification in channel
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('Ticket Transferred')
            .setDescription(`This ticket has been transferred to ${transferUser}.`)
            .addFields(
                { name: 'Transferred by', value: `${interaction.user}`, inline: true },
                { name: 'New assignee', value: `${transferUser}`, inline: true },
                { name: 'Note', value: note, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ 
            content: `${transferUser}`,
            embeds: [embed] 
        });

        // Try to DM the new assignee
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('Ticket Transferred to You')
                .setDescription(`Ticket #${ticket.ticketNumber} in **${interaction.guild.name}** has been transferred to you.`)
                .addFields(
                    { name: 'Ticket', value: `<#${channelId}>`, inline: true },
                    { name: 'From', value: interaction.user.tag, inline: true },
                    { name: 'Category', value: ticket.category || 'general', inline: true },
                    { name: 'Priority', value: ticket.priority || 'medium', inline: true },
                    { name: 'Note', value: note, inline: false }
                )
                .setTimestamp();

            await transferUser.send({ embeds: [dmEmbed] });
        } catch (error) {
            // User has DMs disabled
        }

        // Try to DM old assignees (if any)
        for (const oldAssigneeId of oldAssignees) {
            if (oldAssigneeId === transferUser.id) {continue;}
            
            try {
                const oldAssignee = await interaction.client.users.fetch(oldAssigneeId);
                const dmEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('Ticket Transferred')
                    .setDescription(`Ticket #${ticket.ticketNumber} in **${interaction.guild.name}** has been transferred to ${transferUser.tag}.`)
                    .addFields(
                        { name: 'Transferred by', value: interaction.user.tag, inline: true },
                        { name: 'Note', value: note, inline: false }
                    )
                    .setTimestamp();

                await oldAssignee.send({ embeds: [dmEmbed] });
            } catch (error) {
                // User not found or DMs disabled
            }
        }
    }
};
