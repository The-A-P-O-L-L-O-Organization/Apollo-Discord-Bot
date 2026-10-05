import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getMessageStats } from '../../../../utils/analyticsCollector.js';
import { createBarChart, formatNumber } from '../../../../utils/charts.js';
import { i18n } from '../../../../i18n/index.js';

/**
 * Handles message activity statistics
 */
export async function handleActivityStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const days = interaction.options.getInteger('days') ?? 7;
    const guildId = interaction.guild!.id;

    const stats = await getMessageStats(guildId, days);

    // Total messages
    const totalMessages = stats.byChannel.reduce((sum, c) => sum + c.count, 0);

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(t('analytics.activityTitle', { days }))
        .setDescription(t('analytics.activityDesc', { messages: formatNumber(totalMessages), active: stats.byUser.length }));

    embed.addFields({
        name: t('analytics.overview'),
        value: [
            t('analytics.totalMessages', { count: formatNumber(totalMessages) }),
            t('analytics.perDay', { count: Math.round(totalMessages / days) }),
            t('analytics.activeChannelsCount', { count: stats.byChannel.length }),
            t('analytics.activeUsersCount', { count: stats.byUser.length })
        ].join('\n'),
        inline: false
    });

    // Top channels
    if (stats.byChannel.length > 0) {
        const topChannels = stats.byChannel.slice(0, 10);
        const channelLines = topChannels.map((c, i) => {
            const channel = interaction.guild!.channels.cache.get(c.channelId);
            const percentage = (c.count / totalMessages * 100).toFixed(1);
            return `${i + 1}. ${channel ? `#${channel.name}` : t('analytics.unknown')} - ${formatNumber(c.count)} (${percentage}%)`;
        });

        embed.addFields({
            name: t('analytics.topChannels'),
            value: channelLines.join('\n'),
            inline: false
        });
    }

    // Top users
    if (stats.byUser.length > 0) {
        const topUsers = stats.byUser.slice(0, 10);
        const userLines = await Promise.all(topUsers.map(async (u, i) => {
            try {
                const user = await interaction.client.users.fetch(u.userId);
                const percentage = (u.count / totalMessages * 100).toFixed(1);
                return `${i + 1}. ${user.tag} - ${formatNumber(u.count)} (${percentage}%)`;
            } catch {
                return `${i + 1}. ${t('analytics.unknown')} - ${formatNumber(u.count)}`;
            }
        }));

        embed.addFields({
            name: t('analytics.activeUsers'),
            value: userLines.join('\n'),
            inline: false
        });
    }

    // Hourly activity pattern (last 24 hours)
    if (stats.byHour.length > 0) {
        const last24Hours = stats.byHour.slice(-24);
        const hourlyData = last24Hours.map((h: { hour: string; count: number }) => ({
            label: h.hour.split(':')[1] + 'h',
            value: h.count
        }));

        if (hourlyData.length > 0) {
            embed.addFields({
                name: t('analytics.pattern'),
                value: `\`\`\`\n${createBarChart(hourlyData.slice(-12), 10)}\n\`\`\``,
                inline: false
            });
        }
    }

    embed.setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
