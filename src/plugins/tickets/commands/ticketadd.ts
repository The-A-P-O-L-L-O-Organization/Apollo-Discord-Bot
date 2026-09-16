import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';
import { MessageFlags } from 'discord.js';

export default {

    name: 'ticketadd',
    data: new SlashCommandBuilder()
        .setName('ticketadd')
        .setDescription('Add a user to the current ticket')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to add to this ticket')
                .setRequired(true)
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {

            const guildId = interaction.guild!.id;
            const channelId = interaction.channel!.id;
            const addUser = interaction.options.getUser('user', true);

            const ticketConfig = await getGuildData('tickets', guildId);

            const ticket = ticketConfig.openTickets?.find(t => t.channelId === channelId);

            if (!ticket) {
                await interaction.reply({
                    content: 'This channel is not a ticket channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const member = interaction.member;
            const isTicketOwner = ticket.userId === interaction.user.id;
            const isAssigned = ticket.assignedTo?.includes(interaction.user.id);
            const hasSupport = ticketConfig.supportRoleId && member.roles.cache.has(ticketConfig.supportRoleId);
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isTicketOwner && !isAssigned && !hasSupport && !isAdmin) {
                await interaction.reply({
                    content: 'You do not have permission to add users to this ticket.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            ticket.participants ??= [ticket.userId];

            if (ticket.participants.includes(addUser.id)) {
                await interaction.reply({
                    content: `${addUser} is already in this ticket.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await updateGuildData('tickets', guildId, (data) => {
                const t = data.openTickets?.find(x => x.channelId === channelId);
                if (t) {
                    t.participants ??= [t.userId];
                    t.participants.push(addUser.id);
                }
                return data;
            });

            try {
                await interaction.channel!.permissionOverwrites.edit(addUser.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
            } catch (error) {
                logger.error({ msg: '[ERROR] Failed to update channel permissions', err: error });
                await interaction.reply({
                    content: 'Failed to add user to ticket. Please check my permissions.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('User Added to Ticket')
                .setDescription(`${addUser} has been added to this ticket.`)
                .addFields(
                    { name: 'Added by', value: `${interaction.user}`, inline: true },
                    { name: 'User', value: `${addUser}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({
                content: `${addUser}`,
                embeds: [embed]
            });

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('Added to Ticket')
                    .setDescription(`You have been added to ticket #${ticket.ticketNumber} in **${interaction.guild!.name}**.`)
                    .addFields(
                        { name: 'Ticket', value: `<#${channelId}>`, inline: true },
                        { name: 'Added by', value: interaction.user.tag, inline: true }
                    )
                    .setTimestamp();

                await addUser.send({ embeds: [dmEmbed] });
            } catch {
                // Ignore DM failures
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