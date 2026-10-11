import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getAllGuildData, getUserData } from '../../../utils/db.js';
import { createLogger } from '../../../utils/logger.js';
import { i18n } from '../../../i18n/index.js';
import { handleDiscordError, safeReply } from '../../../utils/discordErrors.js';

const logger = createLogger({ component: 'plugin:utility:datarequest' });

const GUILD_STORES_TO_CHECK = [
    'warnings', 'strikes', 'notes', 'cases', 'blacklist',
    'tickets', 'reports', 'temproles', 'tempbans', 'rolepersistence',
    'nickname', 'voicestate', 'invites', 'datadeletion', 'slareadout',
    'levels', 'reminders', 'polls', 'giveaways', 'tags',
    'automod', 'analytics', 'moderation'
];

const USER_STORES_TO_CHECK = [
    'user', 'levels', 'reminders', 'polls', 'giveaways', 'tags'
];

function countUserInGuildArray(data: unknown, userId: string, key: string, idField: string): number {
    if (!data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>)[key])) {
        return 0;
    }
    const arr = ((data as Record<string, unknown>)[key] ?? []) as unknown[];
    return arr.filter((item) => (item as Record<string, string>)[idField] === userId).length;
}

function countUserInTickets(data: unknown, userId: string): number {
    if (!data || typeof data !== 'object') { return 0; }
    const obj = data as Record<string, unknown[]>;
    let count = 0;
    for (const key of ['openTickets', 'closedTickets']) {
        if (Array.isArray(obj[key])) {
            count += (obj[key] as unknown[]).filter((t) =>
                (t as { creatorId?: string }).creatorId === userId ||
                (t as { participants?: string[] }).participants?.includes(userId)
            ).length;
        }
    }
    return count;
}

export default {
    data: new SlashCommandBuilder()
        .setName('data-request')
        .setDescription('Request a summary of all data the bot has stored about you (GDPR Art. 15)')
        .setDMPermission(true),
    name: 'data-request',
    description: 'Request a summary of all data the bot has stored about you (GDPR Art. 15)',
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

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildCounts: Record<string, number> = {};
            const userCounts: Record<string, number> = {};
            let totalGuildRecords = 0;
            let totalUserRecords = 0;

            for (const store of GUILD_STORES_TO_CHECK) {
                try {
                    const allGuildData = await getAllGuildData(store);
                    let storeCount = 0;
                    for (const { guildId, data } of allGuildData) {
                        let guildStoreCount = 0;
                        switch (store) {
                            case 'warnings':
                            case 'strikes':
                            case 'notes':
                            case 'cases':
                            case 'blacklist':
                                guildStoreCount = countUserInGuildArray(data, userId, store, 'userId');
                                break;
                            case 'reports':
                                guildStoreCount = countUserInGuildArray(data, userId, 'reports', 'reporterId') +
                                    countUserInGuildArray(data, userId, 'reports', 'reportedId');
                                break;
                            case 'tickets':
                                guildStoreCount = countUserInTickets(data, userId);
                                break;
                            case 'temproles':
                            case 'tempbans':
                            case 'rolepersistence':
                                guildStoreCount = countUserInGuildArray(data, userId, store, 'userId');
                                break;
                            case 'nickname':
                                guildStoreCount = countUserInGuildArray(data, userId, 'savedNicknames', 'userId');
                                break;
                            case 'voicestate':
                                guildStoreCount = countUserInGuildArray(data, userId, 'voiceLogs', 'userId');
                                break;
                            case 'invites':
                                guildStoreCount = countUserInGuildArray(data, userId, 'inviteTracker', 'userId');
                                break;
                            case 'datadeletion':
                                guildStoreCount = countUserInGuildArray(data, userId, 'deletionRequests', 'userId');
                                break;
                            case 'slareadout':
                                guildStoreCount = countUserInGuildArray(data, userId, 'slaRecords', 'userId');
                                break;
                            case 'levels':
                            case 'automod':
                            case 'analytics':
                            case 'moderation':
                            case 'reminders':
                            case 'polls':
                            case 'giveaways':
                            case 'tags':
                                break;
                        }
                        if (guildStoreCount > 0) {
                            storeCount += guildStoreCount;
                            guildCounts[`${store}:${guildId}`] = (guildCounts[`${store}:${guildId}`] ?? 0) + guildStoreCount;
                        }
                    }
                    if (storeCount > 0) {
                        totalGuildRecords += storeCount;
                        guildCounts[store] = storeCount;
                    }
                } catch (err) {
                    logger.warn({ err, store }, 'Failed to check guild store for data request');
                }
            }

            const allGuilds = await getAllGuildData('config');
            for (const { guildId } of allGuilds) {
                for (const store of USER_STORES_TO_CHECK) {
                    try {
                        const userData = await getUserData(store, guildId, userId);
                        if (userData && Object.keys(userData).length > 0) {
                            const fields = Object.keys(userData).filter((k) => k !== 'custom').length;
                            if (fields > 0) {
                                userCounts[store] = (userCounts[store] ?? 0) + 1;
                                totalUserRecords += 1;
                            }
                        }
                    } catch (err) {
                        logger.warn({ err, store, guildId }, 'Failed to check user store for data request');
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(t('datarequest.title'))
                .setDescription(t('datarequest.desc', { user: interaction.user.toString() }))
                .setTimestamp();

            if (totalGuildRecords === 0 && totalUserRecords === 0) {
                embed.addFields({ name: t('datarequest.none'), value: t('datarequest.noneDesc') });
            } else {
                if (totalGuildRecords > 0) {
                    const guildFields = Object.entries(guildCounts)
                        .filter(([k]) => !k.includes(':'))
                        .map(([store, count]) => `${store}: ${count} record(s)`)
                        .join('\n') || 'None';
                    embed.addFields({ name: t('datarequest.guildData'), value: guildFields.slice(0, 1024) });
                }
                if (totalUserRecords > 0) {
                    const userFields = Object.entries(userCounts)
                        .map(([store, count]) => `${store}: ${count} guild(s)`)
                        .join('\n') || 'None';
                    embed.addFields({ name: t('datarequest.userData'), value: userFields.slice(0, 1024) });
                }
            }

            embed.setFooter({ text: t('datarequest.footer', { total: totalGuildRecords + totalUserRecords }) });

            await interaction.editReply({ embeds: [embed] });

            logger.info({ userId, guildRecords: totalGuildRecords, userRecords: totalUserRecords }, 'Data request fulfilled');
        } catch (error) {
            const errorMessage = await handleDiscordError(error) ?? 'An unknown error occurred.';
            await safeReply(interaction, errorMessage);
        }
    }
};
