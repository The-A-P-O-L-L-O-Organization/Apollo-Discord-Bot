import type { ChatInputCommandInteraction} from 'discord.js';
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../../utils/logger.js';
import { getCommandStats, getMessageStats, getViolationStats, getModActionStats, getMemberGrowthStats } from '../../../utils/analyticsCollector.js';
import { createBarChart, createSparkline, formatDuration, formatNumber } from '../../../utils/charts.js';
import { exportAnalytics, cleanupExport, getAnalyticsSummary } from '../../../utils/exportAnalytics.js';
import { getGuildData, getUserData } from '../../../utils/db.js';
import { readFileSync } from 'fs';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { i18n } from '../../../i18n/index.js';

interface MemberGrowthData {
    date: string;
    totalMembers: number;
    joinCount: number;
    leaveCount: number;
}

interface ViolationStats {
    type: string;
    count: number;
}

export default {
    data: new SlashCommandBuilder()
        .setName('analytics')
        .setDescription('View server analytics and statistics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('View server-wide statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 7)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('commands')
                .setDescription('View command usage statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 7)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('activity')
                .setDescription('View message activity statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 7)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('moderation')
                .setDescription('View moderation team statistics')
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 30)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('View individual user statistics')
                .addUserOption(option =>
                    option
                        .setName('target')
                        .setDescription('User to analyze')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to analyze (default: 30)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('export')
                .setDescription('Export analytics data to a file')
                .addStringOption(option =>
                    option
                        .setName('format')
                        .setDescription('Export format')
                        .setRequired(true)
                        .addChoices(
                            { name: 'CSV', value: 'csv' },
                            { name: 'JSON', value: 'json' }
                        )
                )
                .addIntegerOption(option =>
                    option
                        .setName('days')
                        .setDescription('Number of days to export (default: 30)')
                        .setMinValue(1)
                        .setMaxValue(90)
                        .setRequired(false)
                )
        ),
    name: 'analytics',
    category: 'analytics',

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        try {
            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
            case 'server':
                return handleServerStats(interaction);
            case 'commands':
                return handleCommandStats(interaction);
            case 'activity':
                return handleActivityStats(interaction);
            case 'moderation':
                return handleModerationStats(interaction);
            case 'user':
                return handleUserStats(interaction);
            case 'export':
                return handleExport(interaction);
            }

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
 * Handles server-wide statistics
 */
async function handleServerStats(interaction: ChatInputCommandInteraction): Promise<void> {
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

/**
 * Handles command usage statistics
 */
async function handleCommandStats(interaction: ChatInputCommandInteraction): Promise<void> {
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

/**
 * Handles message activity statistics
 */
async function handleActivityStats(interaction: ChatInputCommandInteraction): Promise<void> {
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

/**
 * Handles moderation statistics
 */
async function handleModerationStats(interaction: ChatInputCommandInteraction): Promise<void> {
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

/**
 * Handles individual user statistics
 */
async function handleUserStats(interaction: ChatInputCommandInteraction): Promise<void> {
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

/**
 * Handles analytics export
 */
async function handleExport(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const resolvedLocale = await i18n.resolveLocale({
        locale: interaction.locale ?? null,
        guildLocale: interaction.guildLocale ?? null,
        guildId: interaction.guildId ?? null
    });
    const t = i18n.getFixedT(resolvedLocale, 'utility');
    const format = interaction.options.getString('format', true);
    const days = interaction.options.getInteger('days') ?? 30;
    const guildId = interaction.guild!.id;

    try {
        // Export the data
        const result = await exportAnalytics(guildId, format, {
            types: ['commands', 'messages', 'violations', 'modactions', 'members'],
            days
        });

        // Read the file
        const fileData = readFileSync(result.filepath);
        const attachment = new AttachmentBuilder(fileData, { name: result.filename });

        await interaction.editReply({
            content: t('analytics.exportOk', { format: format.toUpperCase(), days, size: (result.size / 1024).toFixed(2) }),
            files: [attachment]
        });

        // Clean up the temporary file after 5 seconds
        setTimeout(() => {
            cleanupExport(result.filepath);
        }, 5000);

    } catch (error) {
        logger.error({ err: error, msg: '[ERROR] Analytics export failed:' });
        await interaction.editReply({
            content: t('analytics.exportFail')
        });
    }
}