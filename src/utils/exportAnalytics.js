import { logger } from '../utils/logger.js';
 
// Export Analytics Utility
// Exports analytics data to CSV or JSON format

import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getGuildData } from './db.js';

const EXPORT_DIR = join(process.cwd(), 'data', 'exports');

/**
 * Exports analytics data to a file
 * @param {string} guildId - Guild ID
 * @param {string} format - Export format ('csv' or 'json')
 * @param {Object} options - Export options
 * @param {Array<string>} options.types - Analytics types to export (commands, messages, violations, modactions, members)
 * @param {number} options.days - Number of days to export (default: 30)
 * @returns {Object} Export result with file path
 */
export async function exportAnalytics(guildId, format = 'csv', options = {}) {
    const types = options.types || ['commands', 'messages', 'violations', 'modactions', 'members'];
    const days = options.days || 30;
    
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const exportData = {};
    
    // Collect data for each requested type
    for (const type of types) {
        switch (type) {
        case 'commands':
            exportData.commands = await exportCommandData(guildId, cutoffDate);
            break;
        case 'messages':
            exportData.messages = await exportMessageData(guildId, cutoffDate);
            break;
        case 'violations':
            exportData.violations = await exportViolationData(guildId, cutoffDate);
            break;
        case 'modactions':
            exportData.modactions = await exportModActionData(guildId, cutoffDate);
            break;
        case 'members':
            exportData.members = await exportMemberData(guildId, cutoffDate);
            break;
        }
    }
    
    // Generate filename
    const timestamp = Date.now();
    const filename = `analytics-${guildId}-${timestamp}.${format}`;
    mkdirSync(EXPORT_DIR, { recursive: true });
    const filepath = join(EXPORT_DIR, filename);
    
    // Export based on format
    if (format === 'json') {
        writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    } else if (format === 'csv') {
        const csv = convertToCSV(exportData);
        writeFileSync(filepath, csv);
    } else {
        throw new Error(`Unsupported format: ${format}`);
    }
    
    const { statSync } = await import('fs');
    return {
        filename,
        filepath,
        size: statSync(filepath).size
    };
}

/**
 * Cleans up an exported file
 * @param {string} filepath - Path to the file
 */
export function cleanupExport(filepath) {
    try {
        unlinkSync(filepath);
    } catch (error) {
        logger.error('[ERROR] Failed to cleanup export file:', error);
    }
}

/**
 * Exports command data
 */
async function exportCommandData(guildId, cutoffDate) {
    const data = await getGuildData('analytics-commands', guildId);
    const results = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry.date >= cutoffDate) {
            results.push({
                date: entry.date,
                command: entry.commandName,
                userId: entry.userId,
                count: entry.count
            });
        }
    }
    
    return results;
}

/**
 * Exports message data
 */
async function exportMessageData(guildId, cutoffDate) {
    const data = await getGuildData('analytics-messages', guildId);
    const results = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry.hour >= cutoffDate) {
            results.push({
                hour: entry.hour,
                channelId: entry.channelId,
                userId: entry.userId,
                count: entry.count
            });
        }
    }
    
    return results;
}

/**
 * Exports violation data
 */
async function exportViolationData(guildId, cutoffDate) {
    const data = await getGuildData('analytics-violations', guildId);
    const results = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry.date >= cutoffDate) {
            results.push({
                date: entry.date,
                type: entry.type,
                count: entry.count
            });
        }
    }
    
    return results;
}

/**
 * Exports mod action data
 */
async function exportModActionData(guildId, cutoffDate) {
    const data = await getGuildData('analytics-modactions', guildId);
    const results = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry.date >= cutoffDate) {
            results.push({
                date: entry.date,
                moderatorId: entry.moderatorId,
                action: entry.action,
                count: entry.count
            });
        }
    }
    
    return results;
}

/**
 * Exports member data
 */
