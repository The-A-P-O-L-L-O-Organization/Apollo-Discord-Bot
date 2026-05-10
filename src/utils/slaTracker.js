// SLA Tracker Utility
// Handles SLA (Service Level Agreement) tracking for ticket response times

import { getGuildData, setGuildData } from './db.js';

/**
 * Default SLA thresholds (in milliseconds)
 */
export const DEFAULT_SLA_THRESHOLDS = {
    urgent: 15 * 60 * 1000,     // 15 minutes
    high: 1 * 60 * 60 * 1000,   // 1 hour
    medium: 4 * 60 * 60 * 1000, // 4 hours
    low: 24 * 60 * 60 * 1000    // 24 hours
};

/**
 * Records the first response time for a ticket
 * @param {string} guildId 
 * @param {string} ticketId 
 * @param {number} timestamp 
 */
export async function recordFirstResponse(guildId, ticketId, timestamp) {
    const ticketConfig = await getGuildData('tickets', guildId);
    
    if (!ticketConfig.openTickets) {return;}
    
    const ticket = ticketConfig.openTickets.find(t => t.id === ticketId);
    if (ticket && !ticket.firstResponseAt) {
        ticket.firstResponseAt = timestamp;
        await setGuildData('tickets', guildId, ticketConfig);
    }
}

/**
 * Checks if a ticket has breached its SLA
 * @param {object} ticket - The ticket object
 * @param {object} slaThresholds - Custom SLA thresholds (optional)
 * @returns {boolean}
 */
export function hasBreachedSLA(ticket, slaThresholds = DEFAULT_SLA_THRESHOLDS) {
    if (ticket.firstResponseAt) {return false;} // Already responded
    
    const threshold = slaThresholds[ticket.priority] || DEFAULT_SLA_THRESHOLDS.medium;
    const elapsed = Date.now() - ticket.createdAt;
    
    return elapsed > threshold;
}

/**
 * Gets the response time for a ticket in milliseconds
 * @param {object} ticket 
 * @returns {number|null}
 */
export function getResponseTime(ticket) {
    if (!ticket.firstResponseAt) {return null;}
    return ticket.firstResponseAt - ticket.createdAt;
}

/**
 * Gets the resolution time for a closed ticket in milliseconds
 * @param {object} ticket 
 * @returns {number|null}
 */
export function getResolutionTime(ticket) {
    if (!ticket.closedAt) {return null;}
    return ticket.closedAt - ticket.createdAt;
}

/**
 * Calculates SLA metrics for a guild
 * @param {string} guildId 
 * @returns {object}
 */
export async function calculateSLAMetrics(guildId) {
    const ticketConfig = await getGuildData('tickets', guildId);
    const closedTickets = ticketConfig.closedTickets || [];
    const openTickets = ticketConfig.openTickets || [];
    const slaThresholds = ticketConfig.slaThresholds || DEFAULT_SLA_THRESHOLDS;
    
    const metrics = {
        totalTickets: closedTickets.length,
        avgResponseTime: 0,
        avgResolutionTime: 0,
        slaMet: 0,
        slaBreached: 0,
        byCategory: {},
        byPriority: {},
        openTicketsBreached: 0
    };
    
    // Calculate for closed tickets
    const responseTimes = [];
    const resolutionTimes = [];
    
    closedTickets.forEach(ticket => {
        // Response time metrics
        const responseTime = getResponseTime(ticket);
        if (responseTime !== null) {
            responseTimes.push(responseTime);
            
            const threshold = slaThresholds[ticket.priority] || DEFAULT_SLA_THRESHOLDS.medium;
            if (responseTime <= threshold) {
                metrics.slaMet++;
            } else {
                metrics.slaBreached++;
            }
        }
        
        // Resolution time metrics
        const resolutionTime = getResolutionTime(ticket);
        if (resolutionTime !== null) {
            resolutionTimes.push(resolutionTime);
        }
        
        // By category
        const category = ticket.category || 'general';
        if (!metrics.byCategory[category]) {
            metrics.byCategory[category] = { count: 0, avgResponseTime: 0, responseTimes: [] };
        }
        metrics.byCategory[category].count++;
        if (responseTime !== null) {
            metrics.byCategory[category].responseTimes.push(responseTime);
        }
        
        // By priority
        const priority = ticket.priority || 'medium';
        if (!metrics.byPriority[priority]) {
            metrics.byPriority[priority] = { count: 0, avgResponseTime: 0, responseTimes: [] };
        }
        metrics.byPriority[priority].count++;
        if (responseTime !== null) {
            metrics.byPriority[priority].responseTimes.push(responseTime);
        }
    });
    
    // Calculate averages
    if (responseTimes.length > 0) {
        metrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    }
    
    if (resolutionTimes.length > 0) {
        metrics.avgResolutionTime = resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length;
    }
    
    // Calculate category averages
    Object.keys(metrics.byCategory).forEach(category => {
        const times = metrics.byCategory[category].responseTimes;
        if (times.length > 0) {
            metrics.byCategory[category].avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
        delete metrics.byCategory[category].responseTimes;
    });
    
    // Calculate priority averages
    Object.keys(metrics.byPriority).forEach(priority => {
        const times = metrics.byPriority[priority].responseTimes;
        if (times.length > 0) {
            metrics.byPriority[priority].avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
        }
        delete metrics.byPriority[priority].responseTimes;
    });
    
    // Check open tickets for breaches
    openTickets.forEach(ticket => {
        if (hasBreachedSLA(ticket, slaThresholds)) {
            metrics.openTicketsBreached++;
        }
    });
    
    return metrics;
}

/**
 * Formats milliseconds into a human-readable time string
 * @param {number} ms 
 * @returns {string}
 */
export function formatTime(ms) {
    if (ms === null || ms === undefined) {return 'N/A';}
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {return `${days}d ${hours % 24}h`;}
    if (hours > 0) {return `${hours}h ${minutes % 60}m`;}
    if (minutes > 0) {return `${minutes}m ${seconds % 60}s`;}
    return `${seconds}s`;
}

/**
 * Gets priority color for embeds
 * @param {string} priority 
 * @returns {number}
 */
export function getPriorityColor(priority) {
    const colors = {
        urgent: 0xFF0000,   // Red
        high: 0xFF8C00,     // Orange
        medium: 0xFFD700,   // Yellow/Gold
        low: 0x3498DB       // Blue
    };
    return colors[priority] || colors.medium;
}

/**
 * Gets priority emoji
 * @param {string} priority 
 * @returns {string}
 */
export function getPriorityEmoji(priority) {
    const emojis = {
        urgent: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵'
    };
    return emojis[priority] || emojis.medium;
}
