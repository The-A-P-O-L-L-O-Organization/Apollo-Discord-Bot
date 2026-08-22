import { logger } from './utils/logger.js';

export const SECURITY_LOG_ENTRY_KEYS = ['ts', 'event', 'pluginId', 'guildId', 'userId', 'targetId', 'reason', 'requestId'];

export function logSecurityEvent(fields) {
    const entry = {};
    for (const key of SECURITY_LOG_ENTRY_KEYS) {
        entry[key] = fields[key] !== undefined ? fields[key] : null;
    }
    entry.ts = fields.ts || Date.now();
    logger.info(`[SECURITY] ${JSON.stringify(entry)}`);
    return entry;
}

export function pruneSecurityLog({ lines, retentionDays } = {}) {
    const effectiveRetention = retentionDays ?? (Number(process.env.SECURITY_LOG_RETENTION_DAYS) || 90);
    const cutoff = Date.now() - effectiveRetention * 24 * 60 * 60 * 1000;
    const kept = [];
    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
            if (entry.ts >= cutoff) {
                kept.push(line);
            }
        } catch {
            kept.push(line);
        }
    }
    return kept;
}
