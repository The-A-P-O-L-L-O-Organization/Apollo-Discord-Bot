// Analytics Commands
// Provides comprehensive analytics and statistics for server management

import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    AttachmentBuilder
} from 'discord.js';
import {
    getCommandStats,
    getMessageStats,
    getViolationStats,
    getModActionStats,
    getMemberGrowthStats
} from '../../../utils/analyticsCollector.js';
import {
    createBarChart,
    createSparkline,
    formatDuration,
    formatNumber
} from '../../../utils/charts.js';
import {
    exportAnalytics,
    cleanupExport,
    getAnalyticsSummary
} from '../../../utils/exportAnalytics.js';
import { getGuildData, getUserData } from '../../../utils/db.js';
import { readFileSync } from 'fs';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';

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

    async execute(interaction) {
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
            const errorMessage = handleDiscordError(error);
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
async function handleServerStats(interaction) {
    await interaction.deferReply();
    
    const days = interaction.options.getInteger('days') || 7;
    const guildId = interaction.guild.id;
    
    // Get summary data
    const summary = await getAnalyticsSummary(guildId, days);
    const memberGrowth = await getMemberGrowthStats(guildId, days);
    
    // Create sparklines for trends
    const memberCounts = memberGrowth.map(d => d.totalMembers);

    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`📊 Server Analytics - Last ${days} Days`)
        .setDescription(`Comprehensive statistics for **${interaction.guild.name}**`)
        .addFields(
            {
                name: '📈 Activity Overview',
                value: [
                    `**Commands Run:** ${formatNumber(summary.commands)}`,
                    `**Messages Sent:** ${formatNumber(summary.messages)}`,
                    `**Automod Actions:** ${formatNumber(summary.violations)}`,
                    `**Mod Actions:** ${formatNumber(summary.modActions)}`
                ].join('\n'),
                inline: true
            },
            {
                name: '👥 Member Statistics',
                value: [
                    `**Current Members:** ${formatNumber(summary.currentMembers)}`,
                    `**New Joins:** ${formatNumber(summary.memberJoins)}`,
                    `**Members Left:** ${formatNumber(summary.memberLeaves)}`,
                    `**Net Growth:** ${summary.netGrowth >= 0 ? '+' : ''}${formatNumber(summary.netGrowth)}`
                ].join('\n'),
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: `Data from ${memberGrowth[0]?.date || 'N/A'} to ${memberGrowth[memberGrowth.length - 1]?.date || 'N/A'}` });
    
    // Add member growth trend if we have data
    if (memberCounts.length > 0) {
        embed.addFields({
            name: '📊 Member Growth Trend',
            value: `\`\`\`${createSparkline(memberCounts)}\`\`\``,
            inline: false
        });
    }
    
    // Add daily breakdown
    if (memberGrowth.length > 0) {
        const recentDays = memberGrowth.slice(-7);
        const breakdown = recentDays.map(d => {
            const net = d.joinCount - d.leaveCount;
            return `\`${d.date}\` +${d.joinCount} -${d.leaveCount} (${net >= 0 ? '+' : ''}${net})`;
        }).join('\n');
        
        embed.addFields({
            name: '📅 Recent Daily Changes',
            value: breakdown || 'No data',
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

/**
 * Handles command usage statistics
 */
async function handleCommandStats(interaction) {
    await interaction.deferReply();
    
    const days = interaction.options.getInteger('days') || 7;
    const guildId = interaction.guild.id;
    
    const stats = await getCommandStats(guildId, days);
    
    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`⚙️ Command Usage - Last ${days} Days`)
        .setDescription('Most used commands and active users');
    
    // Top commands
    if (stats.byCommand.length > 0) {
        const topCommands = stats.byCommand.slice(0, 10);
        const chartData = topCommands.map(c => ({
            label: c.name,
            value: c.count
        }));
        
        embed.addFields({
            name: '🏆 Top Commands',
            value: `\`\`\`\n${createBarChart(chartData, 15)}\n\`\`\``,
            inline: false
        });
        
        // Total commands
        const totalCommands = stats.byCommand.reduce((sum, c) => sum + c.count, 0);
        embed.addFields({
            name: '📊 Statistics',
            value: [
                `**Total Commands:** ${formatNumber(totalCommands)}`,
                `**Unique Commands:** ${stats.byCommand.length}`,
                `**Average per Day:** ${Math.round(totalCommands / days)}`
            ].join('\n'),
            inline: true
        });
    } else {
        embed.addFields({
            name: '📊 Command Usage',
            value: 'No command data available for this period.',
            inline: false
        });
    }
    
    // Top users
    if (stats.byUser.length > 0) {
        const topUsers = stats.byUser.slice(0, 10);
        const userLines = await Promise.all(topUsers.map(async(u, i) => {
            try {
                const user = await interaction.client.users.fetch(u.userId);
                return `${i + 1}. ${user.tag} - ${u.count} commands`;
            } catch {
                return `${i + 1}. Unknown User - ${u.count} commands`;
            }
        }));
        
        embed.addFields({
            name: '👤 Most Active Users',
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
async function handleActivityStats(interaction) {
    await interaction.deferReply();
    
    const days = interaction.options.getInteger('days') || 7;
    const guildId = interaction.guild.id;
    
    const stats = await getMessageStats(guildId, days);
    
    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`💬 Message Activity - Last ${days} Days`)
        .setDescription('Message statistics by channel and user');
    
    // Total messages
    const totalMessages = stats.byChannel.reduce((sum, c) => sum + c.count, 0);
    
    embed.addFields({
        name: '📊 Overview',
        value: [
            `**Total Messages:** ${formatNumber(totalMessages)}`,
            `**Messages per Day:** ${Math.round(totalMessages / days)}`,
            `**Active Channels:** ${stats.byChannel.length}`,
            `**Active Users:** ${stats.byUser.length}`
        ].join('\n'),
        inline: false
    });
    
    // Top channels
    if (stats.byChannel.length > 0) {
        const topChannels = stats.byChannel.slice(0, 10);
        const channelLines = topChannels.map((c, i) => {
            const channel = interaction.guild.channels.cache.get(c.channelId);
            const percentage = (c.count / totalMessages * 100).toFixed(1);
            return `${i + 1}. ${channel ? `#${channel.name}` : 'Unknown'} - ${formatNumber(c.count)} (${percentage}%)`;
        });
        
        embed.addFields({
            name: '📺 Most Active Channels',
            value: channelLines.join('\n'),
            inline: false
        });
    }
    
    // Top users
    if (stats.byUser.length > 0) {
        const topUsers = stats.byUser.slice(0, 10);
        const userLines = await Promise.all(topUsers.map(async(u, i) => {
            try {
                const user = await interaction.client.users.fetch(u.userId);
                const percentage = (u.count / totalMessages * 100).toFixed(1);
                return `${i + 1}. ${user.tag} - ${formatNumber(u.count)} (${percentage}%)`;
            } catch {
                return `${i + 1}. Unknown - ${formatNumber(u.count)}`;
            }
        }));
        
        embed.addFields({
            name: '👥 Most Active Users',
            value: userLines.join('\n'),
            inline: false
        });
    }
    
    // Hourly activity pattern (last 24 hours)
    if (stats.byHour.length > 0) {
        const last24Hours = stats.byHour.slice(-24);
        const hourlyData = last24Hours.map(h => ({
            label: h.hour.split(':')[1] + 'h',
            value: h.count
        }));
        
        if (hourlyData.length > 0) {
            embed.addFields({
                name: '⏰ Activity Pattern (Last 24 Hours)',
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
async function handleModerationStats(interaction) {
    await interaction.deferReply();
    
    const days = interaction.options.getInteger('days') || 30;
    const guildId = interaction.guild.id;
    
    const modStats = await getModActionStats(guildId, days);
    const violations = await getViolationStats(guildId, days);
    const ticketData = await getGuildData('tickets', guildId);
    
    const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle(`🛡️ Moderation Analytics - Last ${days} Days`)
        .setDescription('Moderation team performance and statistics');
    
    // Mod action overview
    if (modStats.byAction.length > 0) {
        const totalActions = modStats.byAction.reduce((sum, a) => sum + a.count, 0);
        
        const actionLines = modStats.byAction.map(a => ({
            label: a.action,
            value: a.count
        }));
        
        embed.addFields({
            name: '📊 Actions by Type',
            value: `\`\`\`\n${createBarChart(actionLines, 15)}\n\`\`\``,
            inline: false
        });
        
        embed.addFields({
            name: '📈 Overview',
            value: [
                `**Total Actions:** ${formatNumber(totalActions)}`,
                `**Actions per Day:** ${Math.round(totalActions / days)}`,
                `**Active Moderators:** ${modStats.byModerator.length}`
            ].join('\n'),
            inline: true
        });
    } else {
        embed.addFields({
            name: '📊 Moderator Actions',
            value: 'No moderation actions recorded for this period.',
            inline: false
        });
    }
    
    // Top moderators
    if (modStats.byModerator.length > 0) {
        const topMods = modStats.byModerator.slice(0, 10);
        const modLines = await Promise.all(topMods.map(async(m, i) => {
            try {
                const user = await interaction.client.users.fetch(m.moderatorId);
                return `${i + 1}. ${user.tag} - ${m.count} actions`;
            } catch {
                return `${i + 1}. Unknown - ${m.count} actions`;
            }
        }));
        
        embed.addFields({
            name: '👮 Most Active Moderators',
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
            name: '⚠️ Automod Violations',
            value: `\`\`\`\n${createBarChart(violationLines, 12)}\n\`\`\``,
            inline: false
        });
    }
    
    // Ticket statistics
    if (ticketData) {
        const closedTickets = ticketData.closedTickets || [];
        const recentClosed = closedTickets.filter(t => {
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            return t.closedAt >= cutoff;
        });
        
        if (recentClosed.length > 0) {
            // Calculate average resolution time
            const resolutionTimes = recentClosed.map(t => t.closedAt - t.createdAt);
            const avgResolution = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;
            
            embed.addFields({
                name: '🎫 Ticket Statistics',
                value: [
                    `**Tickets Closed:** ${recentClosed.length}`,
                    `**Avg Resolution Time:** ${formatDuration(avgResolution)}`,
                    `**Currently Open:** ${ticketData.openTickets?.length || 0}`
                ].join('\n'),
                inline: true
            });
        }
    }
    
    // Warning effectiveness
    const warningsData = await getUserData('warnings', guildId, 'ALL');
    if (warningsData) {
        const allWarnings = Object.values(warningsData).flat();
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        const recentWarnings = allWarnings.filter(w => w.timestamp >= cutoff);
        const automodWarnings = recentWarnings.filter(w => w.automod);
        
        embed.addFields({
            name: '⚠️ Warnings',
            value: [
                `**Total Issued:** ${recentWarnings.length}`,
                `**Automod:** ${automodWarnings.length}`,
                `**Manual:** ${recentWarnings.length - automodWarnings.length}`
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
async function handleUserStats(interaction) {
    await interaction.deferReply();
    
    const user = interaction.options.getUser('target');
    const days = interaction.options.getInteger('days') || 30;
    const guildId = interaction.guild.id;
    
    const commandStats = await getCommandStats(guildId, days);
    const messageStats = await getMessageStats(guildId, days);
    
    // Find user's command count
    const userCommands = commandStats.byUser.find(u => u.userId === user.id);
    const commandCount = userCommands?.count || 0;
    const commandRank = commandStats.byUser.findIndex(u => u.userId === user.id) + 1;
    
    // Find user's message count
    const userMessages = messageStats.byUser.find(u => u.userId === user.id);
    const messageCount = userMessages?.count || 0;
    const messageRank = messageStats.byUser.findIndex(u => u.userId === user.id) + 1;
    
    // Get warnings
    const warnings = await getUserData('warnings', guildId, user.id) || [];
    const activeWarnings = warnings.filter(w => w.active !== false);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const recentWarnings = warnings.filter(w => w.timestamp >= cutoff);
    
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`📊 User Analytics - ${user.tag}`)
        .setDescription(`Statistics for the last ${days} days`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            {
                name: '⚙️ Command Usage',
                value: [
                    `**Commands Run:** ${formatNumber(commandCount)}`,
                    `**Server Rank:** ${commandRank > 0 ? `#${commandRank}` : 'N/A'}`,
                    `**Average per Day:** ${Math.round(commandCount / days)}`
                ].join('\n'),
                inline: true
            },
            {
                name: '💬 Message Activity',
                value: [
                    `**Messages Sent:** ${formatNumber(messageCount)}`,
                    `**Server Rank:** ${messageRank > 0 ? `#${messageRank}` : 'N/A'}`,
                    `**Average per Day:** ${Math.round(messageCount / days)}`
                ].join('\n'),
                inline: true
            },
            {
                name: '⚠️ Warnings',
                value: [
                    `**Active Warnings:** ${activeWarnings.length}`,
                    `**Recent Warnings:** ${recentWarnings.length}`,
                    `**Total All-Time:** ${warnings.length}`
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
async function handleExport(interaction) {
    await interaction.deferReply({ flags: 64 });
    
    const format = interaction.options.getString('format');
    const days = interaction.options.getInteger('days') || 30;
    const guildId = interaction.guild.id;
    
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
            content: `✅ Analytics exported successfully!\n**Format:** ${format.toUpperCase()}\n**Period:** Last ${days} days\n**Size:** ${(result.size / 1024).toFixed(2)} KB`,
            files: [attachment]
        });
        
        // Clean up the temporary file after 5 seconds
        setTimeout(() => {
            cleanupExport(result.filepath);
        }, 5000);
        
    } catch (error) {
        console.error('[ERROR] Analytics export failed:', error);
        await interaction.editReply({
            content: '❌ Failed to export analytics. Please try again later.'
        });
    }
}
