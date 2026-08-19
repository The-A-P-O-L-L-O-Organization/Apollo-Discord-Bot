import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { saveTranscripts } from '../../../utils/transcriptGenerator.js';
import { clearSlaAlert } from '../../../plugins/tickets/events/slaMonitor.js';

export default {
    name: 'closeticket',
    data: new SlashCommandBuilder()
        .setName('closeticket')
        .setDescription('Close the current ticket')
        .setDMPermission(false)
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

        const ticketConfig = await getGuildData('tickets', guildId);

        const ticketIndex = ticketConfig.openTickets?.findIndex(t => t.channelId === channelId);
        
        if (ticketIndex === -1 || ticketIndex === undefined) {
            return interaction.reply({
                content: 'This channel is not a ticket channel.',
                ephemeral: true
            });
        }

        const ticket = ticketConfig.openTickets[ticketIndex];

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

        // Fetch messages with cursor-based pagination to avoid rate limits
        let allMessages = [];
        let lastMessageId = null;
        const MAX_MESSAGES = 1000;
        const FETCH_DELAY_MS = 100; // Delay between fetches to avoid rate limits
        
        try {
            while (allMessages.length < MAX_MESSAGES) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }
                
                const messages = await interaction.channel.messages.fetch(options);
                if (messages.size === 0) {break;}
                
                allMessages = allMessages.concat(Array.from(messages.values()));
                lastMessageId = messages.last().id;
                
                // Small delay to avoid hitting rate limits
                if (messages.size === 100) {
                    await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));
                }
            }
        } catch (error) {
            console.error('[ERROR] Failed to fetch messages for transcript:', error);
        }

        allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        const ticketCreator = await interaction.client.users.fetch(ticket.userId).catch(() => null);
        
        const transcript = {
            ticketNumber: ticket.ticketNumber,
            guildId,
            guildName: interaction.guild.name,
            channelName: interaction.channel.name,
            createdBy: {
                id: ticket.userId,
                tag: ticketCreator?.tag || 'Unknown'
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
            priority: ticket.priority || 'medium',
            category: ticket.category || 'general',
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

        // Save both HTML and text transcripts
        const { htmlFile, textFile } = await saveTranscripts(transcript);

        await updateGuildData('tickets', guildId, (data) => {
            data.openTickets.splice(ticketIndex, 1);
            
            if (!data.closedTickets) {
                data.closedTickets = [];
            }
            data.closedTickets.push({
                ticketNumber: ticket.ticketNumber,
                userId: ticket.userId,
                closedBy: interaction.user.id,
                reason: ticket.reason,
                closeReason: reason,
                createdAt: ticket.createdAt,
                closedAt: Date.now(),
                transcriptFile: htmlFile,
                transcriptTextFile: textFile
            });
            
            if (data.closedTickets.length > 100) {
                data.closedTickets = data.closedTickets.slice(-100);
            }
            
            return data;
        });

        // Clear SLA alert for this ticket
        clearSlaAlert(guildId, ticket.id);

        try {
            if (ticketCreator) {
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
            }
        } catch (error) {
            console.error('[ERROR] Failed to DM ticket creator:', error);
        }

        setTimeout(async() => {
            try {
                const channel = await interaction.client.channels.fetch(channelId);
                await channel.delete(`Ticket closed by ${interaction.user.tag}: ${reason}`);
            } catch (error) {
                console.error('[ERROR] Failed to delete ticket channel:', error);
            }
        }, 3000);
    }
};