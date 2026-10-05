import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getViolationStats, getModActionStats } from '../../../../utils/analyticsCollector.js';
import { createBarChart, formatDuration, formatNumber } from '../../../../utils/charts.js';
import { getGuildData, getUserData } from '../../../../utils/db.js';
import { i18n } from '../../../../i18n/index.js';

interface ViolationStats {
    type: string;
    count: number;
}

/**
 * Handles moderation statistics
 */
export async function handleModerationStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const days = interaction.options.getInteger('days') ?? 30;
    const guildId = interaction.guild!.id;

    const modStats = await getModActionStats(guildId, days);
    const violations = await getViolationStats(guildId, days) as ViolationStats[];
    const ticketData = await getGuildData('tickets', guildId);

    const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle(t('analytics.moderationTitle', { days }))
        .setDescription(t('analytics.moderationDesc'));

    // Mod action overview
    if (modStats.byAction.length > 0) {
        const totalActions = modStats.byAction.reduce((sum, a) => sum + a.count, 0);

        const actionLines = modStats.byAction.map(a => ({
            label: a.action,
            value: a.count
        }));

        embed.addFields({
            name: t('analytics.actionsByType'),
            value: `\`\`\`\n${createBarChart(actionLines, 15)}\n\`\`\``,
            inline: false
        });

        embed.addFields({
            name: t('analytics.overview'),
            value: [
                t('analytics.totalActions', { count: formatNumber(totalActions) }),
                t('analytics.actionsPerDay', { count: Math.round(totalActions / days) }),
                t('analytics.activeMods', { count: modStats.byModerator.length })
            ].join('\n'),
            inline: true
        });
    } else {
        embed.addFields({
            name: t('analytics.modActionsHeader'),
            value: t('analytics.noModActions'),
            inline: false
        });
    }

    // Top moderators
    if (modStats.byModerator.length > 0) {
        const topMods = modStats.byModerator.slice(0, 10);
        const modLines = await Promise.all(topMods.map(async (m, i) => {
            try {
                const user = await interaction.client.users.fetch(m.moderatorId);
                return `${i + 1}. ${user.tag} - ${t('analytics.modActionsSuffix', { count: m.count })}`;
            } catch {
                return `${i + 1}. ${t('analytics.unknown')} - ${t('analytics.modActionsSuffix', { count: m.count })}`;
            }
        }));

        embed.addFields({
            name: t('analytics.topMods'),
            value: modLines.join('\n'),
            inline: false
        });
    }

    // Automod violations
    if (violations.length > 0) {
        const violationLines = violations.slice(0, 8).map(v => ({
            label: v.type.replace('_', ' '),
            value: v.count
        }));

        embed.addFields({
            name: t('analytics.violations'),
            value: `\`\`\`\n${createBarChart(violationLines, 12)}\n\`\`\``,
            inline: false
        });
    }

    // Ticket statistics
    if (ticketData) {
        const closedTickets = (ticketData['closedTickets'] as { closedAt: number; createdAt: number }[] | undefined) ?? [];
        const recentClosed = closedTickets.filter((t: { closedAt: number; createdAt: number }) => {
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            return t.closedAt >= cutoff;
        });

        if (recentClosed.length > 0) {
            // Calculate average resolution time
            const resolutionTimes = recentClosed.map((t: { closedAt: number; createdAt: number }) => t.closedAt - t.createdAt);
            const avgResolution = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;

            embed.addFields({
                name: t('analytics.ticketStats'),
                value: [
                    t('analytics.ticketsClosed', { count: recentClosed.length }),
                    t('analytics.avgResolution', { time: formatDuration(avgResolution) }),
                    t('analytics.openNow', { count: (ticketData['openTickets'] as unknown[] | undefined)?.length ?? 0 })
                ].join('\n'),
                inline: true
            });
        }
    }

    // Warning effectiveness
    const warningsData = await getUserData('warnings', guildId, 'ALL');
    if (warningsData) {
        const allWarnings = Object.values(warningsData).flatMap(v => Array.isArray(v) ? v : [v]) as { timestamp: number; automod?: boolean }[];
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const recentWarnings = allWarnings.filter((w: { timestamp: number }) => w.timestamp >= cutoff);
        const automodWarnings = recentWarnings.filter(w => w.automod);

        embed.addFields({
            name: t('analytics.warnings'),
            value: [
                t('analytics.totalIssued', { count: recentWarnings.length }),
                t('analytics.automod', { count: automodWarnings.length }),
                t('analytics.manual', { count: recentWarnings.length - automodWarnings.length })
            ].join('\n'),
            inline: true
        });
    }

    embed.setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}
