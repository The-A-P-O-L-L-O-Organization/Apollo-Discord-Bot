// Close Ticket Command
// Closes a ticket, saves the transcript, and deletes the channel

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData, writeToSubDir } from '../utils/dataStore.js';

export default {
    data: new SlashCommandBuilder()
        .setName('closeticket')
        .setDescription('Close the current ticket')
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for closing the ticket')
                .setRequired(false)
        ),
    category: 'utility',

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const reason = interaction.options.getString('reason') || 'No reason provided';

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
            content: 'Closing ticket and saving transcript...',
            ephemeral: false
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
            closeReason: reason,
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
        
        // Add to closed tickets history (keep last 100)
        if (!ticketConfig.closedTickets) {
            ticketConfig.closedTickets = [];
        }
        ticketConfig.closedTickets.push({
            ticketNumber: ticket.ticketNumber,
            userId: ticket.userId,
            closedBy: interaction.user.id,
            reason: ticket.reason,
            closeReason: reason,
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
                    { name: 'Closed by', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason, inline: true }
                )
                .setTimestamp();
            
            await ticketCreator.send({ embeds: [dmEmbed] });
        } catch (error) {
            // User has DMs disabled or couldn't be reached
        }

        // Wait a moment then delete the channel
        setTimeout(async () => {
            try {
                await interaction.channel.delete(`Ticket closed by ${interaction.user.tag}: ${reason}`);
            } catch (error) {
                console.error('[ERROR] Failed to delete ticket channel:', error);
            }
        }, 3000);
    }
};
