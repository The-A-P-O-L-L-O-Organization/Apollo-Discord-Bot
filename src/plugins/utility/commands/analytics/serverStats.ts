import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getMemberGrowthStats } from '../../../../utils/analyticsCollector.js';
import { getAnalyticsSummary } from '../../../../utils/exportAnalytics.js';
import { createSparkline, formatNumber } from '../../../../utils/charts.js';
import { i18n } from '../../../../i18n/index.js';

interface MemberGrowthData {
    date: string;
    totalMembers: number;
    joinCount: number;
    leaveCount: number;
}

/**
 * Handles server-wide statistics
 */
export async function handleServerStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const days = interaction.options.getInteger('days') ?? 7;
    const guildId = interaction.guild!.id;

    // Get summary data
    const summary = await getAnalyticsSummary(guildId, days);
    const memberGrowth = await getMemberGrowthStats(guildId, days) as unknown as MemberGrowthData[];

    // Create sparklines for trends
    const memberCounts = memberGrowth.map((d: MemberGrowthData) => d.totalMembers);

    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(t('analytics.serverTitle', { days }))
        .setDescription(t('analytics.serverDesc', { name: interaction.guild!.name }))
        .addFields(
            {
                name: t('analytics.activityOverview'),
                value: [
                    t('analytics.commandsRun', { count: formatNumber(summary.commands) }),
                    t('analytics.messagesSent', { count: formatNumber(summary.messages) }),
                    t('analytics.automodActions', { count: formatNumber(summary.violations) }),
                    t('analytics.modActions', { count: formatNumber(summary.modActions) })
                ].join('\n'),
                inline: true
            },
            {
                name: t('analytics.memberStats'),
                value: [
                    t('analytics.currentMembers', { count: formatNumber(summary.currentMembers) }),
                    t('analytics.newJoins', { count: formatNumber(summary.memberJoins) }),
                    t('analytics.membersLeft', { count: formatNumber(summary.memberLeaves) }),
                    t('analytics.netGrowth', { count: `${summary.netGrowth >= 0 ? '+' : ''}${formatNumber(summary.netGrowth)}` })
                ].join('\n'),
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: t('analytics.dataFrom', { from: memberGrowth[0]?.date ?? t('analytics.na'), to: memberGrowth[memberGrowth.length - 1]?.date ?? t('analytics.na') }) });

    // Add member growth trend if we have data
    if (memberCounts.length > 0) {
        embed.addFields({
            name: t('analytics.growthTrend'),
            value: `\`\`\`${createSparkline(memberCounts)}\`\`\``,
            inline: false
        });
    }

    // Add daily breakdown
    if (memberGrowth.length > 0) {
        const recentDays = memberGrowth.slice(-7);
        const breakdown = recentDays.map((d: MemberGrowthData) => {
            const net = d.joinCount - d.leaveCount;
            return `\`${d.date}\` +${d.joinCount} -${d.leaveCount} (${net >= 0 ? '+' : ''}${net})`;
        }).join('\n');

        embed.addFields({
            name: t('analytics.recentChanges'),
            value: breakdown || t('analytics.noData'),
            inline: false
        });
    }

    await interaction.editReply({ embeds: [embed] });
}
