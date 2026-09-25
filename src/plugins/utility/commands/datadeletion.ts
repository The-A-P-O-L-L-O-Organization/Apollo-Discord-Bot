import type { ChatInputCommandInteraction} from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getAllGuildData, setGuildData, getUserData, setUserData } from '../../../utils/db.js';
import { logSecurityEvent } from '../../../utils/securityLog.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

const GUILD_ARRAY_STORES: Record<string, { key: string; match: (item: unknown, userId: string) => boolean }> = {
    warnings: { key: 'warnings', match: (item, userId) => (item as { userId?: string }).userId === userId },
    strikes: { key: 'strikes', match: (item, userId) => (item as { userId?: string }).userId === userId },
    notes: { key: 'notes', match: (item, userId) => (item as { userId?: string }).userId === userId },
    reminders: { key: 'reminders', match: (item, userId) => (item as { userId?: string }).userId === userId },
    polls: { key: 'polls', match: (item, userId) => (item as { creatorId?: string }).creatorId === userId },
    giveaways: { key: 'giveaways', match: (item, userId) => (item as { creatorId?: string }).creatorId === userId },
    tags: { key: 'tags', match: (item, userId) => (item as { ownerId?: string }).ownerId === userId }
};

const TICKET_KEYS = ['openTickets', 'closedTickets'];

export async function deleteUserData(userId: string): Promise<{ total: number; byCategory: Record<string, number> }> {
    const byCategory: Record<string, number> = {};
    let total = 0;

    for (const [category, { key, match }] of Object.entries(GUILD_ARRAY_STORES)) {
        const allGuildData = await getAllGuildData(category);
        for (const { guildId, data } of allGuildData) {
            if (!data || typeof data !== 'object' || !Array.isArray((data)[key])) { continue; }
            const dataObj = data as Record<string, unknown[]>;
            const arr = dataObj[key] ?? [];
            const before = arr.length;
            const filtered = arr.filter((item) => !match(item, userId));
            const removed = before - filtered.length;
            if (removed > 0) {
                dataObj[key] = filtered;
                await setGuildData(category, guildId, data);
                byCategory[category] = (byCategory[category] ?? 0) + removed;
                total += removed;
            }
        }
    }

    const ticketStores = ['tickets'];
    for (const store of ticketStores) {
        const allGuildData = await getAllGuildData(store);
        for (const { guildId, data } of allGuildData) {
            if (!data || typeof data !== 'object') { continue; }
            const dataObj = data as Record<string, unknown[]>;
            let storeChanged = false;
            for (const ticketKey of TICKET_KEYS) {
                if (!Array.isArray(dataObj[ticketKey])) { continue; }
                const before = dataObj[ticketKey].length;
                const filtered = dataObj[ticketKey].filter((ticket) => {
                    if ((ticket as { creatorId?: string }).creatorId === userId) { return false; }
                    if (Array.isArray((ticket as { participants?: string[] }).participants) && (ticket as { participants: string[] }).participants.includes(userId)) { return false; }
                    return true;
                });
                const removed = before - filtered.length;
                if (removed > 0) {
                    dataObj[ticketKey] = filtered;
                    byCategory['tickets'] = (byCategory['tickets'] ?? 0) + removed;
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
                byCategory[store] = (byCategory[store] ?? 0) + 1;
                total += 1;
            }
        }
    }

    return { total, byCategory };
}

export function buildDeletionSummary(summary: { total: number; byCategory: Record<string, number> }): string {
    if (summary.total === 0) {
        return 'No data found for your user ID.';
    }

    const lines: string[] = [];
    const labels: Record<string, string> = {
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
        const label = labels[category] ?? category;
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
    category: 'Utility',
    dmPermission: true,

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const userId = interaction.user.id;

            const confirmEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle(t('datadeletion.confirmTitle'))
                .setDescription(t('datadeletion.confirmDesc'))
                .setFooter({ text: t('datadeletion.confirmFooter') })
                .setTimestamp();

            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('data_deletion_accept')
                        .setLabel(t('datadeletion.accept'))
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('data_deletion_cancel')
                        .setLabel(t('datadeletion.cancel'))
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({
                embeds: [confirmEmbed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });

            let buttonInteraction;
            try {
                const replyMessage = await interaction.fetchReply();
                buttonInteraction = await replyMessage.awaitMessageComponent({
                    time: 60_000,
                    filter: (i) => i.user.id === userId && (i.customId === 'data_deletion_accept' || i.customId === 'data_deletion_cancel')
                });
            } catch {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0x808080)
                    .setTitle(t('datadeletion.expiredTitle'))
                    .setDescription(t('datadeletion.expiredDesc'))
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
                    .setTitle(t('datadeletion.cancelledTitle'))
                    .setDescription(t('datadeletion.cancelledDesc'))
                    .setTimestamp();

                await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
                return;
            }

            if (buttonInteraction.user.id !== userId) {
                const rejectEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(t('datadeletion.rejectedTitle'))
                    .setDescription(t('datadeletion.rejectedDesc'))
                    .setTimestamp();

                await buttonInteraction.update({ embeds: [rejectEmbed], components: [] });
                return;
            }

            const summary = await deleteUserData(userId);

            logSecurityEvent({
                event: 'data_deletion_request',
                pluginId: 'utility',
                guildId: interaction.guild?.id ?? null,
                userId,
                targetId: userId,
                reason: 'user_initiated',
                requestId: interaction.id
            });

            const resultText = buildDeletionSummary(summary);
            const resultEmbed = new EmbedBuilder()
                .setColor(summary.total === 0 ? 0x808080 : 0x00FF00)
                .setTitle(summary.total === 0 ? t('datadeletion.noneTitle') : t('datadeletion.doneTitle'))
                .setDescription(resultText)
                .setFooter({ text: t('datadeletion.logged') })
                .setTimestamp();

            await buttonInteraction.update({ embeds: [resultEmbed], components: [] });

            try {
                await interaction.user.send({ embeds: [resultEmbed] });
            } catch {
                // user may have DMs disabled
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