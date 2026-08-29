import { config } from '../../../config/config.js';
import { requireOwner } from '../../../utils/accessControl.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days > 0) parts.push(days + 'd');
    if (hours > 0) parts.push(hours + 'h');
    if (minutes > 0) parts.push(minutes + 'm');
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

    async execute(interaction) {
        try {
            const denial = await requireOwner(interaction);
            if (denial) {
                return interaction.reply(denial);
            }

            const uptime = Date.now() - interaction.client.stats.startTime;
            const plugins = interaction.client.manager.listPlugins();
            const runMode = process.env.RUN_MODE || 'gateway';

            const fields = [
                { name: 'Run Mode', value: runMode, inline: true },
                { name: 'Database', value: config.database.type, inline: true },
                { name: 'Pod ID', value: config.podId, inline: true },
                { name: 'Queue', value: config.queue.enabled ? 'Enabled (' + config.queue.prefix + ')' : 'Disabled', inline: true },
                { name: 'Plugins', value: plugins.length + ' loaded (' + plugins.filter(p => p.enabled).length + ' enabled)', inline: true },
                { name: 'Uptime', value: formatDuration(uptime), inline: true },
                { name: 'Commands Run', value: String(interaction.client.stats.commandsRan), inline: true },
            ];

            if (config.queue.enabled) {
                try {
                    const { Redis } = await import('ioredis');
                    const redis = new Redis({
                        host: config.queue.redis.host,
                        port: config.queue.redis.port,
                        password: config.queue.redis.password || undefined,
                        maxRetriesPerRequest: null,
                    });
                    const leader = await redis.get('apollo:gateway:leader');
                    await redis.quit();
                    fields.push({ name: 'Leader', value: leader || 'None', inline: true });
                } catch (err) {
                    fields.push({ name: 'Leader', value: 'Error: ' + err.message, inline: true });
                }
            }

            return interaction.reply({
                embeds: [{
                    color: 0x1E90FF,
                    title: 'System Status',
                    fields,
                    timestamp: new Date().toISOString()
                }],
                flags: MessageFlags.Ephemeral
            });
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