import type { ChatInputCommandInteraction, GuildMember, TextChannel } from 'discord.js';
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { getPriorityColor, getPriorityEmoji } from '../../../utils/slaTracker.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { logger } from '../../../utils/logger.js';

interface PriorityTicketData {
    userId: string;
    channelId?: string;
    ticketNumber?: number;
    priority?: string;
    category?: string;
    tags?: string[];
}

export default {
    name: 'ticketpriority',
    data: new SlashCommandBuilder()
        .setName('ticketpriority')
        .setDescription('Change the priority of the current ticket')
        .addStringOption(option =>
            option
                .setName('priority')
                .setDescription('New priority level')
                .setRequired(true)
                .addChoices(
                    { name: 'Urgent', value: 'urgent' },
                    { name: 'High', value: 'high' },
                    { name: 'Medium', value: 'medium' },
                    { name: 'Low', value: 'low' }
                )
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const guildId = interaction.guild!.id;
            const channelId = interaction.channel!.id;
            const newPriority = interaction.options.getString('priority')!;

            const ticketConfig = await getGuildData('tickets', guildId);

            const openTickets = (ticketConfig['openTickets'] ?? []) as PriorityTicketData[];
            const ticket = openTickets.find(t => t.channelId === channelId);

            if (!ticket) {
                await interaction.reply({
                    content: 'This channel is not a ticket channel.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const member = interaction.member as GuildMember;
            const hasSupport = ticketConfig['supportRoleId'] && member.roles.cache.has(ticketConfig['supportRoleId'] as string);
            const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            if (!hasSupport && !isAdmin) {
                await interaction.reply({
                    content: 'You do not have permission to change ticket priority.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const oldPriority = ticket.priority ?? 'medium';

            if (oldPriority === newPriority) {
                await interaction.reply({
                    content: `This ticket is already set to **${newPriority}** priority.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await updateGuildData('tickets', guildId, (data) => {
                const open = (data['openTickets'] as PriorityTicketData[] ?? []);
                const t = open.find(x => x.channelId === channelId);
                if (t) {
                    t.priority = newPriority;
                    t.tags ??= [];
                    t.tags = t.tags.filter(tag => tag !== oldPriority);
                    t.tags.push(newPriority);
                }
                data['openTickets'] = open;
                return data;
            });

            try {
                const memberUser = await interaction.guild!.members.fetch(ticket.userId).catch(() => null);
                const newTopic = `${getPriorityEmoji(newPriority)} Ticket #${ticket.ticketNumber} | ${ticket.category ?? 'general'} | ${newPriority} priority | Created by ${memberUser?.user?.tag ?? 'Unknown'}`;
                await (interaction.channel as TextChannel).setTopic(newTopic);
            } catch (error) {
                logger.error({ err: error, msg: '[ERROR] Failed to update channel topic:' });
            }

            const embed = new EmbedBuilder()
                .setColor(getPriorityColor(newPriority))
                .setTitle('Ticket Priority Updated')
                .setDescription(`Priority changed from **${getPriorityEmoji(oldPriority)} ${oldPriority.toUpperCase()}** to **${getPriorityEmoji(newPriority)} ${newPriority.toUpperCase()}**`)
                .addFields(
                    { name: 'Updated by', value: `${interaction.user}`, inline: true },
                    { name: 'New Priority', value: `${getPriorityEmoji(newPriority)} ${newPriority.charAt(0).toUpperCase() + newPriority.slice(1)}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
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