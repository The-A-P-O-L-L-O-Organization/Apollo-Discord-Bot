import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';
import { formatTime, getPriorityEmoji } from '../../../utils/slaTracker.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'ticketsearch',
    data: new SlashCommandBuilder()
        .setName('ticketsearch')
        .setDescription('Search ticket archive')
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Search tickets by user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to search for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('category')
                .setDescription('Search tickets by category')
                .addStringOption(option =>
                    option
                        .setName('category')
                        .setDescription('Category to search for')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Technical Support', value: 'technical' },
                            { name: 'Billing', value: 'billing' },
                            { name: 'General', value: 'general' },
                            { name: 'Report', value: 'report' },
                            { name: 'Other', value: 'other' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('assigned')
                .setDescription('Search tickets by assigned staff')
                .addUserOption(option =>
                    option
                        .setName('staff')
                        .setDescription('Staff member to search for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('priority')
                .setDescription('Search tickets by priority')
                .addStringOption(option =>
                    option
                        .setName('priority')
                        .setDescription('Priority to search for')
                        .setRequired(true)
                        .addChoices(
                            { name: '🔴 Urgent', value: 'urgent' },
                            { name: '🟠 High', value: 'high' },
                            { name: '🟡 Medium', value: 'medium' },
                            { name: '🔵 Low', value: 'low' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('number')
                .setDescription('Search for a specific ticket by number')
                .addIntegerOption(option =>
                    option
                        .setName('number')
                        .setDescription('Ticket number')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = interaction.guild.id;
            const subcommand = interaction.options.getSubcommand();
            const ticketConfig = await getGuildData('tickets', guildId);
            const allTickets = [
                ...(ticketConfig.openTickets || []),
                ...(ticketConfig.closedTickets || [])
            ];

            let results = [];

            if (subcommand === 'user') {
                const user = interaction.options.getUser('user');
                results = allTickets.filter(t => t.userId === user.id);
            } else if (subcommand === 'category') {
                const category = interaction.options.getString('category');
                results = allTickets.filter(t => t.category === category);
            } else if (subcommand === 'assigned') {
                const staff = interaction.options.getUser('staff');
                results = allTickets.filter(t => 
                    t.assignedTo?.includes(staff.id) || t.claimedBy === staff.id
                );
            } else if (subcommand === 'priority') {
                const priority = interaction.options.getString('priority');
                results = allTickets.filter(t => t.priority === priority);
            } else if (subcommand === 'number') {
                const number = interaction.options.getInteger('number');
                results = allTickets.filter(t => t.ticketNumber === number);
            }

            if (results.length === 0) {
                return interaction.editReply({
                    content: 'No tickets found matching your search criteria.'
                });
            }

            results.sort((a, b) => b.createdAt - a.createdAt);

            const pageSize = 10;
            const totalPages = Math.ceil(results.length / pageSize);
            let currentPage = 0;

            const generateEmbed = (page) => {
                const start = page * pageSize;
                const end = start + pageSize;
                const pageResults = results.slice(start, end);

                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('Search Ticket Search Results')
                    .setDescription(`Found **${results.length}** ticket(s) matching your search.\nPage ${page + 1} of ${totalPages}`)
                    .setTimestamp();

                pageResults.forEach(ticket => {
                    const status = ticket.closedAt ? '🔒 Closed' : '🔓 Open';
                    const priority = ticket.priority || 'medium';
                    const emoji = getPriorityEmoji(priority);
                    
                    const value = [
                        `Status: ${status}`,
                        `Priority: ${emoji} ${priority}`,
                        `Category: ${ticket.category || 'general'}`,
                        `Created: <t:${Math.floor(ticket.createdAt / 1000)}:R>`
                    ];

                    if (ticket.closedAt) {
                        value.push(`Closed: <t:${Math.floor(ticket.closedAt / 1000)}:R>`);
                        
                        if (ticket.firstResponseAt) {
                            const responseTime = ticket.firstResponseAt - ticket.createdAt;
                            value.push(`Response Time: ${formatTime(responseTime)}`);
                        }
                        
                        if (ticket.rating) {
                            value.push(`Rating: ${'★'.repeat(ticket.rating)}`);
                        }
                    }

                    if (ticket.assignedTo && ticket.assignedTo.length > 0) {
                        value.push(`Assigned: ${ticket.assignedTo.length} staff member(s)`);
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
                        .setCustomId('search_first')
                        .setLabel('First First')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('search_prev')
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('search_next')
                        .setLabel('Next Next')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === totalPages - 1),
                    new ButtonBuilder()
                        .setCustomId('search_last')
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

                    if (i.customId === 'search_first') {
                        currentPage = 0;
                    } else if (i.customId === 'search_prev') {
                        currentPage = Math.max(0, currentPage - 1);
                    } else if (i.customId === 'search_next') {
                        currentPage = Math.min(totalPages - 1, currentPage + 1);
                    } else if (i.customId === 'search_last') {
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