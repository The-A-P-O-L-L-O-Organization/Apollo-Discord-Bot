import { describe, it, expect, vi } from 'vitest';

describe('Lock Redis connection', () => {
    it('should return null when queue is disabled', async() => {
        vi.doMock('../../src/config/config.js', () => ({
            config: { queue: { enabled: false } }
        }));
        const { getLockRedis } = await import('../../src/utils/lock.js');
        const result = await getLockRedis();
        expect(result).toBeNull();
    });

    it('should return null when ioredis import fails', async() => {
        vi.doMock('../../src/config/config.js', () => ({
            config: { queue: { enabled: true, redis: { host: 'localhost', port: 6379 } } }
        }));
        vi.doMock('ioredis', () => ({ Redis: undefined }));
        const { getLockRedis } = await import('../../src/utils/lock.js');
        const result = await getLockRedis();
        expect(result).toBeNull();
    });


});
