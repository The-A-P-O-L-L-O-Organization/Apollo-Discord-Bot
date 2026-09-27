import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ioredis
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

import { NonceStore } from '../../src/queue/nonceStore.js';

describe('NonceStore (Redis-backed)', () => {
    let nonceStore: NonceStore;
    let mockRedis: typeof mockRedisInstance;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRedis = mockRedisInstance;
        mockRedis.eval.mockResolvedValue(1); // Default: success (nonce was set)
        
        nonceStore = new NonceStore(mockRedis as any, { ttlSeconds: 600 });
    });

    afterEach(async () => {
        await nonceStore.close();
        vi.restoreAllMocks();
    });

    describe('checkAndSet', () => {
        it('should return true when nonce is set successfully (first time)', async () => {
            mockRedis.eval.mockResolvedValueOnce(1);
            
            const result = await nonceStore.checkAndSet('test-nonce-1', 1234567890);
            
            expect(result).toBe(true);
            expect(mockRedis.eval).toHaveBeenCalledTimes(1);
            
            // Verify Lua script was called with correct parameters
            const call = mockRedis.eval.mock.calls[0];
            expect(call[0]).toBeDefined(); // Lua script
            expect(call[1]).toBe(1); // Number of keys
            expect(call[2]).toBe('nonce:test-nonce-1:1234567890'); // Key
            expect(call[3]).toBe('600'); // TTL
        });

        it('should return false when nonce already exists (replay attack)', async () => {
            mockRedis.eval.mockResolvedValueOnce(0); // NX failed - key already exists
            
            const result = await nonceStore.checkAndSet('test-nonce-2', 1234567890);
            
            expect(result).toBe(false);
            expect(mockRedis.eval).toHaveBeenCalledTimes(1);
        });

        it('should use custom TTL when provided', async () => {
            mockRedis.eval.mockResolvedValueOnce(1);
            
            const customTtlStore = new NonceStore(mockRedis as any, { ttlSeconds: 300 });
            await customTtlStore.checkAndSet('test-nonce-3', 1234567890);
            
            const call = mockRedis.eval.mock.calls[0];
            expect(call[3]).toBe('300'); // Custom TTL
        });

        it('should throw on Redis connection error', async () => {
            mockRedis.eval.mockRejectedValueOnce(new Error('Redis connection failed'));
            
            await expect(nonceStore.checkAndSet('test-nonce-4', 1234567890))
                .rejects.toThrow('Redis connection failed');
        });
    });

    describe('cleanup', () => {
        it('should return number of cleaned up keys', async () => {
            mockRedis.eval.mockResolvedValueOnce(5); // 5 keys cleaned up
            
            const cleaned = await nonceStore.cleanup();
            
            expect(cleaned).toBe(5);
            expect(mockRedis.eval).toHaveBeenCalledTimes(1);
            
            // Verify cleanup Lua script was called
            const call = mockRedis.eval.mock.calls[0];
            expect(call[0]).toBeDefined(); // Lua script
        });

        it('should throw on Redis connection error during cleanup', async () => {
            mockRedis.eval.mockRejectedValueOnce(new Error('Redis connection failed'));
            
            await expect(nonceStore.cleanup())
                .rejects.toThrow('Redis connection failed');
        });
    });

    describe('close', () => {
        it('should close the Redis connection', async () => {
            await nonceStore.close();
            
            expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        });

        it('should be idempotent', async () => {
            await nonceStore.close();
            await nonceStore.close();
            
            expect(mockRedis.quit).toHaveBeenCalledTimes(1);
        });
    });

    describe('atomicity', () => {
        it('should use Lua script for atomic check-and-set', async () => {
            mockRedis.eval.mockResolvedValueOnce(1);
            
            await nonceStore.checkAndSet('atomic-test', 999);
            
            // Verify the Lua script does atomic SET NX EX
            const script = mockRedis.eval.mock.calls[0][0] as string;
            expect(script).toContain('SET');
            expect(script).toContain('NX');
            expect(script).toContain('EX');
            expect(script).toContain('return');
        });
    });
});