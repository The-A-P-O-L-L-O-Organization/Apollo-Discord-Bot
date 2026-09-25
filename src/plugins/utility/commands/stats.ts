import type { ChatInputCommandInteraction} from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, version as djsVersion } from 'discord.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface BotStats {
    commandsRan: number;
    messagesProcessed: number;
}

interface ApolloClient {
    stats?: BotStats;
    uptime?: number;
    ws: { ping: number };
    guilds: { cache: { values: () => Iterable<{ memberCount: number; channels: { cache: { size: number } } }>; size: number } };
    commands?: { size: number };
    user: { id: string; displayAvatarURL: () => string };
}

export default {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Display bot statistics'),
    name: 'stats',
    category: 'Utility',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const resolvedLocale = await i18n.resolveLocale({
                locale: interaction.locale ?? null,
                guildLocale: interaction.guildLocale ?? null,
                guildId: interaction.guildId ?? null
            });
            const t = i18n.getFixedT(resolvedLocale, 'utility');
            const client = interaction.client as ApolloClient;

            // Calculate uptime
            const uptime = formatUptime(client.uptime ?? 0);

            // Get memory usage
            const memoryUsage = process.memoryUsage();
            const usedMemory = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            const totalMemory = Math.round(memoryUsage.heapTotal / 1024 / 1024);

            // Get stats from client if available (set in index.js)
            const stats = client.stats ?? {
                commandsRan: 0,
                messagesProcessed: 0
            };

            // Count total members across all guilds
            let totalMembers = 0;
            let totalChannels = 0;
            for (const guild of client.guilds.cache.values()) {
                totalMembers += guild.memberCount;
                totalChannels += guild.channels.cache.size;
            }

            // Get command count
            const commandCount = client.commands?.size ?? 0;

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(t('stats.title'))
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    {
                        name: t('stats.general'),
                        value: [
                            `**${t('stats.servers')}:** ${client.guilds.cache.size.toLocaleString()}`,
                            `**${t('stats.users')}:** ${totalMembers.toLocaleString()}`,
                            `**${t('stats.channels')}:** ${totalChannels.toLocaleString()}`,
                            `**${t('stats.commands')}:** ${commandCount}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: t('stats.system'),
                        value: [
                            `**${t('stats.uptime')}:** ${uptime}`,
                            `**${t('stats.memory')}:** ${usedMemory}MB / ${totalMemory}MB`,
                            `**${t('stats.node')}:** ${process.version}`,
                            `**${t('stats.djs')}:** v${djsVersion}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: t('stats.session'),
                        value: [
                            `**${t('stats.ran')}:** ${stats.commandsRan.toLocaleString()}`,
                            `**${t('stats.processed')}:** ${stats.messagesProcessed.toLocaleString()}`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: t('stats.latency'),
                        value: [
                            `**${t('stats.botLatency')}:** ${Date.now() - interaction.createdTimestamp}ms`,
                            `**${t('stats.apiLatency')}:** ${Math.round(client.ws.ping)}ms`
                        ].join('\n'),
                        inline: true
                    }
                )
                .setTimestamp()
                .setFooter({ text: t('stats.footer', { id: client.user.id }) });

            await interaction.reply({ embeds: [embed] });

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

/**
 * Formats uptime in a human-readable format
 * @param ms - Uptime in milliseconds
 * @returns Formatted uptime string
 */
function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts: string[] = [];

    if (days > 0) { parts.push(`${days}d`); }
    if (hours % 24 > 0) { parts.push(`${hours % 24}h`); }
    if (minutes % 60 > 0) { parts.push(`${minutes % 60}m`); }
    if (seconds % 60 > 0 || parts.length === 0) { parts.push(`${seconds % 60}s`); }

    return parts.join(' ');
}