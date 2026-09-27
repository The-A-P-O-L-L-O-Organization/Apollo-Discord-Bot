import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
});

afterEach(() => {
    process.env = originalEnv;
});

describe('startupChecks', () => {
    describe('validateQueueHmacSecret', () => {
        it('should not throw when NODE_ENV is development', async () => {
            process.env['NODE_ENV'] = 'development';
            process.env['QUEUE_ENABLED'] = 'true';
            delete process.env['QUEUE_HMAC_SECRET'];

            const { validateQueueHmacSecret } = await import('../../src/utils/startupChecks.js');

            await expect(validateQueueHmacSecret()).resolves.not.toThrow();
        });

        it('should not throw when QUEUE_ENABLED is false in production', async () => {
            process.env['NODE_ENV'] = 'production';
            process.env['QUEUE_ENABLED'] = 'false';
            delete process.env['QUEUE_HMAC_SECRET'];

            const { validateQueueHmacSecret } = await import('../../src/utils/startupChecks.js');

            await expect(validateQueueHmacSecret()).resolves.not.toThrow();
        });

        it('should not throw when QUEUE_HMAC_SECRET is set in production', async () => {
            process.env['NODE_ENV'] = 'production';
            process.env['QUEUE_ENABLED'] = 'true';
            process.env['QUEUE_HMAC_SECRET'] = 'test-secret-123';

            const { validateQueueHmacSecret } = await import('../../src/utils/startupChecks.js');

            await expect(validateQueueHmacSecret()).resolves.not.toThrow();
        });

        it('should throw when QUEUE_HMAC_SECRET is missing in production with queue enabled', async () => {
            process.env['NODE_ENV'] = 'production';
            process.env['QUEUE_ENABLED'] = 'true';
            delete process.env['QUEUE_HMAC_SECRET'];

            const { validateQueueHmacSecret } = await import('../../src/utils/startupChecks.js');

            await expect(validateQueueHmacSecret()).rejects.toThrow('[FATAL] QUEUE_HMAC_SECRET is required in production when queue is enabled');
        });

        it('should throw with specific error message about generating secret', async () => {
            process.env['NODE_ENV'] = 'production';
            process.env['QUEUE_ENABLED'] = 'true';
            delete process.env['QUEUE_HMAC_SECRET'];

            const { validateQueueHmacSecret } = await import('../../src/utils/startupChecks.js');

            try {
                await validateQueueHmacSecret();
            } catch (error) {
                expect((error as Error).message).toContain('openssl rand -hex 32');
            }
        });
    });
});