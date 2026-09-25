import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData, updateGuildData, generateId } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
import { getPriorityColor, getPriorityEmoji } from '../../../utils/slaTracker.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';
import { MessageFlags } from 'discord.js';
import { i18n } from '../../../i18n/index.js';

interface CreateTicketData {
    userId: string;
    channelId?: string;
}

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
                { name: 'Urgent', value: 'urgent' },
                { name: 'High', value: 'high' },
                { name: 'Medium', value: 'medium' },
                { name: 'Low', value: 'low' }
            ]
        }
    ],

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'tickets');

            const guildId = interaction.guild!.id;
            const userId = interaction.user.id;
            const reason = interaction.options.getString('reason') ?? t('ticket.defaultReason');
            const category = interaction.options.getString('category') ?? 'general';
            const priority = interaction.options.getString('priority') ?? 'medium';

            const ticketConfig = await getGuildData('tickets', guildId);

            const openTickets = (ticketConfig['openTickets'] ?? []) as CreateTicketData[];
            const existingTicket = openTickets.find(t => t.userId === userId);
            if (existingTicket) {
                await interaction.reply({
                    content: t('ticket.alreadyOpen', { channelId: existingTicket.channelId }),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (!(interaction.guild!.members.me?.permissions.has(PermissionFlagsBits.ManageChannels) ?? false)) {
                await interaction.reply({
                    content: t('ticket.noManagePermission'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            let parent = null;
            if (ticketConfig['categoryId']) {
                try {
                    parent = await interaction.guild!.channels.fetch(ticketConfig['categoryId'] as string);
                } catch {
                    // ignore
                }
            }

            const ticketNumber = ((ticketConfig['totalTickets'] as number | undefined) ?? 0) + 1;
            const sanitizedUsername = interaction.user.username.substring(0, 20);
            const channelName = `${config.tickets.channelPrefix}${ticketNumber}-${sanitizedUsername}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

            const permissionOverwrites = [
                {
                    id: interaction.guild!.id,
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

            if (ticketConfig['supportRoleId']) {
                permissionOverwrites.push({
                    id: ticketConfig['supportRoleId'] as string,
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
                ticketChannel = await interaction.guild!.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: parent?.id ?? null,
                    permissionOverwrites,
                    topic: `${getPriorityEmoji(priority)} Ticket #${ticketNumber} | ${category} | ${priority} priority | Created by ${interaction.user.tag}`
                });
            } catch (error) {
                logger.error({ msg: '[ERROR] Failed to create ticket channel', err: error });
                await interaction.reply({
                    content: t('ticket.createFailed'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(getPriorityColor(priority))
                .setTitle(`${getPriorityEmoji(priority)} Ticket #${ticketNumber}`)
                .setDescription(config.tickets.welcomeMessage)
                .addFields(
                    { name: t('ticket.fieldCreatedBy'), value: `<@${interaction.user.id}>`, inline: true },
                    { name: t('ticket.fieldTicketId'), value: `#${ticketNumber}`, inline: true },
                    { name: t('ticket.fieldCategory'), value: category.charAt(0).toUpperCase() + category.slice(1), inline: true },
                    { name: t('ticket.fieldPriority'), value: `${getPriorityEmoji(priority)} ${priority.charAt(0).toUpperCase() + priority.slice(1)}`, inline: true },
                    { name: t('ticket.fieldStatus'), value: t('ticket.statusOpen'), inline: true },
                    { name: t('ticket.fieldAssignedTo'), value: t('ticket.unassigned'), inline: true },
                    { name: t('ticket.fieldReason'), value: reason, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: t('ticket.footerCloseHint') });

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('claim_ticket')
                        .setLabel(t('ticket.buttonClaim'))
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel(t('ticket.buttonClose'))
                        .setStyle(ButtonStyle.Danger)
                );

            await ticketChannel.send({
                content: `<@${interaction.user.id}> ${ticketConfig['supportRoleId'] ? `<@&${ticketConfig['supportRoleId'] as string}>` : ''}`,
                embeds: [embed],
                components: [row]
            });

            const ticketId = generateId();
            await updateGuildData('tickets', guildId, (data) => {
                const open = (data['openTickets'] as Record<string, unknown>[] ?? []);
                open.push({
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
                data['openTickets'] = open;
                data['totalTickets'] = ticketNumber;
                return data;
            });

            await interaction.reply({
                content: t('ticket.created', { channelId: ticketChannel.id }),
                flags: MessageFlags.Ephemeral
            });

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