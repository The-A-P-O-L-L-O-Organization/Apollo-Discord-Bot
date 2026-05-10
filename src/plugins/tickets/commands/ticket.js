import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData, setGuildData, updateGuildData, generateId } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { getPriorityColor, getPriorityEmoji } from '../../../utils/slaTracker.js';

export default {
    name: 'ticket',
    description: 'Create a support ticket',
    category: 'utility',
    dmPermission: false,
    defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
    options: [
        {
            name: 'reason',
            description: 'Brief reason for opening the ticket',
            type: 3,
            required: false
        },
        {
            name: 'category',
            description: 'Category of the ticket',
            type: 3,
            required: false,
            choices: [
                { name: 'Technical Support', value: 'technical' },
                { name: 'Billing', value: 'billing' },
                { name: 'General', value: 'general' },
                { name: 'Report', value: 'report' },
                { name: 'Other', value: 'other' }
            ]
        },
        {
            name: 'priority',
            description: 'Priority level of the ticket',
            type: 3,
            required: false,
            choices: [
                { name: '🔴 Urgent', value: 'urgent' },
                { name: '🟠 High', value: 'high' },
                { name: '🟡 Medium', value: 'medium' },
                { name: '🔵 Low', value: 'low' }
            ]
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const category = interaction.options.getString('category') || 'general';
        const priority = interaction.options.getString('priority') || 'medium';

        const ticketConfig = await getGuildData('tickets', guildId);

        const existingTicket = ticketConfig.openTickets?.find(t => t.userId === userId);
        if (existingTicket) {
            return interaction.reply({
                content: `You already have an open ticket: <#${existingTicket.channelId}>`,
                ephemeral: true
            });
        }

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: 'I do not have permission to manage channels.',
                ephemeral: true
            });
        }

        let parent = null;
        if (ticketConfig.categoryId) {
            try {
                parent = await interaction.guild.channels.fetch(ticketConfig.categoryId);
            } catch (error) {
            }
        }

        const ticketNumber = (ticketConfig.totalTickets || 0) + 1;
        const sanitizedUsername = interaction.user.username.substring(0, 20);
        const channelName = `${config.tickets.channelPrefix}${ticketNumber}-${sanitizedUsername}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

        const permissionOverwrites = [
            {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            },
            {
                id: interaction.client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels
                ]
            }
        ];

        if (ticketConfig.supportRoleId) {
            permissionOverwrites.push({
                id: ticketConfig.supportRoleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            });
        }

        let ticketChannel;
        try {
            ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: parent?.id || null,
                permissionOverwrites,
                topic: `${getPriorityEmoji(priority)} Ticket #${ticketNumber} | ${category} | ${priority} priority | Created by ${interaction.user.tag}`
            });
        } catch (error) {
            console.error('[ERROR] Failed to create ticket channel:', error);
            return interaction.reply({
                content: 'Failed to create ticket channel. Please contact an administrator.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(getPriorityColor(priority))
            .setTitle(`${getPriorityEmoji(priority)} Ticket #${ticketNumber}`)
            .setDescription(config.tickets.welcomeMessage)
            .addFields(
                { name: 'Created by', value: `${interaction.user}`, inline: true },
                { name: 'Ticket ID', value: `#${ticketNumber}`, inline: true },
                { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
                { name: 'Priority', value: `${getPriorityEmoji(priority)} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, inline: true },
                { name: 'Status', value: 'Open', inline: true },
                { name: 'Assigned to', value: 'Unassigned', inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Use /closeticket to close this ticket' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('claim_ticket')
                    .setLabel('Claim Ticket')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

        await ticketChannel.send({ 
            content: `${interaction.user} ${ticketConfig.supportRoleId ? `<@&${ticketConfig.supportRoleId}>` : ''}`,
            embeds: [embed],
            components: [row]
        });

        const ticketId = generateId();
        await updateGuildData('tickets', guildId, (data) => {
            if (!data.openTickets) {
                data.openTickets = [];
            }
            data.openTickets.push({
                id: ticketId,
                ticketNumber,
                channelId: ticketChannel.id,
                userId,
                reason,
                category,
                priority,
                status: 'open',
                assignedTo: [],
                claimedBy: null,
                firstResponseAt: null,
                participants: [userId],
                tags: [category, priority],
                createdAt: Date.now()
            });
            data.totalTickets = ticketNumber;
            return data;
        });

        return interaction.reply({
            content: `Your ticket has been created: ${ticketChannel}`,
            ephemeral: true
        });
    }
};
