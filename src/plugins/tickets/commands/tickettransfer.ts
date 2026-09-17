import type { ChatInputCommandInteraction, GuildMember, TextChannel } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';

interface TransferTicketData {
    userId: string;
    channelId?: string;
    ticketNumber?: number;
    category?: string;
    priority?: string;
    assignedTo?: string[];
    claimedBy?: string;
    participants?: string[];
}

export default {
    name: 'tickettransfer',
    data: new SlashCommandBuilder()
        .setName('tickettransfer')
        .setDescription('Transfer the current ticket to another staff member')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The staff member to transfer this ticket to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('Transfer note/reason')
                .setRequired(false)
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const guildId = interaction.guild!.id;
            const channelId = interaction.channel!.id;
            const transferUser = interaction.options.getUser('user')!;
            const note = interaction.options.getString('note') ?? 'No note provided';

            const ticketConfig = await getGuildData('tickets', guildId);
            const openTickets = (ticketConfig['openTickets'] ?? []) as TransferTicketData[];
            const ticket = openTickets.find(t => t.channelId === channelId);

            if (!ticket) {
                await interaction.reply({
                    content: 'This channel is not a ticket channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const member = interaction.member as GuildMember;
            const isAssigned = ticket.assignedTo?.includes(interaction.user.id) ?? false;
            const isClaimed = ticket.claimedBy === interaction.user.id;
            const hasSupport = ticketConfig['supportRoleId'] && member.roles.cache.has(ticketConfig['supportRoleId'] as string);
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isAssigned && !isClaimed && !hasSupport && !isAdmin) {
                await interaction.reply({
                    content: 'You do not have permission to transfer this ticket.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (transferUser.id === interaction.user.id) {
                await interaction.reply({
                    content: 'You cannot transfer a ticket to yourself.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const oldAssignees = [...(ticket.assignedTo ?? [])];

            await updateGuildData('tickets', guildId, (data: Record<string, unknown>) => {
                const openTicketsLocal = (data['openTickets'] as TransferTicketData[] ?? []);
                const t = openTicketsLocal.find(x => x.channelId === channelId);
                if (t) {
                    t.assignedTo = [transferUser.id];
                    t.claimedBy = transferUser.id;
                    t.participants ??= [t.userId];
                    if (!t.participants.includes(transferUser.id)) {
                        t.participants.push(transferUser.id);
                    }
                }
                data['openTickets'] = openTicketsLocal;
                return data;
            });

            try {
                await (interaction.channel as TextChannel).permissionOverwrites.edit(transferUser.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
            } catch (error) {
                logger.error({ err: error, msg: '[ERROR] Failed to update channel permissions:' });
            }

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('Ticket Transferred')
                .setDescription(`This ticket has been transferred to ${transferUser}.`)
                .addFields(
                    { name: 'Transferred by', value: `${interaction.user}`, inline: true },
                    { name: 'New assignee', value: `${transferUser}`, inline: true },
                    { name: 'Note', value: note, inline: false }
                )
                .setTimestamp();

            await interaction.reply({
                content: `${transferUser}`,
                embeds: [embed]
            });

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('Ticket Transferred to You')
                    .setDescription(`Ticket #${ticket.ticketNumber} in **${interaction.guild!.name}** has been transferred to you.`)
                    .addFields(
                        { name: 'Ticket', value: `<#${channelId}>`, inline: true },
                        { name: 'From', value: interaction.user.tag, inline: true },
                        { name: 'Category', value: ticket.category ?? 'general', inline: true },
                        { name: 'Priority', value: ticket.priority ?? 'medium', inline: true },
                        { name: 'Note', value: note, inline: false }
                    )
                    .setTimestamp();

                await transferUser.send({ embeds: [dmEmbed] });
            } catch {
            }

            for (const oldAssigneeId of oldAssignees) {
                if (oldAssigneeId === transferUser.id) { continue; }

                try {
                    const oldAssignee = await interaction.client.users.fetch(oldAssigneeId);
                    const dmEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('Ticket Transferred')
                        .setDescription(`Ticket #${ticket.ticketNumber} in **${interaction.guild!.name}** has been transferred to ${transferUser.tag}.`)
                        .addFields(
                            { name: 'Transferred by', value: interaction.user.tag, inline: true },
                            { name: 'Note', value: note, inline: false }
                        )
                        .setTimestamp();

                    await oldAssignee.send({ embeds: [dmEmbed] });
                } catch {
                }
            }
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