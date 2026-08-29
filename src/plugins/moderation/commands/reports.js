import { logger } from '../../../utils/logger.js';
import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import { getGuildData, updateGuildData } from '../../../utils/db.js';
import { safeError } from '../../../utils/safeError.js';
import { handleDiscordError, safeReply, safeFollowUp } from '../../../utils/discordErrors.js';
import { MessageFlags } from 'discord.js';

export default {
    // View and manage user reports
    name: 'reports',
    description: 'View and manage message reports',
    category: 'Moderation',
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    dmPermission: false,
    options: [
        {
            name: 'action',
            description: 'The action to perform',
            type: 3, // STRING
            required: true,
            choices: [
                { name: 'View Pending', value: 'pending' },
                { name: 'View All', value: 'all' },
                { name: 'View by ID', value: 'view' },
                { name: 'Dismiss', value: 'dismiss' }
            ]
        },
        {
            name: 'report_id',
            description: 'The report ID (for view/dismiss actions)',
            type: 3, // STRING
            required: false
        }
    ],
    
    async execute(interaction) {
        try {
            const action = interaction.options.getString('action');
            const reportId = interaction.options.getString('report_id');
            
            const guildData = await getGuildData('reports', interaction.guild.id);
            const reports = guildData.entries || [];
            
            if (action === 'pending') {
                // Show pending reports
                const pending = reports.filter(r => r.status === 'pending');
                
                if (pending.length === 0) {
                    return interaction.reply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[INFO] No Pending Reports',
                            description: 'There are no pending reports.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('Pending Reports')
                    .setDescription(`Found ${pending.length} pending report(s)`)
                    .setTimestamp();
                
                // Show up to 10 reports
                pending.slice(0, 10).forEach((report, index) => {
                    const date = new Date(report.timestamp).toLocaleString();
                    embed.addFields({
                        name: `Report #${index + 1} - ID: ${report.reportId}`,
                        value: `**Author:** ${report.authorTag} (\`${report.authorId}\`)\n**Reporter:** ${report.reporterTag}\n**Channel:** <#${report.channelId}>\n**Date:** ${date}\n**Status:** ${report.status}`,
                        inline: false
                    });
                });
                
                if (pending.length > 10) {
                    embed.setFooter({ text: `Showing 10 of ${pending.length} reports` });
                }
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                
            } else if (action === 'all') {
                // Show all reports
                if (reports.length === 0) {
                    return interaction.reply({
                        embeds: [{
                            color: 0x00FF00,
                            title: '[INFO] No Reports',
                            description: 'There are no reports in this server.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const pending = reports.filter(r => r.status === 'pending').length;
                const resolved = reports.filter(r => r.status !== 'pending').length;
                
                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle('All Reports')
                    .setDescription(`Total: ${reports.length} reports`)
                    .addFields(
                        { name: 'Pending', value: `${pending}`, inline: true },
                        { name: 'Resolved', value: `${resolved}`, inline: true }
                    )
                    .setTimestamp();
                
                // Show last 10 reports
                reports.slice(-10).reverse().forEach((report, index) => {
                    const date = new Date(report.timestamp).toLocaleString();
                    embed.addFields({
                        name: `${report.reportId}`,
                        value: `**Author:** ${report.authorTag}\n**Reporter:** ${report.reporterTag}\n**Date:** ${date}\n**Status:** ${report.status}`,
                        inline: true
                    });
                });
                
                if (reports.length > 10) {
                    embed.setFooter({ text: `Showing 10 most recent of ${reports.length} reports` });
                }
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                
            } else if (action === 'view') {
                // View specific report
                if (!reportId) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Missing Report ID',
                            description: 'Please provide a report ID to view.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const report = reports.find(r => r.reportId === reportId);
                
                if (!report) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Report Not Found',
                            description: `No report found with ID: ${reportId}`,
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const date = new Date(report.timestamp).toLocaleString();
                
                const embed = new EmbedBuilder()
                    .setColor('#3498DB')
                    .setTitle(`Report Details - ${reportId}`)
                    .addFields(
                        { name: 'Message Author', value: `${report.authorTag}\n\`${report.authorId}\``, inline: true },
                        { name: 'Reporter', value: `${report.reporterTag}\n\`${report.reporterId}\``, inline: true },
                        { name: 'Status', value: report.status, inline: true },
                        { name: 'Channel', value: `<#${report.channelId}>`, inline: true },
                        { name: 'Date', value: date, inline: true },
                        { name: 'Message Content', value: report.content || '*No text content*', inline: false }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                
            } else if (action === 'dismiss') {
                // Dismiss a report
                if (!reportId) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Missing Report ID',
                            description: 'Please provide a report ID to dismiss.',
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const reportIndex = reports.findIndex(r => r.reportId === reportId);
                
                if (reportIndex === -1) {
                    return interaction.reply({
                        embeds: [{
                            color: 0xFF0000,
                            title: '[ERROR] Report Not Found',
                            description: `No report found with ID: ${reportId}`,
                            timestamp: new Date().toISOString()
                        }],
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                // Update report status
                await updateGuildData('reports', interaction.guild.id, (data) => {
                    if (!data.entries) {data.entries = [];}
                    if (data.entries[reportIndex]) {
                        data.entries[reportIndex].status = 'dismissed';
                        data.entries[reportIndex].resolvedBy = interaction.user.id;
                        data.entries[reportIndex].resolvedAt = Date.now();
                    }
                    return data;
                });
                
                await interaction.reply({
                    embeds: [{
                        color: 0x00FF00,
                        title: '[SUCCESS] Report Dismissed',
                        description: `Report ${reportId} has been dismissed.`,
                        timestamp: new Date().toISOString()
                    }],
                    flags: MessageFlags.Ephemeral
                });
                
                logger.info(`[REPORT] Report ${reportId} dismissed by ${interaction.user.tag}`);
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