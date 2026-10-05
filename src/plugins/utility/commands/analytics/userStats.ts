import type { ChatInputCommandInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { getCommandStats, getMessageStats } from '../../../../utils/analyticsCollector.js';
import { formatNumber } from '../../../../utils/charts.js';
import { getUserData } from '../../../../utils/db.js';
import { i18n } from '../../../../i18n/index.js';

/**
 * Handles individual user statistics
 */
export async function handleUserStats(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const user = interaction.options.getUser('target');
    if (!user) {
        await interaction.editReply({ content: t('analytics.userNotFound') });
        return;
    }
    const days = interaction.options.getInteger('days') ?? 30;
    const guildId = interaction.guild!.id;

    const commandStats = await getCommandStats(guildId, days);
    const messageStats = await getMessageStats(guildId, days);

    // Find user's command count
    const userCommands = commandStats.byUser.find(u => u.userId === user.id);
    const commandCount = userCommands?.count ?? 0;
    const commandRank = commandStats.byUser.findIndex(u => u.userId === user.id) + 1;

    // Find user's message count
    const userMessages = messageStats.byUser.find(u => u.userId === user.id);
    const messageCount = userMessages?.count ?? 0;
    const messageRank = messageStats.byUser.findIndex(u => u.userId === user.id) + 1;

    // Get warnings
    const warnings = ((await getUserData('warnings', guildId, user.id)) as unknown as { active?: boolean; timestamp: number; automod?: boolean }[] | undefined) ?? [];
    const activeWarnings = warnings.filter((w: { active?: boolean }) => w.active !== false);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentWarnings = warnings.filter((w: { timestamp: number }) => w.timestamp >= cutoff);

    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(t('analytics.userTitle', { tag: user.tag }))
        .setDescription(t('analytics.userDesc', { days }))
        .setThumbnail(user.displayAvatarURL({ extension: 'png', size: 256 }))
        .addFields(
            {
                name: t('analytics.cmdUsage'),
                value: [
                    t('analytics.commandsRun', { count: formatNumber(commandCount) }),
                    t('analytics.serverRank', { rank: commandRank > 0 ? `#${commandRank}` : t('analytics.na') }),
                    t('analytics.avgPerDay', { count: Math.round(commandCount / days) })
                ].join('\n'),
                inline: true
            },
            {
                name: t('analytics.msgActivity'),
                value: [
                    t('analytics.messagesSent', { count: formatNumber(messageCount) }),
                    t('analytics.serverRank', { rank: messageRank > 0 ? `#${messageRank}` : t('analytics.na') }),
                    t('analytics.avgPerDay', { count: Math.round(messageCount / days) })
                ].join('\n'),
                inline: true
            },
            {
                name: t('analytics.warnings'),
                value: [
                    t('analytics.activeWarnings', { count: activeWarnings.length }),
                    t('analytics.recentWarnings', { count: recentWarnings.length }),
                    t('analytics.allTime', { count: warnings.length })
                ].join('\n'),
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: `User ID: ${user.id}` });

    await interaction.editReply({ embeds: [embed] });
}
