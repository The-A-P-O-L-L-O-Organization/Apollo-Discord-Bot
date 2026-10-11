import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRedisInstance = {
    connect: vi.fn(),
    quit: vi.fn(),
    ping: vi.fn(),
    eval: vi.fn(),
    evalsha: vi.fn(),
    script: vi.fn(),
    status: 'ready',
    on: vi.fn(),
    options: { protocol: 2 }
};

vi.mock('ioredis', () => {
    return {
        default: class {
            options: Record<string, unknown>;
            status: string;
            on: unknown;
            connect: unknown;
            quit: unknown;
            ping: unknown;
            eval: unknown;
            evalsha: unknown;
            script: unknown;
            constructor(options: Record<string, unknown>) {
                this.options = options;
                this.status = 'ready';
                this.on = mockRedisInstance.on;
                this.connect = mockRedisInstance.connect;
                this.quit = mockRedisInstance.quit;
                this.ping = mockRedisInstance.ping;
                this.eval = mockRedisInstance.eval;
                this.evalsha = mockRedisInstance.evalsha;
                this.script = mockRedisInstance.script;
            }
        }
    };
});

vi.mock('../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn(),
    closeLockRedis: vi.fn()
}));

import { EventDedupe, isDuplicateEvent, resetSharedEventDedupe } from '../../src/utils/eventDedupe.js';
import { getLockRedis } from '../../src/utils/lock.js';

describe('EventDedupe', () => {
    let dedupe: EventDedupe;
    let mockRedis: typeof mockRedisInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        resetSharedEventDedupe();
        mockRedis = mockRedisInstance;
        mockRedis.eval.mockResolvedValue(1);

        dedupe = new EventDedupe(mockRedis as never, { ttlSeconds: 600 });
    });

    afterEach(async () => {
        await dedupe.close().catch(() => undefined);
        resetSharedEventDedupe();
        vi.restoreAllMocks();
    });

    describe('getDedupeKey', () => {
        it('should build keys with the event:dedupe: prefix', () => {
            expect(dedupe.getDedupeKey('guildBanAdd', 'g1:u1')).toBe('event:dedupe:guildBanAdd:g1:u1');
        });

        it('should use a custom prefix when provided', () => {
            const custom = new EventDedupe(mockRedis as never, { keyPrefix: 'custom:' });
            expect(custom.getDedupeKey('messageDelete', 'm1')).toBe('custom:messageDelete:m1');
        });
    });

    describe('checkAndSetEvent', () => {
        it('should return true for first delivery', async () => {
            mockRedis.eval.mockResolvedValueOnce(1);

            const result = await dedupe.checkAndSetEvent('guildBanAdd', 'g1:u1');

            expect(result).toBe(true);
            expect(mockRedis.eval).toHaveBeenCalledTimes(1);

            const call = mockRedis.eval.mock.calls[0] as unknown[];
            expect(call[1]).toBe(1);
            expect(call[2]).toBe('event:dedupe:guildBanAdd:g1:u1');
            expect(call[3]).toBe('600');
        });

        it('should return false for duplicate delivery', async () => {
            mockRedis.eval.mockResolvedValueOnce(0);

            const result = await dedupe.checkAndSetEvent('guildBanAdd', 'g1:u1');

            expect(result).toBe(false);
        });

        it('should use separate keys per event type', async () => {
            mockRedis.eval.mockResolvedValue(1);

            await dedupe.checkAndSetEvent('guildBanAdd', 'g1:u1');
            await dedupe.checkAndSetEvent('messageDelete', 'g1:u1');

            const calls = mockRedis.eval.mock.calls as unknown[][];
            expect(calls[0]?.[2]).toBe('event:dedupe:guildBanAdd:g1:u1');
            expect(calls[1]?.[2]).toBe('event:dedupe:messageDelete:g1:u1');
        });

        it('should append timestamp to the key when provided', async () => {
            mockRedis.eval.mockResolvedValueOnce(1);

            await dedupe.checkAndSetEvent('messageUpdate', 'g1:m1', 1234567890);

            const call = mockRedis.eval.mock.calls[0] as unknown[];
            expect(call[2]).toBe('event:dedupe:messageUpdate:g1:m1:1234567890');
        });

        it('should use custom TTL when provided', async () => {
            mockRedis.eval.mockResolvedValueOnce(1);

            const customTtl = new EventDedupe(mockRedis as never, { ttlSeconds: 300 });
            await customTtl.checkAndSetEvent('guildCreate', 'g1');

            const call = mockRedis.eval.mock.calls[0] as unknown[];
            expect(call[3]).toBe('300');
        });

        it('should use Lua script for atomic check-and-set', async () => {
            mockRedis.eval.mockResolvedValueOnce(1);

            await dedupe.checkAndSetEvent('voiceStateUpdate', 'g1:u1');

            const script = mockRedis.eval.mock.calls[0]?.[0] as string;
            expect(script).toContain('SET');
            expect(script).toContain('NX');
            expect(script).toContain('EX');
        });

        it('should throw on Redis connection error', async () => {
            mockRedis.eval.mockRejectedValueOnce(new Error('Redis connection failed'));

            await expect(dedupe.checkAndSetEvent('guildCreate', 'g1'))
                .rejects.toThrow('Redis connection failed');
        });

        it('should throw when closed', async () => {
            await dedupe.close();

            await expect(dedupe.checkAndSetEvent('guildCreate', 'g1'))
                .rejects.toThrow('EventDedupe is closed');
        });
    });

    describe('cleanup', () => {
        it('should return number of cleaned up keys', async () => {
            mockRedis.eval.mockResolvedValueOnce(5);

            const cleaned = await dedupe.cleanup();

            expect(cleaned).toBe(5);
        });
    });

    describe('close', () => {
        it('should close the Redis connection', async () => {
            await dedupe.close();

            expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        });

        it('should be idempotent', async () => {
            await dedupe.close();
            await dedupe.close();

            expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        });
    });

    describe('isDuplicateEvent', () => {
        it('should return false then true for repeated delivery of the same event', async () => {
            const seen = new Set<string>();
            const fakeRedis = {
                script: vi.fn(async () => 'fakesha'),
                eval: vi.fn(async (_script: string, _n: number, key: string) => {
                    if (seen.has(key)) {
                        return 0;
                    }
                    seen.add(key);
                    return 1;
                }),
                evalsha: vi.fn(async (_sha: string, _n: number, key: string) => {
                    if (seen.has(key)) {
                        return 0;
                    }
                    seen.add(key);
                    return 1;
                }),
                quit: vi.fn(async () => undefined)
            };
            vi.mocked(getLockRedis).mockResolvedValue(fakeRedis as never);

            expect(await isDuplicateEvent('messageDelete', 'g1:m1')).toBe(false);
            expect(await isDuplicateEvent('messageDelete', 'g1:m1')).toBe(true);
        });

        it('should fail open when Redis is unavailable', async () => {
            vi.mocked(getLockRedis).mockResolvedValue(null);

            expect(await isDuplicateEvent('guildCreate', 'g1')).toBe(false);
        });

        it('should fail open on Redis errors', async () => {
            const brokenRedis = {
                script: vi.fn(async () => { throw new Error('boom'); }),
                eval: vi.fn(async () => { throw new Error('boom'); }),
                evalsha: vi.fn(async () => { throw new Error('boom'); }),
                quit: vi.fn(async () => undefined)
            };
            vi.mocked(getLockRedis).mockResolvedValue(brokenRedis as never);

            expect(await isDuplicateEvent('guildCreate', 'g1')).toBe(false);
        });
    });
});
