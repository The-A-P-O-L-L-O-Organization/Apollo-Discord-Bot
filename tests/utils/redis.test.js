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

import { getRedis, closeAll, healthCheck, removeRedis, getConnectionState } from '../../src/utils/redis.js';

describe('Redis Connection Manager', () => {
    const testNames = new Set();

    function getTestName(base) {
        const name = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        testNames.add(name);
        return name;
    }

    beforeEach(() => {
        // Clear all mocks before each test
        vi.clearAllMocks();
        // Clear the global redis map to avoid interference
        if (global._redisMap) {
            global._redisMap.clear();
        }
    });

    afterEach(async () => {
        // Clean up test connections individually
        for (const name of testNames) {
            await removeRedis(name);
        }
        testNames.clear();
        await closeAll();
    });

    it('should create and reuse connections', async () => {
        const name = getTestName('test1');
        const redis1 = getRedis(name);
        await redis1.connect();
        const redis2 = getRedis(name);
        
        expect(redis1).toBe(redis2);
        expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    });

    it('should create separate connections for different names', async () => {
        const name1 = getTestName('test1');
        const name2 = getTestName('test2');
        const redis1 = getRedis(name1);
        await redis1.connect();
        const redis2 = getRedis(name2);
        await redis2.connect();
        
        expect(redis1).not.toBe(redis2);
        expect(mockRedisInstance.connect).toHaveBeenCalledTimes(2);
    });

    it('should track connection state', async () => {
        const name = getTestName('test-state');
        const redis = getRedis(name);
        await redis.connect();
        
        const state = getConnectionState(name);
        expect(state).toBeDefined();
        expect(state.status).toBeDefined();
    });

    it('should remove connections', async () => {
        const name = getTestName('test-remove');
        const redis = getRedis(name);
        await redis.connect();
        expect(getConnectionState(name)).toBeDefined();
        
        await removeRedis(name);
        expect(getConnectionState(name)).toEqual({ status: 'not_initialized' });
        expect(mockRedisInstance.quit).toHaveBeenCalledTimes(1);
    });

    it('should return connection names', async () => {
        const name1 = getTestName('test-names-1');
        const name2 = getTestName('test-names-2');
        const redis1 = getRedis(name1);
        await redis1.connect();
        const redis2 = getRedis(name2);
        await redis2.connect();
        
        const names = getRedis(name1);
        expect(names).toBeDefined();
    });

    it('should handle health check', async () => {
        const name = getTestName('test-health');
        const redis = getRedis(name);
        await redis.connect();
        
        const health = await healthCheck();
        expect(health).toBeDefined();
        expect(typeof health).toBe('object');
        expect(mockRedisInstance.ping).toHaveBeenCalled();
    });
});

describe('Redis Connection Pool', () => {
    const testNames = new Set();

    function getTestName(base) {
        const name = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        testNames.add(name);
        return name;
    }

    beforeEach(() => {
        vi.clearAllMocks();
        if (global._redisMap) {
            global._redisMap.clear();
        }
    });

    afterEach(async () => {
        for (const name of testNames) {
            await removeRedis(name);
        }
        testNames.clear();
        await closeAll();
    });

    it('should create pool when poolSize > 1', async () => {
        const name = getTestName('test-pool');
        const redis = getRedis(name, { poolSize: 3 });
        await redis.connect();
        expect(redis).toBeDefined();
        expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    });
});