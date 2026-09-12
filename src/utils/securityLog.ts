// Security Logging Utility
// Structured security event logging with standardized fields

import { logger } from './logger.js';

export const SECURITY_LOG_ENTRY_KEYS = [
    'ts',
    'event',
    'pluginId',
    'guildId',
    'userId',
    'targetId',
    'reason',
    'requestId'
] as const;

type SecurityLogKey = typeof SECURITY_LOG_ENTRY_KEYS[number];

interface SecurityLogEntry {
    ts: number;
    event: string | null;
    pluginId: string | null;
    guildId: string | null;
    userId: string | null;
    targetId: string | null;
    reason: string | null;
    requestId: string | null;
}

export function logSecurityEvent(fields: Partial<SecurityLogEntry>): SecurityLogEntry {
    const entry: SecurityLogEntry = {
        ts: fields.ts ?? Date.now(),
        event: fields.event ?? null,
        pluginId: fields.pluginId ?? null,
        guildId: fields.guildId ?? null,
        userId: fields.userId ?? null,
        targetId: fields.targetId ?? null,
        reason: fields.reason ?? null,
        requestId: fields.requestId ?? null
    };

    logger.info(`[SECURITY] ${JSON.stringify(entry)}`);
    return entry;
}

interface PruneOptions {
    lines?: string[];
    retentionDays?: number;
}

export function pruneSecurityLog({ lines = [], retentionDays }: PruneOptions = {}): string[] {
    const effectiveRetention = retentionDays ?? (Number(process.env['SECURITY_LOG_RETENTION_DAYS']) || 90);
    const cutoff = Date.now() - effectiveRetention * 24 * 60 * 60 * 1000;
    const kept: string[] = [];

    for (const line of lines) {
        try {
            const entry = JSON.parse(line) as { ts?: number };
            if (entry.ts && entry.ts >= cutoff) {
                kept.push(line);
            }
        } catch {
            kept.push(line);
        }
    }

    return kept;
}