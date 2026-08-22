import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getAllGuildData, setGuildData, getUserData, setUserData } from '../../../utils/db.js';
import { logSecurityEvent } from '../../../utils/securityLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

const GUILD_ARRAY_STORES = {
    warnings: { key: 'warnings', match: (item, userId) => item.userId === userId },
    strikes: { key: 'strikes', match: (item, userId) => item.userId === userId },
    notes: { key: 'notes', match: (item, userId) => item.userId === userId },
    reminders: { key: 'reminders', match: (item, userId) => item.userId === userId },
    polls: { key: 'polls', match: (item, userId) => item.creatorId === userId },
    giveaways: { key: 'giveaways', match: (item, userId) => item.creatorId === userId },
    tags: { key: 'tags', match: (item, userId) => item.ownerId === userId }
};

const TICKET_KEYS = ['openTickets', 'closedTickets'];

export async function deleteUserData(userId) {
    const byCategory = {};
    let total = 0;

    for (const [category, { key, match }] of Object.entries(GUILD_ARRAY_STORES)) {
        const allGuildData = await getAllGuildData(category);
        for (const { guildId, data } of allGuildData) {
            if (!data || typeof data !== 'object' || !Array.isArray(data[key])) {continue;}
            const before = data[key].length;
            const filtered = data[key].filter((item) => !match(item, userId));
            const removed = before - filtered.length;
            if (removed > 0) {
                data[key] = filtered;
                await setGuildData(category, guildId, data);
                byCategory[category] = (byCategory[category] || 0) + removed;
                total += removed;
            }
        }
    }

    const ticketStores = ['tickets'];
    for (const store of ticketStores) {
        const allGuildData = await getAllGuildData(store);
        for (const { guildId, data } of allGuildData) {
            if (!data || typeof data !== 'object') {continue;}
            let storeChanged = false;
            for (const ticketKey of TICKET_KEYS) {
                if (!Array.isArray(data[ticketKey])) {continue;}
                const before = data[ticketKey].length;
                const filtered = data[ticketKey].filter((ticket) => {
                    if (ticket.creatorId === userId) {return false;}
                    if (Array.isArray(ticket.participants) && ticket.participants.includes(userId)) {return false;}
                    return true;
                });
                const removed = before - filtered.length;
                if (removed > 0) {
                    data[ticketKey] = filtered;
                    byCategory.tickets = (byCategory.tickets || 0) + removed;
                    total += removed;
                    storeChanged = true;
                }
            }
            if (storeChanged) {
                await setGuildData(store, guildId, data);
            }
        }
    }

    const userStores = ['levels', 'reminders', 'polls', 'giveaways', 'tags'];
    for (const store of userStores) {
        const allGuildData = await getAllGuildData(store);
        for (const { guildId } of allGuildData) {
            const userData = await getUserData(store, guildId, userId);
            if (userData !== undefined && userData !== null) {
                await setUserData(store, guildId, userId, null);
                byCategory[store] = (byCategory[store] || 0) + 1;
                total += 1;
            }
        }
    }

    return { total, byCategory };
}

export function buildDeletionSummary(summary) {
    if (summary.total === 0) {
        return 'No data found for your user ID.';
    }

    const lines = [];
    const labels = {
        warnings: 'warnings',
        strikes: 'strikes',
        notes: 'notes',
        reminders: 'reminders',
        polls: 'polls',
        giveaways: 'giveaways',
        tags: 'tags',
        tickets: 'tickets',
        levels: 'level/XP records'
    };

    for (const [category, count] of Object.entries(summary.byCategory)) {
        const label = labels[category] || category;
        lines.push(`- ${count} ${label}`);
    }

    return `Deleted ${summary.total} record(s):\n${lines.join('\n')}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('data-deletion')
        .setDescription('Request deletion of all data the bot has stored about you')
        .setDMPermission(true),
    name: 'data-deletion',
    description: 'Request deletion of all data the bot has stored about you',
    category: 'utility',
    dmPermission: true,

    async execute(interaction) {
        try {
            const userId = interaction.user.id;

            const confirmEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Data Deletion Request')
                .setDescription(
                    'This will permanently delete all data the bot has stored about you across all servers, including:\n'
                    + '- Warnings, strikes, and moderator notes\n'
                    + '- XP, level, and message counts\n'
                    + '- Reminders, polls, giveaways, and tags you created\n'
                    + '- Tickets you opened or participated in\n\n'
                    + '**This action is permanent and cannot be undone.**\n'
                    + 'Discord message logs in channels are not affected (those belong to Discord, not this bot).'
                )
                .setFooter({ text: 'You can also contact the bot operator directly to request deletion.' })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('data_deletion_accept')
                        .setLabel('Delete My Data')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('data_deletion_cancel')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

        await interaction.reply({
            embeds: [confirmEmbed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });

        let buttonInteraction;
        try {
            buttonInteraction = await interaction.awaitMessageComponent({
                time: 60_000,
                filter: (i) => i.user.id === userId && (i.customId === 'data_deletion_accept' || i.customId === 'data_deletion_cancel')
            });
        } catch {
            const timeoutEmbed = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle('Data Deletion Request Expired')
                .setDescription('No response received. Your data was not deleted.')
                .setTimestamp();

            try {
                await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            } catch {
                // interaction may have been deleted
            }
            return;
        }

        if (buttonInteraction.customId === 'data_deletion_cancel') {
            const cancelEmbed = new EmbedBuilder()
                .setColor(0x808080)
                .setTitle('Data Deletion Cancelled')
                .setDescription('No data was deleted.')
                .setTimestamp();

            await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
            return;
        }

        if (buttonInteraction.user.id !== userId) {
            const rejectEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Action Rejected')
                .setDescription('This deletion request is not yours.')
                .setTimestamp();

            await buttonInteraction.update({ embeds: [rejectEmbed], components: [] });
            return;
        }

        const summary = await deleteUserData(userId);

        logSecurityEvent({
            event: 'data_deletion_request',
            pluginId: 'utility',
            guildId: interaction.guild?.id || null,
            userId,
            targetId: userId,
            reason: 'user_initiated',
            requestId: interaction.id
        });

        const resultText = buildDeletionSummary(summary);
        const resultEmbed = new EmbedBuilder()
            .setColor(summary.total === 0 ? 0x808080 : 0x00FF00)
            .setTitle(summary.total === 0 ? 'No Data Found' : 'Data Deletion Complete')
            .setDescription(resultText)
            .setFooter({ text: 'A record of this request has been logged.' })
            .setTimestamp();

        await buttonInteraction.update({ embeds: [resultEmbed], components: [] });

        try {
            await interaction.user.send({ embeds: [resultEmbed] });
        } catch {
            // user may have DMs disabled
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
