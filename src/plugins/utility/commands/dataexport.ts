import type { ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import { getAllGuildData, getUserData, getAllGuildIds } from '../../../utils/db.js';
import { createLogger } from '../../../utils/logger.js';
import { i18n } from '../../../i18n/index.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

const logger = createLogger({ component: 'plugin:utility:dataexport' });

const ALL_GUILD_STORES = [
    'config', 'moderation', 'automod', 'tickets', 'integrations', 'utility',
    'interlink', 'warnings', 'strikes', 'notes', 'cases', 'blacklist',
    'reports', 'temproles', 'tempbans', 'rolepersistence', 'lockdown',
    'raidmode', 'slowmode', 'nickname', 'voicestate', 'analytics',
    'embeds', 'tags', 'announcements', 'apolloinfo', 'invites',
    'datadeletion', 'operatorcontact', 'slareadout', 'levels', 'reminders',
    'polls', 'giveaways'
];

const ALL_USER_STORES = [
    'user', 'levels', 'reminders', 'polls', 'giveaways', 'tags'
];

function filterUserData(data: unknown, userId: string): unknown {
    if (!data || typeof data !== 'object') { return null; }
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            const filtered = value.filter((item: unknown) => {
                if (typeof item !== 'object' || item === null) { return false; }
                const i = item as Record<string, unknown>;
                return i['userId'] === userId || i['creatorId'] === userId ||
                    i['ownerId'] === userId || i['reporterId'] === userId ||
                    i['reportedId'] === userId || i['targetId'] === userId ||
                    (Array.isArray(i['participants']) && (i['participants'] as unknown[]).includes(userId));
            });
            if (filtered.length > 0) { result[key] = filtered; }
        } else if (typeof value === 'object' && value !== null) {
            const nested = value as Record<string, unknown>;
            if (nested['userId'] === userId || nested['creatorId'] === userId) {
                result[key] = value;
            }
        }
    }
    return Object.keys(result).length > 0 ? result : null;
}

function filterTicketData(data: unknown, userId: string): unknown {
    if (!data || typeof data !== 'object') { return null; }
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of ['openTickets', 'closedTickets']) {
        const tickets = obj[key];
        if (Array.isArray(tickets)) {
            const filtered = tickets.filter((t: unknown) => {
                if (typeof t !== 'object' || t === null) { return false; }
                const ticket = t as Record<string, unknown>;
                return ticket['creatorId'] === userId ||
                    (Array.isArray(ticket['participants']) && (ticket['participants'] as unknown[]).includes(userId));
            });
            if (filtered.length > 0) { result[key] = filtered; }
        }
    }
    return Object.keys(result).length > 0 ? result : null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('export-my-data')
        .setDescription('Export all data the bot has stored about you as JSON (GDPR Art. 20)')
        .setDMPermission(true),
    name: 'export-my-data',
    description: 'Export all data the bot has stored about you as JSON (GDPR Art. 20)',
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

            const exportData: Record<string, unknown> = {
                exportedAt: new Date().toISOString(),
                userId,
                requestId: interaction.id,
                guildData: {},
                userData: {}
            };

            for (const store of ALL_GUILD_STORES) {
                try {
                    const allGuildData = await getAllGuildData(store);
                    const guildExport: Record<string, unknown> = {};

                    for (const { guildId, data } of allGuildData) {
                        let filtered: unknown = null;
                        if (store === 'tickets') {
                            filtered = filterTicketData(data, userId);
                        } else {
                            filtered = filterUserData(data, userId);
                        }

                        if (filtered) {
                            guildExport[guildId] = filtered;
                        }
                    }

                    if (Object.keys(guildExport).length > 0) {
                        (exportData['guildData'] as Record<string, unknown>)[store] = guildExport;
                    }
                } catch (err) {
                    logger.warn({ err, store }, 'Failed to export guild store');
                }
            }

            const allGuildIds = await getAllGuildIds('config');
            for (const guildId of allGuildIds) {
                const guildUserExport: Record<string, unknown> = {};
                for (const store of ALL_USER_STORES) {
                    try {
                        const userData = await getUserData(store, guildId, userId);
                        if (userData && Object.keys(userData).length > 0) {
                            guildUserExport[store] = userData;
                        }
                    } catch (err) {
                        logger.warn({ err, store, guildId }, 'Failed to export user store');
                    }
                }
                if (Object.keys(guildUserExport).length > 0) {
                    (exportData['userData'] as Record<string, unknown>)[guildId] = guildUserExport;
                }
            }

            const jsonString = JSON.stringify(exportData, null, 2);
            const buffer = Buffer.from(jsonString, 'utf8');
            const attachment = new AttachmentBuilder(buffer, {
                name: `apollo-data-export-${userId}-${Date.now()}.json`
            });

            try {
                await interaction.user.send({
                    content: t('dataexport.dmContent'),
                    files: [attachment]
                });

                const successEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(t('dataexport.sentTitle'))
                    .setDescription(t('dataexport.sentDesc'))
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
                logger.info({ userId, size: buffer.length }, 'Data export sent via DM');
            } catch (dmErr) {
                const failEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(t('dataexport.dmFailedTitle'))
                    .setDescription(t('dataexport.dmFailedDesc'))
                    .setTimestamp();

                await interaction.editReply({ embeds: [failEmbed] });
                logger.warn({ userId, err: dmErr }, 'Failed to send data export DM');
            }
        } catch (error) {
            const errorMessage = await handleDiscordError(error) ?? 'An unknown error occurred.';
            if (interaction.replied || interaction.deferred) {
                await safeFollowUp(interaction, errorMessage);
            } else {
                await safeReply(interaction, errorMessage);
            }
        }
    }
};
