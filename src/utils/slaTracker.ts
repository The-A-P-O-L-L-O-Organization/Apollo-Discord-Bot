// SLA Tracker Utility
// Handles SLA (Service Level Agreement) tracking for ticket response times

import { getGuildData, setGuildData } from './db.js';

/**
 * Default SLA thresholds (in milliseconds)
 */
export const DEFAULT_SLA_THRESHOLDS = {
    urgent: 15 * 60 * 1000,
    high: 1 * 60 * 60 * 1000,
    medium: 4 * 60 * 60 * 1000,
    low: 24 * 60 * 60 * 1000
} as const;

export type SLAThresholds = typeof DEFAULT_SLA_THRESHOLDS;
export type SLAPriority = keyof SLAThresholds;

interface Ticket {
    id: string;
    priority: SLAPriority;
    createdAt: number;
    firstResponseAt?: number;
    closedAt?: number;
    category?: string;
}

interface TicketConfig {
    openTickets?: Ticket[];
    closedTickets?: Ticket[];
    slaThresholds?: SLAThresholds;
}

interface SLAMetrics {
    totalTickets: number;
    avgResponseTime: number;
    avgResolutionTime: number;
    slaMet: number;
    slaBreached: number;
    byCategory: Record<string, { count: number; avgResponseTime: number }>;
    byPriority: Record<string, { count: number; avgResponseTime: number }>;
    openTicketsBreached: number;
}

/**
 * Records the first response time for a ticket
 * @param guildId - The guild ID
 * @param ticketId - The ticket ID
 * @param timestamp - Timestamp of first response
 */
export async function recordFirstResponse(guildId: string, ticketId: string, timestamp: number): Promise<void> {
    const ticketConfig = await getGuildData('tickets', guildId) as TicketConfig | null;

    if (!ticketConfig?.openTickets) { return; }

    const ticket = ticketConfig.openTickets.find(t => t.id === ticketId);
    if (ticket && !ticket.firstResponseAt) {
        ticket.firstResponseAt = timestamp;
        await setGuildData('tickets', guildId, ticketConfig);
    }
}

/**
 * Checks if a ticket has breached its SLA
 * @param ticket - The ticket object
 * @param slaThresholds - Custom SLA thresholds (optional)
 * @returns Whether SLA is breached
 */
export function hasBreachedSLA(ticket: Ticket, slaThresholds: SLAThresholds = DEFAULT_SLA_THRESHOLDS): boolean {
    if (ticket.firstResponseAt) { return false; }

    const threshold = slaThresholds[ticket.priority] ?? DEFAULT_SLA_THRESHOLDS.medium;
    const elapsed = Date.now() - ticket.createdAt;

    return elapsed > threshold;
}

/**
 * Gets the response time for a ticket in milliseconds
 * @param ticket - The ticket object
 * @returns Response time in ms or null
 */
export function getResponseTime(ticket: Ticket): number | null {
    if (!ticket.firstResponseAt) { return null; }
    return ticket.firstResponseAt - ticket.createdAt;
}

/**
 * Gets the resolution time for a closed ticket in milliseconds
 * @param ticket - The ticket object
 * @returns Resolution time in ms or null
 */
export function getResolutionTime(ticket: Ticket): number | null {
    if (!ticket.closedAt) { return null; }
    return ticket.closedAt - ticket.createdAt;
}

/**
 * Calculates SLA metrics for a guild
 * @param guildId - The guild ID
 * @returns SLA metrics object
 */
export async function calculateSLAMetrics(guildId: string): Promise<SLAMetrics> {
    const ticketConfig = await getGuildData('tickets', guildId) as TicketConfig | null;
    const closedTickets = ticketConfig?.closedTickets || [];
    const openTickets = ticketConfig?.openTickets || [];
    const slaThresholds = ticketConfig?.slaThresholds ?? DEFAULT_SLA_THRESHOLDS;

    const metrics: SLAMetrics = {
        totalTickets: closedTickets.length,
        avgResponseTime: 0,
        avgResolutionTime: 0,
        slaMet: 0,
        slaBreached: 0,
        byCategory: {},
        byPriority: {},
        openTicketsBreached: 0
    };

    const responseTimes: number[] = [];
    const resolutionTimes: number[] = [];

    closedTickets.forEach(ticket => {
        const responseTime = getResponseTime(ticket);
        if (responseTime !== null) {
            responseTimes.push(responseTime);

            const threshold = slaThresholds[ticket.priority] ?? DEFAULT_SLA_THRESHOLDS.medium;
            if (responseTime <= threshold) {
                metrics.slaMet++;
            } else {
                metrics.slaBreached++;
            }
        }

        const resolutionTime = getResolutionTime(ticket);
        if (resolutionTime !== null) {
            resolutionTimes.push(resolutionTime);
        }

        const category = ticket.category ?? 'general';
        if (!metrics.byCategory[category]) {
            metrics.byCategory[category] = { count: 0, avgResponseTime: 0 };
        }
        metrics.byCategory[category].count++;
        if (responseTime !== null) {
            (metrics.byCategory[category] as any).responseTimes = (metrics.byCategory[category] as any).responseTimes || [];
            (metrics.byCategory[category] as any).responseTimes.push(responseTime);
        }

        const priority = ticket.priority ?? 'medium';
        if (!metrics.byPriority[priority]) {
            metrics.byPriority[priority] = { count: 0, avgResponseTime: 0 };
        }
        metrics.byPriority[priority].count++;
        if (responseTime !== null) {
            (metrics.byPriority[priority] as any).responseTimes = (metrics.byPriority[priority] as any).responseTimes || [];
            (metrics.byPriority[priority] as any).responseTimes.push(responseTime);
        }
    });

    if (responseTimes.length > 0) {
        metrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }

    if (resolutionTimes.length > 0) {
        metrics.avgResolutionTime = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;
    }

    Object.keys(metrics.byCategory).forEach(category => {
        const times = (metrics.byCategory[category] as any).responseTimes || [];
        if (times.length > 0) {
            metrics.byCategory[category].avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
        delete (metrics.byCategory[category] as any).responseTimes;
    });

    Object.keys(metrics.byPriority).forEach(priority => {
        const times = (metrics.byPriority[priority] as any).responseTimes || [];
        if (times.length > 0) {
            metrics.byPriority[priority].avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
        delete (metrics.byPriority[priority] as any).responseTimes;
    });

    openTickets.forEach(ticket => {
        if (hasBreachedSLA(ticket, slaThresholds)) {
            metrics.openTicketsBreached++;
        }
    });

    return metrics;
}

/**
 * Formats milliseconds into a human-readable time string
 * @param ms - Milliseconds
 * @returns Formatted time string
 */
export function formatTime(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) { return 'N/A'; }

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) { return `${days}d ${hours % 24}h`; }
    if (hours > 0) { return `${hours}h ${minutes % 60}m`; }
    if (minutes > 0) { return `${minutes}m ${seconds % 60}s`; }
    return `${seconds}s`;
}

/**
 * Gets priority color for embeds
 * @param priority - Ticket priority
 * @returns Color as number
 */
export function getPriorityColor(priority: string): number {
    const colors = {
        urgent: 0xFF0000,
        high: 0xFF8C00,
        medium: 0xFFD700,
        low: 0x3498DB
    };
    return colors[priority as keyof typeof colors] ?? colors.medium;
}

/**
 * Gets priority emoji
 * @param priority - Ticket priority
 * @returns Emoji string
 */
export function getPriorityEmoji(priority: string): string {
    const emojis = {
        urgent: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵'
    };
    return emojis[priority as keyof typeof emojis] ?? emojis.medium;
}