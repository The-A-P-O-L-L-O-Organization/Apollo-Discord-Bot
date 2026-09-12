// Export Analytics Utility
// Exports analytics data to CSV or JSON format
import { logger } from './logger.js';
import { writeFileSync, unlinkSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { getGuildData } from './db.js';

const EXPORT_DIR = join(process.cwd(), 'data', 'exports');

interface ExportOptions {
    types?: string[];
    days?: number;
}

interface ExportResult {
    filename: string;
    filepath: string;
    size: number;
}

interface CommandEntry {
    date: string;
    commandName: string;
    userId: string;
    count: number;
}

interface MessageEntry {
    hour: string;
    channelId: string;
    userId: string;
    count: number;
}

interface ViolationEntry {
    date: string;
    type: string;
    count: number;
}

interface ModActionEntry {
    date: string;
    moderatorId: string;
    action: string;
    count: number;
}

interface MemberEntry {
    date: string;
    joinCount: number;
    leaveCount: number;
    totalMembers: number;
}

interface AnalyticsSummary {
    period: string;
    commands: number;
    messages: number;
    violations: number;
    modActions: number;
    memberJoins: number;
    memberLeaves: number;
    currentMembers: number;
    netGrowth: number;
}

/**
 * Exports analytics data to a file
 * @param {string} guildId - Guild ID
 * @param {string} format - Export format ('csv' or 'json')
 * @param {ExportOptions} options - Export options
 * @returns {Promise<ExportResult>} Export result with file path
 */
export async function exportAnalytics(guildId: string, format: string = 'csv', options: ExportOptions = {}): Promise<ExportResult> {
    const types = options.types || ['commands', 'messages', 'violations', 'modactions', 'members'];
    const days = options.days || 30;
    
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const exportData: Record<string, unknown> = {};
    
    // Collect data for each requested type
    for (const type of types) {
        switch (type) {
        case 'commands':
            exportData['commands'] = await exportCommandData(guildId, cutoffDate);
            break;
        case 'messages':
            exportData['messages'] = await exportMessageData(guildId, cutoffDate);
            break;
        case 'violations':
            exportData['violations'] = await exportViolationData(guildId, cutoffDate);
            break;
        case 'modactions':
            exportData['modactions'] = await exportModActionData(guildId, cutoffDate);
            break;
        case 'members':
            exportData['members'] = await exportMemberData(guildId, cutoffDate);
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
export function cleanupExport(filepath: string): void {
    try {
        unlinkSync(filepath);
    } catch (error) {
        // @ts-expect-error - pino logger overloads
        logger.error('[ERROR] Failed to cleanup export file:', { err: error as Error });
    }
}

/**
 * Exports command data
 */
async function exportCommandData(guildId: string, cutoffDate: string): Promise<CommandEntry[]> {
    const data = await getGuildData('analytics-commands', guildId) as Record<string, CommandEntry>;
    const results: CommandEntry[] = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry && entry.date >= cutoffDate) {
            results.push({
                date: entry.date,
                commandName: entry.commandName,
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
async function exportMessageData(guildId: string, cutoffDate: string): Promise<MessageEntry[]> {
    const data = await getGuildData('analytics-messages', guildId) as Record<string, MessageEntry>;
    const results: MessageEntry[] = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry && entry.hour >= cutoffDate) {
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
async function exportViolationData(guildId: string, cutoffDate: string): Promise<ViolationEntry[]> {
    const data = await getGuildData('analytics-violations', guildId) as Record<string, ViolationEntry>;
    const results: ViolationEntry[] = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry && entry.date >= cutoffDate) {
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
async function exportModActionData(guildId: string, cutoffDate: string): Promise<ModActionEntry[]> {
    const data = await getGuildData('analytics-modactions', guildId) as Record<string, ModActionEntry>;
    const results: ModActionEntry[] = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry && entry.date >= cutoffDate) {
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
async function exportMemberData(guildId: string, cutoffDate: string): Promise<MemberEntry[]> {
    const data = await getGuildData('analytics-members', guildId) as Record<string, MemberEntry>;
    const results: MemberEntry[] = [];
    
    for (const key in data) {
        const entry = data[key];
        if (entry && key >= cutoffDate) {
            results.push(entry);
        }
    }
    
    return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Converts analytics data to CSV format
 */
function convertToCSV(data: Record<string, unknown>): string {
    const sections: string[] = [];
    
    // Commands section
    const commandsData = data['commands'];
    if (commandsData && Array.isArray(commandsData) && commandsData.length > 0) {
        sections.push('# COMMAND USAGE');
        sections.push('Date,Command,User ID,Count');
        for (const row of commandsData as CommandEntry[]) {
            sections.push(`${row.date},${row.commandName},${row.userId},${row.count}`);
        }
        sections.push('');
    }
    
    // Messages section
    const messagesData = data['messages'];
    if (messagesData && Array.isArray(messagesData) && messagesData.length > 0) {
        sections.push('# MESSAGE ACTIVITY');
        sections.push('Hour,Channel ID,User ID,Count');
        for (const row of messagesData as MessageEntry[]) {
            sections.push(`${row.hour},${row.channelId},${row.userId},${row.count}`);
        }
        sections.push('');
    }
    
    // Violations section
    const violationsData = data['violations'];
    if (violationsData && Array.isArray(violationsData) && violationsData.length > 0) {
        sections.push('# AUTOMOD VIOLATIONS');
        sections.push('Date,Type,Count');
        for (const row of violationsData as ViolationEntry[]) {
            sections.push(`${row.date},${row.type},${row.count}`);
        }
        sections.push('');
    }
    
    // Mod actions section
    const modactionsData = data['modactions'];
    if (modactionsData && Array.isArray(modactionsData) && modactionsData.length > 0) {
        sections.push('# MODERATOR ACTIONS');
        sections.push('Date,Moderator ID,Action,Count');
        for (const row of modactionsData as ModActionEntry[]) {
            sections.push(`${row.date},${row.moderatorId},${row.action},${row.count}`);
        }
        sections.push('');
    }
    
    // Members section
    const membersData = data['members'];
    if (membersData && Array.isArray(membersData) && membersData.length > 0) {
        sections.push('# MEMBER GROWTH');
        sections.push('Date,Joins,Leaves,Total Members');
        for (const row of membersData as MemberEntry[]) {
            sections.push(`${row.date},${row.joinCount},${row.leaveCount},${row.totalMembers}`);
        }
        sections.push('');
    }
    
    return sections.join('\n');
}

/**
 * Gets a date string in YYYY-MM-DD format
 */
function getDateString(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0] ?? '';
}

/**
 * Gets an hour string in YYYY-MM-DD:HH format
 */
function getHourString(timestamp: number): string {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0] ?? '';
    const hour = date.getUTCHours().toString().padStart(2, '0');
    return `${dateStr}:${hour}`;
}

/**
 * Gets analytics summary for a guild
 * @param {string} guildId - Guild ID
 * @param {number} days - Number of days to summarize
 * @returns {Promise<AnalyticsSummary>} Analytics summary
 */
export async function getAnalyticsSummary(guildId: string, days = 7): Promise<AnalyticsSummary> {
    const cutoffDate = getDateString(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    // Count commands
    const commands = await getGuildData('analytics-commands', guildId) as Record<string, CommandEntry>;
    let totalCommands = 0;
    for (const key in commands) {
        const entry = commands[key];
        if (entry && entry.date >= cutoffDate) {
            totalCommands += entry.count;
        }
    }
    
    // Count messages
    const messages = await getGuildData('analytics-messages', guildId) as Record<string, MessageEntry>;
    let totalMessages = 0;
    const cutoffHour = getHourString(Date.now() - (days * 24 * 60 * 60 * 1000));
    for (const key in messages) {
        const entry = messages[key];
        if (entry && entry.hour >= cutoffHour) {
            totalMessages += entry.count;
        }
    }
    
    // Count violations
    const violations = await getGuildData('analytics-violations', guildId) as Record<string, ViolationEntry>;
    let totalViolations = 0;
    for (const key in violations) {
        const entry = violations[key];
        if (entry && entry.date >= cutoffDate) {
            totalViolations += entry.count;
        }
    }
    
    // Count mod actions
    const modActions = await getGuildData('analytics-modactions', guildId) as Record<string, ModActionEntry>;
    let totalModActions = 0;
    for (const key in modActions) {
        const entry = modActions[key];
        if (entry && entry.date >= cutoffDate) {
            totalModActions += entry.count;
        }
    }
    
    // Get member changes
    const members = await getGuildData('analytics-members', guildId) as Record<string, MemberEntry>;
    let totalJoins = 0;
    let totalLeaves = 0;
    let latestTotal = 0;
    for (const key in members) {
        const entry = members[key];
        if (entry && key >= cutoffDate) {
            totalJoins += entry.joinCount;
            totalLeaves += entry.leaveCount;
            latestTotal = entry.totalMembers;
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