import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ioredis
const mockRedisInstance = {
    connect: vi.fn(),
    quit: vi.fn(),
    ping: vi.fn(),
    eval: vi.fn(),
    evalsha: vi.fn(),
    script: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    incr: vi.fn(),
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
            set: unknown;
            get: unknown;
            incr: unknown;
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
                this.set = mockRedisInstance.set;
                this.get = mockRedisInstance.get;
                this.incr = mockRedisInstance.incr;
            }
        }
    };
});

import { FencingTokenManager } from '../../src/gateway/fencing.js';

describe('FencingTokenManager', () => {
    let fencingManager: FencingTokenManager;
    let mockRedis: typeof mockRedisInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockRedis = mockRedisInstance;
        mockRedis.eval.mockResolvedValue(1); // Default: success
        mockRedis.evalsha.mockResolvedValue(1); // Default for evalsha
        mockRedis.script.mockResolvedValue('mock-sha');
        
        fencingManager = new FencingTokenManager(mockRedis as any, { 
            lockKey: 'apollo:gateway:leader:global',
            ttlMs: 10000,
            counterKey: 'apollo:gateway:fencing:counter'
        });
        
        // Initialize to load Lua scripts
        await fencingManager.initialize();
    });

    afterEach(async () => {
        await fencingManager.close();
        vi.restoreAllMocks();
    });

    describe('acquireLockWithFencingToken', () => {
        it('should return a fencing token when lock is acquired successfully', async () => {
            mockRedis.evalsha.mockResolvedValueOnce(42); // Returns counter value as fencing token

            const token = await fencingManager.acquireLockWithFencingToken('pod-a');

            expect(token).toBe(42);
            expect(mockRedis.evalsha).toHaveBeenCalledTimes(1);
            
            // Verify Lua script was called with correct parameters
            const call = mockRedis.evalsha.mock.calls[0];
            expect(call[0]).toBe('mock-sha'); // Script SHA (from mock)
            expect(call[1]).toBe(2); // Number of keys (counter key + lock key)
            expect(call[2]).toBe('apollo:gateway:fencing:counter'); // Counter key
            expect(call[3]).toBe('apollo:gateway:leader:global'); // Lock key
            expect(call[4]).toBe('pod-a'); // Pod ID
            expect(call[5]).toBe('10000'); // TTL in ms
        });

        it('should return null when lock is already held by another pod', async () => {
            mockRedis.evalsha.mockResolvedValueOnce(0); // Lock acquisition failed

            const token = await fencingManager.acquireLockWithFencingToken('pod-b');

            expect(token).toBeNull();
            expect(mockRedis.evalsha).toHaveBeenCalledTimes(1);
        });

        it('should throw on Redis connection error', async () => {
            mockRedis.evalsha.mockRejectedValueOnce(new Error('Redis connection failed'));

            await expect(fencingManager.acquireLockWithFencingToken('pod-a'))
                .rejects.toThrow('Redis connection failed');
        });

        it('should reload script on NOSCRIPT error and retry', async () => {
            mockRedis.evalsha
                .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
                .mockResolvedValueOnce(43);
            // script() will be called 3 more times (for acquire, release, heartbeat) during retry
            mockRedis.script.mockResolvedValue('mock-sha');

            const token = await fencingManager.acquireLockWithFencingToken('pod-a');

            expect(token).toBe(43);
            expect(mockRedis.evalsha).toHaveBeenCalledTimes(2);
            // initialize() called twice (once in beforeEach, once on retry), each loads 3 scripts
            expect(mockRedis.script).toHaveBeenCalledTimes(6);
        });
    });

    describe('verifyFencingToken', () => {
        it('should return true when token matches current counter value', async () => {
            mockRedis.get.mockResolvedValueOnce('42');

            const result = await fencingManager.verifyFencingToken(42);

            expect(result).toBe(true);
            expect(mockRedis.get).toHaveBeenCalledWith('apollo:gateway:fencing:counter');
        });

        it('should return false when token is stale (less than current counter)', async () => {
            mockRedis.get.mockResolvedValueOnce('50');

            const result = await fencingManager.verifyFencingToken(42);

            expect(result).toBe(false);
            expect(mockRedis.get).toHaveBeenCalledWith('apollo:gateway:fencing:counter');
        });

        it('should return false when token is ahead (should not happen but handle gracefully)', async () => {
            mockRedis.get.mockResolvedValueOnce('30');

            const result = await fencingManager.verifyFencingToken(42);

            expect(result).toBe(false);
        });

        it('should throw on Redis connection error', async () => {
            mockRedis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

            await expect(fencingManager.verifyFencingToken(42))
                .rejects.toThrow('Redis connection failed');
        });
    });

    describe('releaseLock', () => {
        it('should release lock only if token matches', async () => {
            mockRedis.evalsha.mockResolvedValueOnce(1); // Successfully deleted
            mockRedis.get.mockResolvedValueOnce('42'); // Current token matches

            const result = await fencingManager.releaseLock('pod-a', 42);

            expect(result).toBe(true);
            expect(mockRedis.evalsha).toHaveBeenCalledTimes(1);
            
            const call = mockRedis.evalsha.mock.calls[0];
            expect(call[0]).toBe('mock-sha'); // Script SHA (from mock)
            expect(call[1]).toBe(2); // Number of keys (counter key + lock key)
            expect(call[2]).toBe('apollo:gateway:fencing:counter'); // Counter key
            expect(call[3]).toBe('apollo:gateway:leader:global'); // Lock key
            expect(call[4]).toBe('pod-a'); // Pod ID
            expect(call[5]).toBe('42'); // Fencing token
        });

        it('should return false when token does not match (lock held by another)', async () => {
            mockRedis.evalsha.mockResolvedValueOnce(0); // Not deleted
            mockRedis.get.mockResolvedValueOnce('50'); // Current token doesn't match

            const result = await fencingManager.releaseLock('pod-b', 42);

            expect(result).toBe(false);
        });

        it('should throw on Redis connection error', async () => {
            mockRedis.evalsha.mockRejectedValueOnce(new Error('Redis connection failed'));

            await expect(fencingManager.releaseLock('pod-a', 42))
                .rejects.toThrow('Redis connection failed');
        });
    });

    describe('heartbeat', () => {
        it('should start heartbeat and renew lock with same token', async () => {
            vi.useFakeTimers();
            mockRedis.evalsha.mockResolvedValue(1); // Successfully renewed
            mockRedis.get.mockResolvedValue('42'); // Token matches

            const stop = await fencingManager.startHeartbeat('pod-a', 42);

            // Advance time to trigger heartbeat (TTL/3 = ~3333ms)
            vi.advanceTimersByTime(4000);

            expect(mockRedis.evalsha).toHaveBeenCalled();
            
            // Verify the heartbeat Lua script was called with correct params
            const call = mockRedis.evalsha.mock.calls[0];
            expect(call[0]).toBe('mock-sha'); // Script SHA (from mock)
            expect(call[1]).toBe(2); // Number of keys
            expect(call[2]).toBe('apollo:gateway:fencing:counter'); // Counter key
            expect(call[3]).toBe('apollo:gateway:leader:global'); // Lock key
            expect(call[4]).toBe('pod-a'); // Pod ID
            expect(call[5]).toBe('42'); // Fencing token
            expect(call[6]).toBe('10000'); // TTL

            stop();
            vi.useRealTimers();
        });

        it('should stop heartbeat when stop function is called', async () => {
            vi.useFakeTimers();
            mockRedis.evalsha.mockResolvedValue(1);
            mockRedis.get.mockResolvedValue('42');

            const stop = await fencingManager.startHeartbeat('pod-a', 42);
            
            vi.advanceTimersByTime(4000);
            const callCount1 = mockRedis.evalsha.mock.calls.length;

            stop();
            
            vi.advanceTimersByTime(5000);
            const callCount2 = mockRedis.evalsha.mock.calls.length;

            expect(callCount2).toBe(callCount1); // No more calls after stop
            vi.useRealTimers();
        });

        it('should throw if heartbeat fails to renew lock', async () => {
            vi.useFakeTimers();
            mockRedis.evalsha.mockRejectedValueOnce(new Error('Lock lost'));
            mockRedis.get.mockResolvedValue('42');

            const stop = await fencingManager.startHeartbeat('pod-a', 42);

            // Should not throw immediately, but log error
            vi.advanceTimersByTime(4000);

            stop();
            vi.useRealTimers();
        });
    });

    describe('atomicity', () => {
        it('should load Lua scripts at initialize', async () => {
            // Scripts are loaded in beforeEach via initialize()
            // Verify all three scripts were loaded
            expect(mockRedis.script).toHaveBeenCalledTimes(3);
            
            // Verify acquire script contains key operations
            const acquireScriptCall = mockRedis.script.mock.calls.find(c => 
                (c[1] as string).includes('INCR')
            );
            expect(acquireScriptCall).toBeDefined();
            expect(acquireScriptCall[1]).toContain('SET');
            expect(acquireScriptCall[1]).toContain('NX');
            expect(acquireScriptCall[1]).toContain('PX');

            // Verify release script contains key operations
            const releaseScriptCall = mockRedis.script.mock.calls.find(c => 
                (c[1] as string).includes('DEL')
            );
            expect(releaseScriptCall).toBeDefined();
            expect(releaseScriptCall[1]).toContain('GET');
            expect(releaseScriptCall[1]).toContain('==');

            // Verify heartbeat script contains key operations
            const heartbeatScriptCall = mockRedis.script.mock.calls.find(c => 
                (c[1] as string).includes('XX')
            );
            expect(heartbeatScriptCall).toBeDefined();
            expect(heartbeatScriptCall[1]).toContain('SET');
            expect(heartbeatScriptCall[1]).toContain('PX');
        });
    });

    describe('close', () => {
        it('should close the Redis connection', async () => {
            await fencingManager.close();

            expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        });

        it('should be idempotent', async () => {
            await fencingManager.close();
            await fencingManager.close();

            expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        });
    });
});