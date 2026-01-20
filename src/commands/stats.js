// Stats Command
// Displays bot statistics

import { SlashCommandBuilder, EmbedBuilder, version as djsVersion } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Display bot statistics'),
    category: 'utility',

    async execute(interaction) {
        const client = interaction.client;

        // Calculate uptime
        const uptime = formatUptime(client.uptime);

        // Get memory usage
        const memoryUsage = process.memoryUsage();
        const usedMemory = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const totalMemory = Math.round(memoryUsage.heapTotal / 1024 / 1024);

        // Get stats from client if available (set in index.js)
        const stats = client.stats || {
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
        const commandCount = client.commands?.size || 0;

        const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('Bot Statistics')
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: 'General',
                    value: [
                        `**Servers:** ${client.guilds.cache.size.toLocaleString()}`,
                        `**Users:** ${totalMembers.toLocaleString()}`,
                        `**Channels:** ${totalChannels.toLocaleString()}`,
                        `**Commands:** ${commandCount}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: 'System',
                    value: [
                        `**Uptime:** ${uptime}`,
                        `**Memory:** ${usedMemory}MB / ${totalMemory}MB`,
                        `**Node.js:** ${process.version}`,
                        `**Discord.js:** v${djsVersion}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: 'Session Stats',
                    value: [
                        `**Commands Ran:** ${stats.commandsRan.toLocaleString()}`,
                        `**Messages Processed:** ${stats.messagesProcessed.toLocaleString()}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: 'Latency',
                    value: [
                        `**Bot Latency:** ${Date.now() - interaction.createdTimestamp}ms`,
                        `**API Latency:** ${Math.round(client.ws.ping)}ms`
                    ].join('\n'),
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ text: `Bot ID: ${client.user.id}` });

        return interaction.reply({ embeds: [embed] });
    }
};

/**
 * Formats uptime in a human-readable format
 * @param {number} ms - Uptime in milliseconds
 * @returns {string} Formatted uptime string
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

    return parts.join(' ');
}
