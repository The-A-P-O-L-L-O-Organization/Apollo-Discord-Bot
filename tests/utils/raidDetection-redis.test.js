import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Raid detection Redis', () => {
    let mockRedis;

    beforeEach(async () => {
        vi.resetModules();
        mockRedis = {
            zadd: vi.fn().mockResolvedValue(1),
            zcount: vi.fn().mockResolvedValue(3),
            zremrangebyscore: vi.fn().mockResolvedValue(0),
            expire: vi.fn().mockResolvedValue(1),
            zrange: vi.fn().mockResolvedValue([]),
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue('OK'),
            del: vi.fn().mockResolvedValue(1)
        };
        
        vi.doMock('../../src/utils/lock.js', () => ({
            getLockRedis: vi.fn().mockResolvedValue(mockRedis)
        }));
        
        vi.doMock('../../src/config/config.js', () => ({
            config: {
                queue: { enabled: true }
            }
        }));
    });

    it('should track joins via redis', async() => {
        const { trackJoinRedis, checkRaidPatternRedis } = await import('../../src/utils/raidDetection.js');
        
        await trackJoinRedis('guild-1', 'user-1', 'testuser', Date.now(), 30);
        const result = await checkRaidPatternRedis('guild-1', 10, 10000, Date.now());
        expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining('apollo:raid:guild-1'), 300);
        expect(result.detected).toBe(false);
    });

    it('should detect raid when threshold exceeded', async() => {
        const { checkRaidPatternRedis } = await import('../../src/utils/raidDetection.js');
        
        const now = Date.now();
        mockRedis.zremrangebyscore.mockResolvedValue(0);
        mockRedis.zcount.mockResolvedValue(15);
        mockRedis.zrange.mockResolvedValue([
            JSON.stringify({ userId: 'u1', username: 'user1', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u2', username: 'user2', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u3', username: 'user3', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u4', username: 'user4', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u5', username: 'user5', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u6', username: 'user6', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u7', username: 'user7', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u8', username: 'user8', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u9', username: 'user9', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u10', username: 'user10', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u11', username: 'user11', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u12', username: 'user12', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u13', username: 'user13', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u14', username: 'user14', timestamp: now, accountAge: 30 }),
            JSON.stringify({ userId: 'u15', username: 'user15', timestamp: now, accountAge: 30 }),
        ]);
        
        const result = await checkRaidPatternRedis('guild-1', 10, 10000, now);
        expect(result.detected).toBe(true);
    });
});