async function exportMemberData(guildId, cutoffDate) {
    const data = await getGuildData('analytics-members', guildId);
    const results = [];
    
    for (const key in data) {
        if (key >= cutoffDate) {
            results.push(data[key]);
        }
    }
    
    return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Converts analytics data to CSV format
 */
function convertToCSV(data) {
    const sections = [];
    
    // Commands section
    if (data.commands && data.commands.length > 0) {
        sections.push('# COMMAND USAGE');
        sections.push('Date,Command,User ID,Count');
        for (const row of data.commands) {
            sections.push(`${row.date},${row.command},${row.userId},${row.count}`);
        }
        sections.push('');
    }
    
    // Messages section
    if (data.messages && data.messages.length > 0) {
        sections.push('# MESSAGE ACTIVITY');
        sections.push('Hour,Channel ID,User ID,Count');
        for (const row of data.messages) {
            sections.push(`${row.hour},${row.channelId},${row.userId},${row.count}`);
        }
        sections.push('');
    }
    
    // Violations section
    if (data.violations && data.violations.length > 0) {
        sections.push('# AUTOMOD VIOLATIONS');
        sections.push('Date,Type,Count');
        for (const row of data.violations) {
            sections.push(`${row.date},${row.type},${row.count}`);
        }
        sections.push('');
    }
    
    // Mod actions section
    if (data.modactions && data.modactions.length > 0) {
        sections.push('# MODERATOR ACTIONS');
        sections.push('Date,Moderator ID,Action,Count');
        for (const row of data.modactions) {
            sections.push(`${row.date},${row.moderatorId},${row.action},${row.count}`);
        }
        sections.push('');
    }
    
    // Members section
    if (data.members && data.members.length > 0) {
        sections.push('# MEMBER GROWTH');
        sections.push('Date,Joins,Leaves,Total Members');
        for (const row of data.members) {
            sections.push(`${row.date},${row.joinCount},${row.leaveCount},${row.totalMembers}`);
        }
        sections.push('');
    }
    
    return sections.join('\n');
}

/**
 * Gets a date string in YYYY-MM-DD format
 */
function getDateString(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
}

/**
 * Gets an hour string in YYYY-MM-DD:HH format
 */
function getHourString(timestamp) {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const hour = date.getUTCHours().toString().padStart(2, '0');
    return `${dateStr}:${hour}`;
}

/**
 * Gets analytics summary for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to summarize
 * @returns {Object} Analytics summary
 */
export async function getAnalyticsSummary(guildId, days = 7) {
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    // Count commands
    const commands = await getGuildData('analytics-commands', guildId);
    let totalCommands = 0;
    for (const key in commands) {
        if (commands[key].date >= cutoffDate) {
            totalCommands += commands[key].count;
        }
    }
    
    // Count messages
    const messages = await getGuildData('analytics-messages', guildId);
    let totalMessages = 0;
    const cutoffHour = getHourString(Date.now() - (days * 24 * 60 * 60 * 1000));
    for (const key in messages) {
        if (messages[key].hour >= cutoffHour) {
            totalMessages += messages[key].count;
        }
    }
    
    // Count violations
    const violations = await getGuildData('analytics-violations', guildId);
    let totalViolations = 0;
    for (const key in violations) {
        if (violations[key].date >= cutoffDate) {
            totalViolations += violations[key].count;
        }
    }
    
    // Count mod actions
    const modActions = await getGuildData('analytics-modactions', guildId);
    let totalModActions = 0;
    for (const key in modActions) {
        if (modActions[key].date >= cutoffDate) {
            totalModActions += modActions[key].count;
        }
    }
    
    // Get member changes
    const members = await getGuildData('analytics-members', guildId);
    let totalJoins = 0;
    let totalLeaves = 0;
    let latestTotal = 0;
    for (const key in members) {
        if (key >= cutoffDate) {
            totalJoins += members[key].joinCount;
            totalLeaves += members[key].leaveCount;
            latestTotal = members[key].totalMembers;
        }
    }
    
    return {
        period: `${days} days`,
        commands: totalCommands,
        messages: totalMessages,
        violations: totalViolations,
        modActions: totalModActions,
        memberJoins: totalJoins,
        memberLeaves: totalLeaves,
        currentMembers: latestTotal,
        netGrowth: totalJoins - totalLeaves
    };
}
