import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getCommandStats } from '../../../../utils/analyticsCollector.js';
import { createBarChart, formatNumber } from '../../../../utils/charts.js';
import { i18n } from '../../../../i18n/index.js';

/**
 * Handles command usage statistics
 */
export async function handleCommandStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const days = interaction.options.getInteger('days') ?? 7;
    const guildId = interaction.guild!.id;

    const stats = await getCommandStats(guildId, days);
    const topCommands = stats.byCommand.slice(0, 10);
    const totalCommands = stats.byCommand.reduce((sum, c) => sum + c.count, 0);

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(t('analytics.commandsTitle', { days }))
        .setDescription(t('analytics.commandsDesc', { count: formatNumber(totalCommands), unique: stats.byCommand.length }));

    // Top commands
    if (stats.byCommand.length > 0) {
        const chartData = topCommands.map(c => ({
            label: c.name,
            value: c.count
        }));

        embed.addFields({
            name: t('analytics.topCommands'),
            value: `\`\`\`\n${createBarChart(chartData, 15)}\n\`\`\``,
            inline: false
        });

        // Total commands
        embed.addFields({
            name: t('analytics.statsHeader'),
            value: [
                t('analytics.totalCommands', { count: formatNumber(totalCommands) }),
                t('analytics.uniqueCommands', { count: stats.byCommand.length }),
                t('analytics.avgPerDay', { count: Math.round(totalCommands / days) })
            ].join('\n'),
            inline: true
        });
    } else {
        embed.addFields({
            name: t('analytics.cmdUsage'),
            value: t('analytics.noCommandData', { days }),
            inline: false
        });
    }

    // Top users
    if (stats.byUser.length > 0) {
        const topUsers = stats.byUser.slice(0, 10);
        const userLines = await Promise.all(topUsers.map(async (u, i) => {
            try {
                const user = await interaction.client.users.fetch(u.userId);
                return `${i + 1}. ${user.tag} - ${t('analytics.commandsSuffix', { count: u.count })}`;
            } catch {
                return `${i + 1}. ${t('analytics.unknownUser')} - ${t('analytics.commandsSuffix', { count: u.count })}`;
            }
        }));

        embed.addFields({
            name: t('analytics.activeUsers'),
            value: userLines.join('\n'),
            inline: false
        });
    }

    embed.setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
