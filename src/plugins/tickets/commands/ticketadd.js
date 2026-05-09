import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData } from '../../../utils/db.js';

export default {
    name: 'ticketadd',
    data: new SlashCommandBuilder()
        .setName('ticketadd')
        .setDescription('Add a user to the current ticket')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to add to this ticket')
                .setRequired(true)
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const addUser = interaction.options.getUser('user');

        const ticketConfig = getGuildData('tickets', guildId);

        const ticket = ticketConfig.openTickets?.find(t => t.channelId === channelId);

        if (!ticket) {
            return interaction.reply({
                content: 'This channel is not a ticket channel.',
                ephemeral: true
            });
        }

        const member = interaction.member;
        const isTicketOwner = ticket.userId === interaction.user.id;
        const isAssigned = ticket.assignedTo && ticket.assignedTo.includes(interaction.user.id);
        const hasSupport = ticketConfig.supportRoleId && member.roles.cache.has(ticketConfig.supportRoleId);
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isTicketOwner && !isAssigned && !hasSupport && !isAdmin) {
            return interaction.reply({
                content: 'You do not have permission to add users to this ticket.',
                ephemeral: true
            });
        }

        if (!ticket.participants) {ticket.participants = [ticket.userId];}
        
        if (ticket.participants.includes(addUser.id)) {
            return interaction.reply({
                content: `${addUser} is already in this ticket.`,
                ephemeral: true
            });
        }

        ticket.participants.push(addUser.id);
        setGuildData('tickets', guildId, ticketConfig);

        try {
            await interaction.channel.permissionOverwrites.edit(addUser.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });
        } catch (error) {
            console.error('[ERROR] Failed to update channel permissions:', error);
            return interaction.reply({
                content: 'Failed to add user to ticket. Please check my permissions.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('User Added to Ticket')
            .setDescription(`${addUser} has been added to this ticket.`)
            .addFields(
                { name: 'Added by', value: `${interaction.user}`, inline: true },
                { name: 'User', value: `${addUser}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ 
            content: `${addUser}`,
            embeds: [embed] 
        });

        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('Added to Ticket')
                .setDescription(`You have been added to ticket #${ticket.ticketNumber} in **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Ticket', value: `<#${channelId}>`, inline: true },
                    { name: 'Added by', value: interaction.user.tag, inline: true }
                )
                .setTimestamp();

            await addUser.send({ embeds: [dmEmbed] });
        } catch (error) {
        }
    }
};
