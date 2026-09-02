import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Automod Redis spam tracking', () => {
    let mockRedis;

    beforeEach(async() => {
        vi.resetModules();
        
        // Mock pipeline that collects commands and executes them
        const createPipeline = () => {
            const commands = [];
            return {
                zadd: vi.fn((...args) => { commands.push(['zadd', ...args]); return createPipeline(); }),
                zremrangebyscore: vi.fn((...args) => { commands.push(['zremrangebyscore', ...args]); return createPipeline(); }),
                zcount: vi.fn((...args) => { commands.push(['zcount', ...args]); return createPipeline(); }),
                expire: vi.fn((...args) => { commands.push(['expire', ...args]); return createPipeline(); }),
                exec: vi.fn().mockResolvedValue([
                    [null, 1], // zremrangebyscore result
                    [null, 3]  // zcount result
                ]),
                _commands: commands
            };
        };
        
        mockRedis = {
            zadd: vi.fn().mockResolvedValue(1),
            zcount: vi.fn().mockResolvedValue(3),
            zremrangebyscore: vi.fn().mockResolvedValue(0),
            expire: vi.fn().mockResolvedValue(1),
            pipeline: vi.fn(() => createPipeline())
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
        
        await trackMessageRedis('guild-1', 'user-1', Date.now(), 5000);
        const isSpam = await checkSpamRedis('guild-1', 'user-1', 5, 5000, Date.now());

        expect(mockRedis.pipeline).toHaveBeenCalled();
        const pipeline = mockRedis.pipeline.mock.results[0].value;
        expect(pipeline.zadd).toHaveBeenCalled();
        expect(pipeline.expire).toHaveBeenCalled();
        expect(pipeline.exec).toHaveBeenCalled();
        // TTL = interval (5000ms) + 60000ms buffer = 65000ms = 65 seconds
        expect(pipeline.expire).toHaveBeenCalledWith(expect.stringContaining('apollo:spam:guild-1:user-1'), 65);
        expect(isSpam).toBe(false);
    });

    it('should detect spam when threshold exceeded', async() => {
        // Need to re-setup mock with proper pipeline for this test
        vi.resetModules();
        
        const createPipeline2 = () => {
            return {
                zadd: vi.fn().mockReturnThis(),
                zremrangebyscore: vi.fn().mockReturnThis(),
                zcount: vi.fn().mockReturnThis(),
                expire: vi.fn().mockReturnThis(),
                exec: vi.fn().mockResolvedValue([
                    [null, 0], // zremrangebyscore result
                    [null, 6]  // zcount result (6 >= 5 threshold = spam)
                ])
            };
        };
        
        const mockRedis2 = {
            pipeline: vi.fn(() => createPipeline2())
        };
        
        vi.doMock('../../src/utils/lock.js', () => ({
            getLockRedis: vi.fn().mockResolvedValue(mockRedis2)
        }));
        
        vi.doMock('../../src/config/config.js', () => ({
            config: {
                queue: { enabled: true },
                database: { type: 'sqlite' }
            }
        }));
        
        const { checkSpamRedis } = await import('../../src/utils/automod.js');
        
        const isSpam = await checkSpamRedis('guild-1', 'user-1', 5, 5000, Date.now());
        expect(isSpam).toBe(true);
    });
});
