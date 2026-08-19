// Duration Utility
// Shared duration parsing and formatting functions

/**
 * Parses a duration string into milliseconds
 * @param {string} str - Duration string (e.g., "10m", "1h", "1d", "7d")
 * @returns {number|null} Duration in milliseconds or null if invalid
 */
export function parseDuration(str) {
    const match = str.match(/^(\d+)([smhd])$/i);
    if (!match) {
        return null;
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return null;
    }
}

/**
 * Formats milliseconds into a human-readable duration string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "1d", "2h", "30m", "45s")
 */
export function formatDuration(ms) {
    if (ms >= 86400000) {
        return `${ms / 86400000}d`;
    }
    if (ms >= 3600000) {
        return `${ms / 3600000}h`;
    }
    if (ms >= 60000) {
        return `${ms / 60000}m`;
    }
    return `${ms / 1000}s`;
}

/**
 * Validates a duration string
 * @param {string} str - Duration string
 * @param {number} maxMs - Maximum allowed duration in ms
 * @returns {object} { valid: boolean, durationMs: number|null, error: string|null }
 */
export function validateDuration(str, maxMs = 604800000) {
    const durationMs = parseDuration(str);
    if (!durationMs) {
        return { valid: false, durationMs: null, error: 'Invalid duration format. Use: 10m, 1h, 1d, 7d (max 7 days).' };
    }
    if (durationMs > maxMs) {
        return { valid: false, durationMs: null, error: `Maximum duration is ${formatDuration(maxMs)}.` };
    }
    return { valid: true, durationMs, error: null };
}

export default {
    parseDuration,
    formatDuration,
    validateDuration
};