// Interaction Create Event
// Handles button interactions for tickets and other features

import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData, setGuildData, generateId, writeToSubDir } from '../utils/dataStore.js';
import { config } from '../config/config.js';

export default {
    name: 'interactionCreate',
    once: false,
    
    async execute(interaction, client) {
        // Only handle button interactions
        if (!interaction.isButton()) return;
        
        const customId = interaction.customId;
        
        // Handle ticket creation button
        if (customId === 'create_ticket') {
            await handleCreateTicket(interaction);
            return;
        }
        
        // Handle ticket close button
        if (customId === 'close_ticket') {
            await handleCloseTicket(interaction);
            return;
        }
    }
};

/**
 * Handles the create ticket button interaction
 */
async function handleCreateTicket(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    
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
    
    await interaction.deferReply({ ephemeral: true });
    
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
    const channelName = `${config.tickets.channelPrefix}${ticketNumber}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
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
            topic: `Ticket #${ticketNumber} | Created by ${interaction.user.tag}`
        });
    } catch (error) {
        console.error('[ERROR] Failed to create ticket channel:', error);
        return interaction.editReply({
            content: 'Failed to create ticket channel. Please contact an administrator.'
        });
    }
    
    // Create the ticket embed
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`Ticket #${ticketNumber}`)
        .setDescription(config.tickets.welcomeMessage)
        .addFields(
            { name: 'Created by', value: `${interaction.user}`, inline: true },
            { name: 'Ticket ID', value: `#${ticketNumber}`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Use the button below or /closeticket to close this ticket' });
    
    // Create close button
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
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
        reason: 'Opened via panel',
        createdAt: Date.now()
    });
    ticketConfig.totalTickets = ticketNumber;
    setGuildData('tickets', guildId, ticketConfig);
    
    return interaction.editReply({
        content: `Your ticket has been created: ${ticketChannel}`
    });
}

/**
 * Handles the close ticket button interaction
 */
async function handleCloseTicket(interaction) {
    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;
    
    // Get ticket configuration
    const ticketConfig = getGuildData('tickets', guildId);
    
    // Find the ticket
    const ticketIndex = ticketConfig.openTickets?.findIndex(t => t.channelId === channelId);
    
    if (ticketIndex === -1 || ticketIndex === undefined) {
        return interaction.reply({
            content: 'This channel is not a ticket channel.',
            ephemeral: true
        });
    }
    
    const ticket = ticketConfig.openTickets[ticketIndex];
    
    // Check permissions - ticket creator or support role can close
    const member = interaction.member;
    const isTicketOwner = ticket.userId === interaction.user.id;
    const hasSupport = ticketConfig.supportRoleId && member.roles.cache.has(ticketConfig.supportRoleId);
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    
    if (!isTicketOwner && !hasSupport && !isAdmin) {
        return interaction.reply({
            content: 'You do not have permission to close this ticket.',
            ephemeral: true
        });
    }
    
    await interaction.reply({
        content: 'Closing ticket and saving transcript...'
    });
    
    // Fetch all messages for transcript
    let allMessages = [];
    let lastMessageId = null;
    
    try {
        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }
            
            const messages = await interaction.channel.messages.fetch(options);
            if (messages.size === 0) break;
            
            allMessages = allMessages.concat(Array.from(messages.values()));
            lastMessageId = messages.last().id;
            
            // Safety limit - max 1000 messages
            if (allMessages.length >= 1000) break;
        }
    } catch (error) {
        console.error('[ERROR] Failed to fetch messages for transcript:', error);
    }
    
    // Sort messages by timestamp (oldest first)
    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    // Create transcript data
    const transcript = {
        ticketNumber: ticket.ticketNumber,
        guildId,
        guildName: interaction.guild.name,
        channelName: interaction.channel.name,
        createdBy: {
            id: ticket.userId,
            tag: (await interaction.client.users.fetch(ticket.userId).catch(() => null))?.tag || 'Unknown'
        },
        closedBy: {
            id: interaction.user.id,
            tag: interaction.user.tag
        },
        reason: ticket.reason,
        closeReason: 'Closed via button',
        createdAt: ticket.createdAt,
        closedAt: Date.now(),
        messageCount: allMessages.length,
        messages: allMessages.map(msg => ({
            id: msg.id,
            author: {
                id: msg.author.id,
                tag: msg.author.tag,
                bot: msg.author.bot
            },
            content: msg.content,
            attachments: msg.attachments.map(a => ({
                name: a.name,
                url: a.url,
                size: a.size
            })),
            embeds: msg.embeds.length,
            timestamp: msg.createdTimestamp,
            edited: msg.editedTimestamp ? true : false
        }))
    };
    
    // Save transcript to file
    const filename = `ticket-${ticket.ticketNumber}-${guildId}-${Date.now()}.json`;
    writeToSubDir('transcripts', filename, transcript);
    
    // Remove ticket from open tickets
    ticketConfig.openTickets.splice(ticketIndex, 1);
    
    // Add to closed tickets history
    if (!ticketConfig.closedTickets) {
        ticketConfig.closedTickets = [];
    }
    ticketConfig.closedTickets.push({
        ticketNumber: ticket.ticketNumber,
        userId: ticket.userId,
        closedBy: interaction.user.id,
        reason: ticket.reason,
        closeReason: 'Closed via button',
        createdAt: ticket.createdAt,
        closedAt: Date.now(),
        transcriptFile: filename
    });
    
    // Keep only last 100 closed tickets in memory
    if (ticketConfig.closedTickets.length > 100) {
        ticketConfig.closedTickets = ticketConfig.closedTickets.slice(-100);
    }
    
    setGuildData('tickets', guildId, ticketConfig);
    
    // Try to DM the ticket creator
    try {
        const ticketCreator = await interaction.client.users.fetch(ticket.userId);
        const dmEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('Ticket Closed')
            .setDescription(`Your ticket #${ticket.ticketNumber} in **${interaction.guild.name}** has been closed.`)
            .addFields(
                { name: 'Closed by', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();
        
        await ticketCreator.send({ embeds: [dmEmbed] });
    } catch (error) {
        // User has DMs disabled or couldn't be reached
    }
    
    // Wait a moment then delete the channel
    setTimeout(async () => {
        try {
            await interaction.channel.delete(`Ticket closed by ${interaction.user.tag}`);
        } catch (error) {
            console.error('[ERROR] Failed to delete ticket channel:', error);
        }
    }, 3000);
}
