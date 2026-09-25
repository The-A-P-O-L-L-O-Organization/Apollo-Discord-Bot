import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getGuildData } from '../../../utils/db.js';
import { formatTime, getPriorityColor, getPriorityEmoji } from '../../../utils/slaTracker.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';
import { i18n } from '../../../i18n/index.js';

interface TicketInfoData {
    userId: string;
    ticketNumber?: number;
    channelId?: string;
    priority?: string;
    category?: string;
    status?: string;
    closedAt?: number;
    createdAt: number;
    reason?: string;
    claimedBy?: string;
    assignedTo?: string[];
    participants?: string[];
    firstResponseAt?: number;
    closedBy?: string;
    closeReason?: string;
    rating?: number;
    ratingFeedback?: string;
    tags?: string[];
}

export default {
    name: 'ticketinfo',
    data: new SlashCommandBuilder()
        .setName('ticketinfo')
        .setDescription('View detailed information about the current ticket or a specific ticket')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('Ticket number to view (defaults to current ticket)')
                .setRequired(false)
                .setMinValue(1)
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'tickets');

            const guildId = interaction.guild!.id;
            const channelId = interaction.channel!.id;
            const ticketNumber = interaction.options.getInteger('number');

            const ticketConfig = await getGuildData('tickets', guildId);
            const openTickets = (ticketConfig['openTickets'] ?? []) as TicketInfoData[];
            const closedTickets = (ticketConfig['closedTickets'] ?? []) as TicketInfoData[];
            let ticket: TicketInfoData | undefined;

            if (ticketNumber) {
                ticket = openTickets.find(t => t.ticketNumber === ticketNumber) ??
                    closedTickets.find(t => t.ticketNumber === ticketNumber);
            } else {
                ticket = openTickets.find(t => t.channelId === channelId);
            }

            if (!ticket) {
                await interaction.reply({
                    content: ticketNumber
                        ? t('ticketinfo.notFound', { number: ticketNumber })
                        : t('ticketinfo.notTicket'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const priority = ticket.priority ?? 'medium';
            const category = ticket.category ?? 'general';
            const status = ticket.closedAt ? t('ticketinfo.statusClosed') : ticket.status ?? 'open';

            const embed = new EmbedBuilder()
                .setColor(getPriorityColor(priority))
                .setTitle(`${getPriorityEmoji(priority)} ${t('ticketinfo.title', { number: ticket.ticketNumber })}`)
                .setTimestamp();

            const creatorUser = await interaction.client.users.fetch(ticket.userId).catch(() => null);
            embed.addFields(
                { name: t('ticketinfo.fieldCreator'), value: creatorUser ? `<@${creatorUser.id}> (${creatorUser.tag})` : `<@${ticket.userId}>`, inline: true },
                { name: t('ticketinfo.fieldStatus'), value: status.charAt(0).toUpperCase() + status.slice(1), inline: true },
                { name: t('ticketinfo.fieldPriority'), value: `${getPriorityEmoji(priority)} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, inline: true },
                { name: t('ticketinfo.fieldCategory'), value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
                { name: t('ticketinfo.fieldCreated'), value: `<t:${Math.floor(ticket.createdAt / 1000)}:F>`, inline: true }
            );

            if (ticket.channelId) {
                embed.addFields({ name: t('ticketinfo.fieldChannel'), value: `<#${ticket.channelId}>`, inline: true });
            }

            if (ticket.reason) {
                embed.addFields({ name: t('ticketinfo.fieldReason'), value: ticket.reason, inline: false });
            }

            if (ticket.claimedBy) {
                const claimedUser = await interaction.client.users.fetch(ticket.claimedBy).catch(() => null);
                embed.addFields({
                    name: t('ticketinfo.fieldClaimedBy'),
                    value: claimedUser ? `<@${claimedUser.id}> (${claimedUser.tag})` : `<@${ticket.claimedBy}>`,
                    inline: true
                });
            }

            if (ticket.assignedTo && ticket.assignedTo.length > 0) {
                const assignedUsers = await Promise.all(
                    ticket.assignedTo.map(id => interaction.client.users.fetch(id).catch(() => null))
                );
                const assignedList = assignedUsers
                    .filter(u => u)
                    .map(u => u!.tag)
                    .join(', ') ?? 'Unknown';

                embed.addFields({
                    name: t('ticketinfo.fieldAssignedStaff', { count: ticket.assignedTo.length }),
                    value: assignedList,
                    inline: false
                });
            } else {
                embed.addFields({ name: t('ticketinfo.fieldAssignedStaffNone'), value: t('ticketinfo.fieldUnassigned'), inline: true });
            }

            if (ticket.participants && ticket.participants.length > 1) {
                embed.addFields({
                    name: t('ticketinfo.fieldParticipants'),
                    value: t('ticketinfo.fieldParticipantsValue', { count: ticket.participants.length }),
                    inline: true
                });
            }

            if (ticket.firstResponseAt) {
                const responseTime = ticket.firstResponseAt - ticket.createdAt;
                embed.addFields({
                    name: t('ticketinfo.fieldFirstResponse'),
                    value: formatTime(responseTime),
                    inline: true
                });
            } else if (!ticket.closedAt) {
                const waitingTime = Date.now() - ticket.createdAt;
                embed.addFields({
                    name: t('ticketinfo.fieldWaitingResponse'),
                    value: formatTime(waitingTime),
                    inline: true
                });
            }

            if (ticket.closedAt) {
                embed.addFields({
                    name: t('ticketinfo.fieldClosed'),
                    value: `<t:${Math.floor(ticket.closedAt / 1000)}:F>`,
                    inline: true
                });

                const resolutionTime = ticket.closedAt - ticket.createdAt;
                embed.addFields({
                    name: t('ticketinfo.fieldResolutionTime'),
                    value: formatTime(resolutionTime),
                    inline: true
                });

                if (ticket.closedBy) {
                    const closedByUser = await interaction.client.users.fetch(ticket.closedBy).catch(() => null);
                    embed.addFields({
                        name: t('ticketinfo.fieldClosedBy'),
                        value: closedByUser ? closedByUser.tag : `<@${ticket.closedBy}>`,
                        inline: true
                    });
                }

                if (ticket.closeReason) {
                    embed.addFields({ name: t('ticketinfo.fieldCloseReason'), value: ticket.closeReason, inline: false });
                }

                if (ticket.rating) {
                    const stars = '★'.repeat(ticket.rating);
                    embed.addFields({
                        name: t('ticketinfo.fieldRating'),
                        value: `${stars} (${ticket.rating}/5)`,
                        inline: true
                    });

                    if (ticket.ratingFeedback) {
                        embed.addFields({
                            name: t('ticketinfo.fieldFeedback'),
                            value: ticket.ratingFeedback,
                            inline: false
                        });
                    }
                }
            }

            if (ticket.tags && ticket.tags.length > 0) {
                embed.addFields({
                    name: t('ticketinfo.fieldTags'),
                    value: ticket.tags.map(tag => `\`${tag}\``).join(', '),
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } catch (error) {
            const errorMessage = handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};