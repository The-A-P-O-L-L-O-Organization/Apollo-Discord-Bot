import { describe, it, expect, vi } from 'vitest';

describe('Automod Redis spam tracking', () => {
  it('should track messages via redis sorted sets', async () => {
    const { trackMessage, checkSpamRedis } = await import('../../src/utils/automod.js');
    const redis = {
      zadd: vi.fn().mockResolvedValue(1),
      zcount: vi.fn().mockResolvedValue(3),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      expire: vi.fn().mockResolvedValue(1),
    };

    await trackMessage(redis, 'guild-1', 'user-1', Date.now());
    const isSpam = await checkSpamRedis(redis, 'guild-1', 'user-1', 5, 5000, Date.now());

    expect(redis.zadd).toHaveBeenCalled();
    expect(redis.expire).toHaveBeenCalledWith(expect.stringContaining('spam:guild-1:user-1'), 60);
    expect(redis.zcount).toHaveBeenCalled();
    expect(isSpam).toBe(false);
  });

  it('should detect spam when threshold exceeded', async () => {
    const { checkSpamRedis } = await import('../../src/utils/automod.js');
    const redis = {
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zcount: vi.fn().mockResolvedValue(6),
    };

    const isSpam = await checkSpamRedis(redis, 'guild-1', 'user-1', 5, 5000, Date.now());
    expect(isSpam).toBe(true);
  });
});
