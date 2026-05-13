import { describe, it, expect, vi } from 'vitest';

describe('Raid detection Redis', () => {
    it('should track joins via redis', async() => {
        const { trackJoin, checkRaid } = await import('../../src/utils/raidDetection.js');
        const redis = {
            zadd: vi.fn().mockResolvedValue(1),
            zcount: vi.fn().mockResolvedValue(3),
            zremrangebyscore: vi.fn().mockResolvedValue(0),
            expire: vi.fn().mockResolvedValue(1)
        };

        await trackJoin(redis, 'guild-1', 'user-1', Date.now());
        const isRaid = await checkRaid(redis, 'guild-1', 10, 10000, Date.now());
        expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining('raid:guild-1'), 300);
        expect(isRaid).toBe(false);
    });

    it('should detect raid when threshold exceeded', async() => {
        const { checkRaid } = await import('../../src/utils/raidDetection.js');
        const redis = {
            zremrangebyscore: vi.fn().mockResolvedValue(0),
            zcount: vi.fn().mockResolvedValue(15)
        };
        const isRaid = await checkRaid(redis, 'guild-1', 10, 10000, Date.now());
        expect(isRaid).toBe(true);
    });
});
