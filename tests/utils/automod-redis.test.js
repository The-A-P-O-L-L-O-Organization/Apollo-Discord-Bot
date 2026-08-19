import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Automod Redis spam tracking', () => {
    let mockRedis;

    beforeEach(async() => {
        vi.resetModules();
        mockRedis = {
            zadd: vi.fn().mockResolvedValue(1),
            zcount: vi.fn().mockResolvedValue(3),
            zremrangebyscore: vi.fn().mockResolvedValue(0),
            expire: vi.fn().mockResolvedValue(1)
        };
        
        vi.doMock('../../src/utils/lock.js', () => ({
            getLockRedis: vi.fn().mockResolvedValue(mockRedis)
        }));
        
        vi.doMock('../../src/config/config.js', () => ({
            config: {
                queue: { enabled: true },
                database: { type: 'sqlite' }
            }
        }));
    });

    it('should track messages via redis sorted sets', async() => {
        const { trackMessageRedis, checkSpamRedis } = await import('../../src/utils/automod.js');
        
        await trackMessageRedis('guild-1', 'user-1', Date.now());
        const isSpam = await checkSpamRedis('guild-1', 'user-1', 5, 5000, Date.now());

        expect(mockRedis.zadd).toHaveBeenCalled();
        expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining('apollo:spam:guild-1:user-1'), 60);
        expect(mockRedis.zcount).toHaveBeenCalled();
        expect(isSpam).toBe(false);
    });

    it('should detect spam when threshold exceeded', async() => {
        const { checkSpamRedis } = await import('../../src/utils/automod.js');
        
        mockRedis.zremrangebyscore.mockResolvedValue(0);
        mockRedis.zcount.mockResolvedValue(6);
        
        const isSpam = await checkSpamRedis('guild-1', 'user-1', 5, 5000, Date.now());
        expect(isSpam).toBe(true);
    });
});
