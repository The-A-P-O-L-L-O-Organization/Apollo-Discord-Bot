import type { ChatInputCommandInteraction, GuildMember, TextChannel } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';
import { MessageFlags } from 'discord.js';
import { i18n } from '../../../i18n/index.js';

interface AssignTicketData {
    userId: string;
    channelId?: string;
    ticketNumber?: number;
    category?: string;
    assignedTo?: string[];
    participants?: string[];
}

export default {
    name: 'assign',
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign the current ticket to a staff member')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The staff member to assign this ticket to')
                .setRequired(true)
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
            const assignUser = interaction.options.getUser('user', true);

            const ticketConfig = await getGuildData('tickets', guildId);

            const openTickets = (ticketConfig['openTickets'] ?? []) as AssignTicketData[];
            const ticket = openTickets.find(t => t.channelId === channelId);

            if (!ticket) {
                await interaction.reply({
                    content: t('assign.notTicket'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const member = interaction.member as GuildMember;
            const hasSupport = ticketConfig['supportRoleId'] && member.roles.cache.has(ticketConfig['supportRoleId'] as string);
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasSupport && !isAdmin) {
                await interaction.reply({
                    content: t('assign.noPermission'),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            ticket.assignedTo ??= [];

            if (ticket.assignedTo.includes(assignUser.id)) {
                await interaction.reply({
                    content: t('assign.alreadyAssigned', { user: assignUser.id }),
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await updateGuildData('tickets', guildId, (data) => {
                const open = (data['openTickets'] as AssignTicketData[] ?? []);
                const t = open.find(x => x.channelId === channelId);
                if (t) {
                    t.assignedTo ??= [];
                    t.assignedTo.push(assignUser.id);
                    t.participants ??= [t.userId];
                    if (!t.participants.includes(assignUser.id)) {
                        t.participants.push(assignUser.id);
                    }
                }
                data['openTickets'] = open;
                return data;
            });

            try {
                await (interaction.channel as TextChannel).permissionOverwrites.edit(assignUser.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });
            } catch (error) {
                logger.error({ msg: '[ERROR] Failed to update channel permissions', err: error });
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle(t('assign.title'))
                .setDescription(t('assign.description', { user: assignUser.id }))
                .addFields(
                    { name: t('assign.fieldAssignedBy'), value: `<@${interaction.user.id}>`, inline: true },
                    { name: t('assign.fieldAssignedTo'), value: `<@${assignUser.id}>`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({
                content: `<@${assignUser.id}>`,
                embeds: [embed]
            });

            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(t('assign.dmTitle'))
                    .setDescription(t('assign.dmDescription', { number: ticket.ticketNumber, guild: interaction.guild!.name }))
                    .addFields(
                        { name: t('assign.dmFieldTicket'), value: `<#${channelId}>`, inline: true },
                        { name: t('assign.dmFieldCategory'), value: ticket.category ?? 'general', inline: true }
                    )
                    .setTimestamp();

                await assignUser.send({ embeds: [dmEmbed] });
            } catch {
                // Ignore DM failures
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