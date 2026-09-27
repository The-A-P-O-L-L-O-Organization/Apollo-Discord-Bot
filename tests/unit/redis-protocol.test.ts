import { describe, it, expect, vi, beforeEach } from 'vitest';

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
            options: unknown;
            status: string;
            on: unknown;
            connect: unknown;
            quit: unknown;
            ping: unknown;
            constructor(options: unknown) {
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

import { createRedisClient } from '../../src/utils/redis.js';

describe('Redis protocol version', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates client with protocol: 2 for RESP2 compatibility', () => {
        const client = createRedisClient('test-client', { url: 'redis://localhost:6379' });
        expect(client.options.protocol).toBe(2);
        client.quit();
    });
});