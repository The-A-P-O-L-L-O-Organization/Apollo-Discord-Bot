import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logSecurityEvent, pruneSecurityLog, SECURITY_LOG_ENTRY_KEYS } from '../../../src/utils/securityLog.js';
import { logger } from '../../../src/utils/logger.js';

describe('securityLog', () => {
    let lines;

    beforeEach(() => {
        lines = [];
        vi.spyOn(logger, 'info').mockImplementation((line) => lines.push(line));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should log a structured JSON entry', () => {
        logSecurityEvent({ event: 'mod.hierarchy_blocked', reason: 'test' });
        const parsed = JSON.parse(lines[0].replace(/^\[SECURITY]\s*/, ''));
        expect(parsed.event).toBe('mod.hierarchy_blocked');
        expect(parsed.reason).toBe('test');
        expect(parsed.ts).toBeTruthy();
        for (const key of SECURITY_LOG_ENTRY_KEYS) {
            expect(parsed).toHaveProperty(key);
        }
    });

    it('should prune entries older than retention days', () => {
        const kept = pruneSecurityLog({
            lines: [
                JSON.stringify({ ts: Date.now() - 1000 }),
                JSON.stringify({ ts: Date.now() - 100 * 24 * 60 * 60 * 1000 })
            ],
            retentionDays: 90
        });
        expect(kept.length).toBe(1);
        expect(JSON.parse(kept[0]).ts).toBeGreaterThan(Date.now() - 100 * 24 * 60 * 60 * 1000);
    });

    it('should keep non-JSON lines during pruning', () => {
        const kept = pruneSecurityLog({
            lines: ['not json at all', JSON.stringify({ ts: Date.now() })],
            retentionDays: 90
        });
        expect(kept.length).toBe(2);
    });

    it('should use default retention from env', () => {
        process.env.SECURITY_LOG_RETENTION_DAYS = '30';
        const kept = pruneSecurityLog({
            lines: [JSON.stringify({ ts: Date.now() - 40 * 24 * 60 * 60 * 1000 })]
        });
        expect(kept.length).toBe(0);
        delete process.env.SECURITY_LOG_RETENTION_DAYS;
    });
});
