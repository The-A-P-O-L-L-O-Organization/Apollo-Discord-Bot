// Ticket Command
// Allows users to create a ticket or manage their tickets

import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData, setGuildData, generateId } from '../utils/db.js';
import { config } from '../config/config.js';
import { getPriorityColor, getPriorityEmoji } from '../utils/slaTracker.js';

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
            type: 3, // STRING type
            required: false
        },
        {
            name: 'category',
            description: 'Category of the ticket',
            type: 3, // STRING type
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
            type: 3, // STRING type
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

        // Get ticket configuration
        const ticketConfig = getGuildData('tickets', guildId);

        // Check if user already has an open ticket
        const existingTicket = ticketConfig.openTickets?.find(t => t.userId === userId);
        if (existingTicket) {
            return interaction.reply({
                content: `You already have an open ticket: <#${existingTicket.channelId}>`,
                ephemeral: true
            });
        }

        // Check if bot has permission to manage channels
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: 'I do not have permission to manage channels.',
                ephemeral: true
            });
        }

        // Determine where to create the ticket channel
        let parent = null;
        if (ticketConfig.categoryId) {
            try {
                parent = await interaction.guild.channels.fetch(ticketConfig.categoryId);
            } catch (error) {
                // Category doesn't exist, create in no category
            }
        }

        // Generate ticket number
        const ticketNumber = (ticketConfig.totalTickets || 0) + 1;
        const sanitizedUsername = interaction.user.username.substring(0, 20);
        const channelName = `${config.tickets.channelPrefix}${ticketNumber}-${sanitizedUsername}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

        // Create permission overwrites
        const permissionOverwrites = [
            {
                id: interaction.guild.id, // @everyone
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: userId, // Ticket creator
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            },
            {
                id: interaction.client.user.id, // Bot
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels
                ]
            }
        ];

        // Add support role if configured
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

        // Create the ticket channel
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

        // Create the ticket embed
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

        // Create buttons (claim and close)
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

        // Send the welcome message
        await ticketChannel.send({ 
            content: `${interaction.user} ${ticketConfig.supportRoleId ? `<@&${ticketConfig.supportRoleId}>` : ''}`,
            embeds: [embed],
            components: [row]
        });

        // Save ticket data
        const ticketId = generateId();
        if (!ticketConfig.openTickets) {
            ticketConfig.openTickets = [];
        }
        ticketConfig.openTickets.push({
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
        ticketConfig.totalTickets = ticketNumber;
        setGuildData('tickets', guildId, ticketConfig);

        return interaction.reply({
            content: `Your ticket has been created: ${ticketChannel}`,
            ephemeral: true
        });
    }
};
