import type { ButtonInteraction, GuildTextBasedChannel } from 'discord.js';
import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getGuildData, updateGuildData, generateId, writeToSubDir } from '../../../utils/db.js';
import { config } from '../../../config/config.js';
// @ts-expect-error - logger not yet migrated
import { logger } from '../../../utils/logger.js';
import { MessageFlags } from 'discord.js';

export default {
    name: 'interactionCreate',
    once: false,

    async execute(interaction: ButtonInteraction, _client: any): Promise<void> {
        if (!interaction.isButton()) { return; }

        const customId = interaction.customId;

        if (customId === 'create_ticket') {
            await handleCreateTicket(interaction);
            return;
        }

        if (customId === 'close_ticket') {
            await handleCloseTicket(interaction);
            return;
        }
    }
};

async function handleCreateTicket(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guild!.id;
    const userId = interaction.user.id;

    const ticketConfig = await getGuildData('tickets', guildId);
    const openTickets = (ticketConfig['openTickets'] as Record<string, unknown>[]) || [];

    const existingTicket = openTickets.find(t => t['userId'] === userId);
    if (existingTicket) {
        return interaction.reply({
            content: `You already have an open ticket: <#${existingTicket['channelId']}>`,
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const botMember = interaction.guild!.members?.me;
    if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
        return interaction.editReply({
            content: 'I do not have permission to manage channels.'
        });
    }

    let parent = null;
    if (ticketConfig['categoryId']) {
        try {
            parent = await interaction.guild!.channels.fetch(ticketConfig['categoryId'] as string);
        } catch {
        }
    }

    const ticketNumber = ((ticketConfig['totalTickets'] as number) || 0) + 1;
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

    let ticketChannel: GuildTextBasedChannel;
    try {
        ticketChannel = await interaction.guild!.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: parent?.id || null,
            permissionOverwrites,
            topic: `Ticket #${ticketNumber} | Created by ${interaction.user.tag}`
        });
    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Failed to create ticket channel:' });
        return interaction.editReply({
            content: 'Failed to create ticket channel. Please contact an administrator.'
        });
    }

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

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
        );

    await ticketChannel.send({
        content: `${interaction.user} ${ticketConfig['supportRoleId'] ? `<@&${ticketConfig['supportRoleId']}>` : ''}`,
        embeds: [embed],
        components: [row]
    });

    const ticketId = generateId();
    await updateGuildData('tickets', guildId, (data: Record<string, unknown>) => {
        const currentOpenTickets = (data['openTickets'] as Record<string, unknown>[]) || [];
        currentOpenTickets.push({
            id: ticketId,
            ticketNumber,
            channelId: ticketChannel.id,
            userId,
            reason: 'Opened via panel',
            createdAt: Date.now()
        });
        data['openTickets'] = currentOpenTickets;
        data['totalTickets'] = ticketNumber;
        return data;
    });

    return interaction.editReply({
        content: `Your ticket has been created: ${ticketChannel}`
    }).catch((err: Error) => logger.warn({ err, msg: '[WARN] Failed to delete message:' }));
}

async function handleCloseTicket(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guild!.id;
    const channelId = interaction.channel!.id;

    const ticketConfig = await getGuildData('tickets', guildId);
    const openTickets = (ticketConfig['openTickets'] as Record<string, unknown>[]) || [];

    const ticketIndex = openTickets.findIndex(t => t['channelId'] === channelId);

    if (ticketIndex === -1) {
        return interaction.reply({
            content: 'This channel is not a ticket channel.',
            flags: MessageFlags.Ephemeral
        });
    }

    const ticket = openTickets[ticketIndex];

    const member = interaction.member;
    const isTicketOwner = ticket['userId'] === interaction.user.id;
    const hasSupport = ticketConfig['supportRoleId'] && member.roles.cache.has(ticketConfig['supportRoleId']);
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isTicketOwner && !hasSupport && !isAdmin) {
        return interaction.reply({
            content: 'You do not have permission to close this ticket.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.reply({
        content: 'Closing ticket and saving transcript...'
    });

    let allMessages: any[] = [];
    let lastMessageId = null;

    try {
        while (true) {
            const options: any = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }

            const messages = await interaction.channel.messages.fetch(options);
            if (messages.size === 0) { break; }

            allMessages = allMessages.concat(Array.from(messages.values()));
            lastMessageId = messages.last()!.id;

            if (allMessages.length >= 1000) { break; }
        }
    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Failed to fetch messages for transcript:' });
    }

    allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const ticketCreator = await interaction.client.users.fetch(ticket['userId'] as string).catch(() => null);

    const transcript = {
        ticketNumber: ticket['ticketNumber'],
        guildId,
        guildName: interaction.guild!.name,
        channelName: interaction.channel!.name,
        createdBy: {
            id: ticket['userId'],
            tag: ticketCreator?.tag || 'Unknown'
        },
        closedBy: {
            id: interaction.user.id,
            tag: interaction.user.tag
        },
        reason: ticket['reason'],
        closeReason: 'Closed via button',
        createdAt: ticket['createdAt'],
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
            attachments: msg.attachments.map((a: any) => ({
                name: a.name,
                url: a.url,
                size: a.size
            })),
            embeds: msg.embeds.length,
            timestamp: msg.createdTimestamp,
            edited: msg.editedTimestamp ? true : false
        }))
    };

    const filename = `ticket-${ticket['ticketNumber']}-${guildId}-${Date.now()}.json`;
    writeToSubDir('transcripts', filename, transcript);

    await updateGuildData('tickets', guildId, (data: Record<string, unknown>) => {
        const currentOpenTickets = (data['openTickets'] as Record<string, unknown>[]) || [];
        currentOpenTickets.splice(ticketIndex, 1);

        const closedTickets = (data['closedTickets'] as Record<string, unknown>[]) || [];
        closedTickets.push({
            ticketNumber: ticket['ticketNumber'],
            userId: ticket['userId'],
            closedBy: interaction.user.id,
            reason: ticket['reason'],
            closeReason: 'Closed via button',
            createdAt: ticket['createdAt'],
            closedAt: Date.now(),
            transcriptFile: filename
        });

        if (closedTickets.length > 100) {
            data['closedTickets'] = closedTickets.slice(-100);
        }

        data['openTickets'] = currentOpenTickets;
        return data;
    });

    try {
        const dmEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('Ticket Closed')
            .setDescription(`Your ticket #${ticket['ticketNumber']} in **${interaction.guild!.name}** has been closed.`)
            .addFields(
                { name: 'Closed by', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();

        await ticketCreator?.send({ embeds: [dmEmbed] });
    } catch {
    }

    setTimeout(async () => {
        try {
            const channel = await interaction.client.channels.fetch(channelId);
            await channel?.delete(`Ticket closed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error({ err: error, msg: '[ERROR] Failed to delete ticket channel:' });
        }
    }, 3000);
}