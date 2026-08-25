import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock ioredis
const mockRedisInstance = {
    connect: vi.fn(),
    quit: vi.fn(),
    ping: vi.fn(),
    status: 'ready',
    on: vi.fn()
};

vi.mock('ioredis', () => {
    return {
        default: class {
            constructor(options) {
                this.options = options;
                this.status = 'ready';
                this.on = mockRedisInstance.on;
                this.connect = mockRedisInstance.connect;
                this.quit = mockRedisInstance.quit;
                this.ping = mockRedisInstance.ping;
            }
        }
    };
});

import { createRedisClient, closeRedisClient, checkRedisHealth, getConnectionState } from '../../src/utils/redis.js';

describe('Redis Connection Factory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async() => {
        // No global state to clean up with factory pattern
    });

    it('should create a new Redis client instance', async() => {
        const redis = createRedisClient('test-client');
        await redis.connect();
        
        expect(redis).toBeDefined();
        expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('should create separate connections for each call', async() => {
        const redis1 = createRedisClient('test-client-1');
        await redis1.connect();
        const redis2 = createRedisClient('test-client-2');
        await redis2.connect();
        
        expect(redis1).not.toBe(redis2);
        expect(mockRedisInstance.connect).toHaveBeenCalledTimes(2);
    });

    it('should track connection state', async() => {
        const redis = createRedisClient('test-state');
        await redis.connect();
        
        const state = getConnectionState(redis);
        expect(state).toBeDefined();
        expect(state.status).toBeDefined();
    });

    it('should close connections', async() => {
        const redis = createRedisClient('test-close');
        await redis.connect();
        expect(getConnectionState(redis)).toBeDefined();
        
        await closeRedisClient(redis);
        expect(mockRedisInstance.quit).toHaveBeenCalledTimes(1);
    });

    it('should handle health check', async() => {
        const redis = createRedisClient('test-health');
        await redis.connect();
        
        const health = await checkRedisHealth(redis);
        expect(health).toBe(true);
        expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should return false for unhealthy connection', async() => {
        const redis = createRedisClient('test-unhealthy');
        mockRedisInstance.ping.mockRejectedValueOnce(new Error('Connection failed'));
        
        const health = await checkRedisHealth(redis);
        expect(health).toBe(false);
    });
});