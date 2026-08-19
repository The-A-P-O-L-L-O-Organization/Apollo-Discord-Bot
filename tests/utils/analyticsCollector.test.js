import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
    initAnalyticsCollector,
    stopAnalyticsCollector,
    trackCommand,
    trackMessage,
    trackViolation,
    trackModAction,
    flushAnalyticsCache,
    flushAnalyticsCritical,
    getAnalyticsCollectorStats,
    getCommandStats,
    getMessageStats,
    getViolationStats,
    getModActionStats,
    getMemberGrowthStats
} from '../../src/utils/analyticsCollector.js';
import { getDb, closeDb, resetTestDb } from '../../src/db/knex.js';

describe('Analytics Collector', () => {
    let mockClient;

    beforeEach(async () => {
        await resetTestDb();
        const db = getDb();
        await db.migrate.latest();
        
        mockClient = {
            guilds: {
                cache: new Map([
                    ['guild1', { id: 'guild1' }],
                    ['guild2', { id: 'guild2' }]
                ])
            }
        };
    });

    afterEach(async () => {
        stopAnalyticsCollector();
        await closeDb();
    });

    it('should initialize and start collector', async () => {
        await initAnalyticsCollector(mockClient);
        
        const stats = getAnalyticsCollectorStats();
        expect(stats.flushesPerformed).toBe(0);
        expect(stats.cleanupsPerformed).toBe(0);
    });

    it('should track commands', async () => {
        await initAnalyticsCollector(mockClient);
        
        trackCommand('guild1', 'ping', 'user1');
        trackCommand('guild1', 'ping', 'user1');
        trackCommand('guild1', 'help', 'user2');
        
        // Flush to DB
        await flushAnalyticsCache();
        
        const stats = await getCommandStats('guild1');
        expect(stats.byCommand).toHaveLength(2);
        expect(stats.byCommand.find(c => c.name === 'ping').count).toBe(2);
        expect(stats.byCommand.find(c => c.name === 'help').count).toBe(1);
    });

    it('should track messages', async () => {
        await initAnalyticsCollector(mockClient);
        
        trackMessage('guild1', 'channel1', 'user1');
        trackMessage('guild1', 'channel1', 'user2');
        trackMessage('guild1', 'channel2', 'user1');
        
        await flushAnalyticsCache();
        
        const stats = await getMessageStats('guild1');
        expect(stats.byChannel).toHaveLength(2);
        expect(stats.byUser).toHaveLength(2);
    });

    it('should track violations', async () => {
        await initAnalyticsCollector(mockClient);
        
        trackViolation('guild1', 'spam');
        trackViolation('guild1', 'spam');
        trackViolation('guild1', 'caps');
        
        await flushAnalyticsCache();
        
        const stats = await getViolationStats('guild1');
        expect(stats).toHaveLength(2);
        expect(stats.find(v => v.type === 'spam').count).toBe(2);
    });

    it('should track mod actions', async () => {
        await initAnalyticsCollector(mockClient);
        
        trackModAction('guild1', 'mod1', 'ban');
        trackModAction('guild1', 'mod1', 'kick');
        trackModAction('guild1', 'mod2', 'warn');
        
        await flushAnalyticsCache();
        
        const stats = await getModActionStats('guild1');
        expect(stats.byModerator).toHaveLength(2);
        expect(stats.byAction).toHaveLength(3);
    });

    it('should flush critical analytics', async () => {
        await initAnalyticsCollector(mockClient);
        
        trackCommand('guild1', 'critical', 'user1');
        
        await flushAnalyticsCritical();
        
        const stats = await getCommandStats('guild1');
        expect(stats.byCommand.find(c => c.name === 'critical').count).toBe(1);
    });

    it('should enforce cache limits', async () => {
        await initAnalyticsCollector(mockClient);
        
        // Add many entries to trigger limit
        for (let i = 0; i < 15000; i++) {
            trackCommand('guild1', `cmd${i}`, `user${i}`);
        }
        
        // Should not crash and should enforce limits
        await flushAnalyticsCache();
        
        const stats = getAnalyticsCollectorStats();
        expect(stats.errors).toBe(0);
    });

    it('should stop collector', async () => {
        await initAnalyticsCollector(mockClient);
        
        stopAnalyticsCollector();
        
        const stats = getAnalyticsCollectorStats();
        expect(stats.uptime).toBe(0);
    });

    it('should get member growth stats', async () => {
        await initAnalyticsCollector(mockClient);
        
        // Track some member changes
        const { trackMemberChange } = await import('../../src/utils/analyticsCollector.js');
        await trackMemberChange('guild1', true, 100);
        await trackMemberChange('guild1', false, 99);
        
        const stats = await getMemberGrowthStats('guild1');
        expect(stats).toHaveLength(2);
    });
});