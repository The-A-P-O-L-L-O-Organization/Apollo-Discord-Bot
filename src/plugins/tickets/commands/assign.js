import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';

export default {
    name: 'assign',
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

        const ticketConfig = await getGuildData('tickets', guildId);

        const ticket = ticketConfig.openTickets?.find(t => t.channelId === channelId);

        if (!ticket) {
            return interaction.reply({
                content: 'This channel is not a ticket channel.',
                flags: 64
            });
        }

        const member = interaction.member;
        const hasSupport = ticketConfig.supportRoleId && member.roles.cache.has(ticketConfig.supportRoleId);
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasSupport && !isAdmin) {
            return interaction.reply({
                content: 'You do not have permission to assign tickets.',
                flags: 64
            });
        }

        if (!ticket.assignedTo) {ticket.assignedTo = [];}
        
        if (ticket.assignedTo.includes(assignUser.id)) {
            return interaction.reply({
                content: `${assignUser} is already assigned to this ticket.`,
                flags: 64
            });
        }

        await updateGuildData('tickets', guildId, (data) => {
            const t = data.openTickets?.find(x => x.channelId === channelId);
            if (t) {
                t.assignedTo.push(assignUser.id);
                if (!t.participants) {t.participants = [t.userId];}
                if (!t.participants.includes(assignUser.id)) {
                    t.participants.push(assignUser.id);
                }
            }
            return data;
        });

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
        } catch {
        }
    }
};
