import { config } from '../../../config/config.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';
import type { ChatInputCommandInteraction} from 'discord.js';
import type { ApolloClient } from '../../../types/shared.js';
import { MessageFlags } from 'discord.js';

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (days > 0) {parts.push(days + 'd');}
    if (hours > 0) {parts.push(hours + 'h');}
    if (minutes > 0) {parts.push(minutes + 'm');}
    parts.push(seconds + 's');
    return parts.join(' ');
}

export default {
    name: 'system',
    description: 'Display bot system status and health (bot owner only)',
    category: 'Developer',
    dmPermission: false,
    canQueue: false,
    options: [],

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'admin');
            const denial = await requireOwner(interaction);
            if (denial) {
                return interaction.reply(denial);
            }

            const client = interaction.client as ApolloClient;
            const uptime = Date.now() - client.stats.startTime;
            const plugins = client.manager.listPlugins();
            const runMode = process.env['RUN_MODE'] ?? 'gateway';

            const fields = [
                { name: t('system.runMode'), value: runMode, inline: true },
                { name: t('system.database'), value: config.database.type, inline: true },
                { name: t('system.podId'), value: config.podId, inline: true },
                { name: t('system.queue'), value: config.queue.enabled ? t('system.queueEnabled', { prefix: config.queue.prefix }) : t('system.queueDisabled'), inline: true },
                { name: t('system.plugins'), value: t('system.pluginsValue', { loaded: plugins.length, enabled: plugins.filter(p => p.enabled).length }), inline: true },
                { name: t('system.uptime'), value: formatDuration(uptime), inline: true },
                { name: t('system.commandsRun'), value: String(client.stats.commandsRan), inline: true }
            ];

            if (config.queue.enabled) {
                try {
                    const { Redis } = await import('ioredis');
                    const redis = new Redis({
                        host: config.queue.redis.host,
                        port: config.queue.redis.port,
                        password: config.queue.redis.password ?? undefined,
                        maxRetriesPerRequest: null
                    });
                    const leader = await redis.get('apollo:gateway:leader');
                    await redis.quit();
                    fields.push({ name: t('system.leader'), value: leader ?? t('system.leaderNone'), inline: true });
                } catch (err) {
                    fields.push({ name: t('system.leader'), value: t('system.leaderError', { message: (err as Error).message }), inline: true });
                }
            }

            return interaction.reply({
                embeds: [{
                    color: 0x1E90FF,
                    title: t('system.title'),
                    fields,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
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