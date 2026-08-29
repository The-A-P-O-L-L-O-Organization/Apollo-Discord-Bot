import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';
import { getPriorityEmoji, formatTime, hasBreachedSLA } from '../../../utils/slaTracker.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'ticketlist',
    data: new SlashCommandBuilder()
        .setName('ticketlist')
        .setDescription('List open tickets with optional filters')
        .addStringOption(option =>
            option
                .setName('filter')
                .setDescription('Filter tickets by status')
                .setRequired(false)
                .addChoices(
                    { name: 'Open (All)', value: 'all' },
                    { name: 'Unassigned', value: 'unassigned' },
                    { name: 'Assigned to Me', value: 'mine' },
                    { name: 'SLA Breached', value: 'breached' }
                )
        )
        .addStringOption(option =>
            option
                .setName('priority')
                .setDescription('Filter by priority')
                .setRequired(false)
                .addChoices(
                    { name: '🔴 Urgent', value: 'urgent' },
                    { name: '🟠 High', value: 'high' },
                    { name: '🟡 Medium', value: 'medium' },
                    { name: '🔵 Low', value: 'low' }
                )
        )
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('Filter by category')
                .setRequired(false)
                .addChoices(
                    { name: 'Technical Support', value: 'technical' },
                    { name: 'Billing', value: 'billing' },
                    { name: 'General', value: 'general' },
                    { name: 'Report', value: 'report' },
                    { name: 'Other', value: 'other' }
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = interaction.guild.id;
            const filter = interaction.options.getString('filter') || 'all';
            const priorityFilter = interaction.options.getString('priority');
            const categoryFilter = interaction.options.getString('category');

            const ticketConfig = await getGuildData('tickets', guildId);
            let tickets = ticketConfig.openTickets || [];

            if (tickets.length === 0) {
                return interaction.editReply({
                    content: 'There are no open tickets at the moment.'
                });
            }

            if (filter === 'unassigned') {
                tickets = tickets.filter(t => !t.assignedTo || t.assignedTo.length === 0);
            } else if (filter === 'mine') {
                tickets = tickets.filter(t => 
                    t.assignedTo?.includes(interaction.user.id) || t.claimedBy === interaction.user.id
                );
            } else if (filter === 'breached') {
                const slaThresholds = ticketConfig.slaThresholds;
                tickets = tickets.filter(t => hasBreachedSLA(t, slaThresholds));
            }

            if (priorityFilter) {
                tickets = tickets.filter(t => t.priority === priorityFilter);
            }

            if (categoryFilter) {
                tickets = tickets.filter(t => t.category === categoryFilter);
            }

            if (tickets.length === 0) {
                return interaction.editReply({
                    content: 'No tickets match your filter criteria.'
                });
            }

            const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
            tickets.sort((a, b) => {
                const priorityA = priorityOrder[a.priority || 'medium'];
                const priorityB = priorityOrder[b.priority || 'medium'];
                if (priorityA !== priorityB) {return priorityA - priorityB;}
                return a.createdAt - b.createdAt;
            });

            const pageSize = 10;
            const totalPages = Math.ceil(tickets.length / pageSize);
            let currentPage = 0;

            const generateEmbed = (page) => {
                const start = page * pageSize;
                const end = start + pageSize;
                const pageTickets = tickets.slice(start, end);

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(' Open Tickets')
                    .setDescription(`Showing **${tickets.length}** ticket(s) | Page ${page + 1} of ${totalPages}`)
                    .setTimestamp();

                pageTickets.forEach(ticket => {
                    const priority = ticket.priority || 'medium';
                    const emoji = getPriorityEmoji(priority);
                    const category = ticket.category || 'general';

                    const value = [
                        `Priority: ${emoji} ${priority}`,
                        `Category: ${category}`,
                        `Created: <t:${Math.floor(ticket.createdAt / 1000)}:R>`
                    ];

                    if (ticket.claimedBy) {
                        value.push(`Claimed by: <@${ticket.claimedBy}>`);
                    } else if (ticket.assignedTo && ticket.assignedTo.length > 0) {
                        value.push(`Assigned: ${ticket.assignedTo.length} staff`);
                    } else {
                        value.push('Status: [WARNING] Unassigned');
                    }

                    if (!ticket.firstResponseAt) {
                        const waitingTime = Date.now() - ticket.createdAt;
                        value.push(`Waiting: ${formatTime(waitingTime)}`);

                        if (hasBreachedSLA(ticket, ticketConfig.slaThresholds)) {
                            value.push('🚨 **SLA BREACHED**');
                        }
                    }

                    if (ticket.channelId) {
                        value.push(`Channel: <#${ticket.channelId}>`);
                    }

                    embed.addFields({
                        name: `Ticket #${ticket.ticketNumber}`,
                        value: value.join('\n'),
                        inline: false
                    });
                });

                return embed;
            };

            const generateButtons = (page) => {
                const row = new ActionRowBuilder();

                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('list_first')
                        .setLabel('First First')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('list_prev')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('list_next')
                        .setLabel('Next Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('list_last')
                        .setLabel('Last Last')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );

                return row;
            };

            const message = await interaction.editReply({
                embeds: [generateEmbed(currentPage)],
                components: totalPages > 1 ? [generateButtons(currentPage)] : []
            });

            if (totalPages > 1) {
                const collector = message.createMessageComponentCollector({
                    time: 300000
                });

                collector.on('collect', async(i) => {
                    if (i.user.id !== interaction.user.id) {
                        return i.reply({
                            content: 'These buttons are not for you!',
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (i.customId === 'list_first') {
                        currentPage = 0;
                    } else if (i.customId === 'list_prev') {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (i.customId === 'list_next') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    } else if (i.customId === 'list_last') {
                        currentPage = totalPages - 1;
                    }

                    await i.update({
                        embeds: [generateEmbed(currentPage)],
                        components: [generateButtons(currentPage)]
                    });
                });

                collector.on('end', () => {
                    message.edit({ components: [] }).catch(() => {});
                });
            }
        } catch (error) {
            const errorMessage = handleDiscordError(error);
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};