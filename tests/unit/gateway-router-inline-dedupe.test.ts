import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config/config.js', () => ({
    config: { queue: { enabled: false, prefix: 'apollo' } }
}));

vi.mock('../../src/queue/queue.js', () => ({
    createQueue: vi.fn(async () => ({
        add: async (jobName: string, _data: unknown): Promise<{ id: string }> => ({ id: `job-${jobName}` }),
        close: async (): Promise<void> => undefined
    }))
}));

import { config } from '../../src/config/config.js';
import { createQueue } from '../../src/queue/queue.js';
import {
    queueOrRun,
    clearInlineNonceCache,
    INLINE_NONCE_TTL
} from '../../src/queue/gatewayRouter.js';

describe('gateway router inline deduplication', () => {
    beforeEach(() => {
        clearInlineNonceCache();
        vi.clearAllMocks();
        config.queue.enabled = false;
    });

    afterEach(() => {
        vi.useRealTimers();
        config.queue.enabled = false;
    });

    it('uses a 5 minute inline nonce TTL matching BullMQ deduplication', () => {
        expect(INLINE_NONCE_TTL).toBe(300000);
    });

    it('same interaction ID twice returns duplicate on the second call', async () => {
        const handler = vi.fn(async () => ({ processed: true }));
        const data = { id: 'interaction-123', commandName: 'test' };

        const first = await queueOrRun('test', data, handler);
        expect(first).toEqual({ queued: false, result: { processed: true } });
        expect(handler).toHaveBeenCalledTimes(1);

        const second = await queueOrRun('test', data, handler);
        expect(second).toEqual({ queued: false, result: { duplicate: true } });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('different interaction IDs are both processed', async () => {
        const handler = vi.fn(async () => ({ processed: true }));

        await queueOrRun('test', { id: 'interaction-1' }, handler);
        await queueOrRun('test', { id: 'interaction-2' }, handler);

        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('uses the nested interaction id as the nonce', async () => {
        const handler = vi.fn(async () => ({ processed: true }));

        await queueOrRun('test', { interaction: { id: 'nested-1' } }, handler);
        const second = await queueOrRun('test', { interaction: { id: 'nested-1' } }, handler);

        expect(second).toEqual({ queued: false, result: { duplicate: true } });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('falls back to payload JSON for data without an id', async () => {
        const handler = vi.fn(async () => ({ processed: true }));
        const payload = { commandName: 'ping', value: 42 };

        await queueOrRun('test', payload, handler);
        const second = await queueOrRun('test', { commandName: 'ping', value: 42 }, handler);

        expect(second).toEqual({ queued: false, result: { duplicate: true } });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('TTL expiration allows re-processing after 5 minutes', async () => {
        vi.useFakeTimers();
        try {
            const handler = vi.fn(async () => ({ processed: true }));
            const data = { id: 'ttl-interaction' };

            await queueOrRun('test', data, handler);
            expect(handler).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(INLINE_NONCE_TTL + 1);

            const second = await queueOrRun('test', data, handler);
            expect(second).toEqual({ queued: false, result: { processed: true } });
            expect(handler).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('bypasses the inline cache when queue is enabled and uses BullMQ', async () => {
        config.queue.enabled = true;
        const handler = vi.fn(async () => ({ processed: true }));
        const data = { id: 'queued-interaction' };

        const first = await queueOrRun('test-job', data, handler);
        expect(createQueue).toHaveBeenCalled();
        expect(first).toEqual({ queued: true, jobId: 'job-test-job' });
        expect(handler).not.toHaveBeenCalled();

        const second = await queueOrRun('test-job', data, handler);
        expect(second).toEqual({ queued: true, jobId: 'job-test-job' });
        expect(handler).not.toHaveBeenCalled();
    });
});
