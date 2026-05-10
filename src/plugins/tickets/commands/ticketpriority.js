import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuildData, setGuildData, updateGuildData } from '../../../utils/db.js';
import { getPriorityColor, getPriorityEmoji } from '../../../utils/slaTracker.js';

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
                    { name: '🔴 Urgent', value: 'urgent' },
                    { name: '🟠 High', value: 'high' },
                    { name: '🟡 Medium', value: 'medium' },
                    { name: '🔵 Low', value: 'low' }
                )
        )
        .setDMPermission(false),
    category: 'utility',

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const newPriority = interaction.options.getString('priority');

        const ticketConfig = await getGuildData('tickets', guildId);

        const ticket = ticketConfig.openTickets?.find(t => t.channelId === channelId);

        if (!ticket) {
            return interaction.reply({
                content: 'This channel is not a ticket channel.',
                ephemeral: true
            });
        }

        const member = interaction.member;
        const hasSupport = ticketConfig.supportRoleId && member.roles.cache.has(ticketConfig.supportRoleId);
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasSupport && !isAdmin) {
            return interaction.reply({
                content: 'You do not have permission to change ticket priority.',
                ephemeral: true
            });
        }

        const oldPriority = ticket.priority || 'medium';

        if (oldPriority === newPriority) {
            return interaction.reply({
                content: `This ticket is already set to **${newPriority}** priority.`,
                ephemeral: true
            });
        }

        await updateGuildData('tickets', guildId, (data) => {
            const t = data.openTickets?.find(x => x.channelId === channelId);
            if (t) {
                t.priority = newPriority;
                if (!t.tags) {t.tags = [];}
                t.tags = t.tags.filter(tag => tag !== oldPriority);
                t.tags.push(newPriority);
            }
            return data;
        });

        try {
            const newTopic = `${getPriorityEmoji(newPriority)} Ticket #${ticket.ticketNumber} | ${ticket.category || 'general'} | ${newPriority} priority | Created by ${(await interaction.guild.members.fetch(ticket.userId).catch(() => null))?.user?.tag || 'Unknown'}`;
            await interaction.channel.setTopic(newTopic);
        } catch (error) {
            console.error('[ERROR] Failed to update channel topic:', error);
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

        return interaction.reply({ embeds: [embed] });
    }
};
