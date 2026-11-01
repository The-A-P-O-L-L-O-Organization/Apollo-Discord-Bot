import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Redis as RedisType } from 'ioredis';

const workerConfigEnvKeys = [
    'WORKER_CONCURRENCY',
    'WORKER_LIMITER_MAX',
    'WORKER_LIMITER_DURATION_MS',
    'WORKER_LOCK_DURATION_MS',
    'QUEUE_ATTEMPTS',
    'QUEUE_BACKOFF_DELAY_MS'
] as const;

async function loadConfig(overrides: Partial<Record<typeof workerConfigEnvKeys[number], string>> = {}) {
    const originalEnv = process.env;
    const testEnv = { ...originalEnv };
    for (const key of workerConfigEnvKeys) {
        delete testEnv[key];
    }
    Object.assign(testEnv, overrides);
    process.env = testEnv;
    vi.resetModules();

    try {
        return (await import('../../../src/config/config.js')).config;
    } finally {
        process.env = originalEnv;
        vi.resetModules();
    }
}

describe('worker configuration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses the current worker and retry defaults', async () => {
        const config = await loadConfig();

        expect(config.queue.worker).toEqual({
            concurrency: 4,
            limiter: {
                max: 50,
                duration: 1000
            },
            lockDuration: 60000,
            retry: {
                attempts: 3,
                backoffDelay: 1000
            }
        });
    });

    it('accepts valid worker and retry overrides', async () => {
        const config = await loadConfig({
            WORKER_CONCURRENCY: '12',
            WORKER_LIMITER_MAX: '250',
            WORKER_LIMITER_DURATION_MS: '5000',
            WORKER_LOCK_DURATION_MS: '120000',
            QUEUE_ATTEMPTS: '5',
            QUEUE_BACKOFF_DELAY_MS: '2000'
        });

        expect(config.queue.worker).toEqual({
            concurrency: 12,
            limiter: {
                max: 250,
                duration: 5000
            },
            lockDuration: 120000,
            retry: {
                attempts: 5,
                backoffDelay: 2000
            }
        });
    });

    it.each([
        ['WORKER_CONCURRENCY', '0'],
        ['WORKER_LIMITER_MAX', '10001'],
        ['WORKER_LIMITER_DURATION_MS', '99'],
        ['WORKER_LOCK_DURATION_MS', '999'],
        ['QUEUE_ATTEMPTS', '0'],
        ['QUEUE_BACKOFF_DELAY_MS', '99'],
        ['WORKER_CONCURRENCY', 'not-a-number'],
        ['WORKER_LIMITER_MAX', '1.5']
    ])('rejects invalid %s=%s instead of silently defaulting', async (key, value) => {
        await expect(loadConfig({ [key]: value })).rejects.toThrow(key);
    });

    it('maps validated worker settings to BullMQ options', async () => {
        const config = await loadConfig({
            WORKER_CONCURRENCY: '8',
            WORKER_LIMITER_MAX: '75',
            WORKER_LIMITER_DURATION_MS: '2500',
            WORKER_LOCK_DURATION_MS: '90000'
        });
        const { getWorkerOptions } = await import('../../../src/worker.js');

        const options = getWorkerOptions(config.queue.worker, 'connection' as unknown as RedisType);

        expect(options).toMatchObject({
            connection: 'connection',
            concurrency: 8,
            lockDuration: 90000,
            limiter: {
                max: 75,
                duration: 2500
            }
        });
    });
});
