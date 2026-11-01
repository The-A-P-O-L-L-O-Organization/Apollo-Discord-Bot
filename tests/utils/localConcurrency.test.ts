import { describe, expect, it } from 'vitest';
import { createLocalLimiter } from '../../src/utils/localConcurrency.js';

describe('local concurrency limiter', () => {
    it('does not run more than the configured number of tasks at once', async() => {
        const limiter = createLocalLimiter('twitch', 2);
        let active = 0;
        let maximum = 0;
        const release: Array<() => void> = [];

        const tasks = Array.from({ length: 5 }, (_, index) => limiter.run(async() => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise<void>((resolve) => {
                release[index] = resolve;
            });
            active -= 1;
            return index;
        }));

        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(maximum).toBe(2);
        expect(limiter.activeCount).toBe(2);
        expect(limiter.pendingCount).toBe(3);

        release[0]?.();
        release[1]?.();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        release[2]?.();
        release[3]?.();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        release[4]?.();

        await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4]);
    });

    it('isolates rejected tasks from unrelated work', async() => {
        const limiter = createLocalLimiter('rss', 2);
        const results = await Promise.allSettled([
            limiter.run(async() => {
                throw new Error('failed task');
            }),
            limiter.run(async() => 'successful task')
        ]);

        expect(results[0]?.status).toBe('rejected');
        expect(results[1]).toEqual({ status: 'fulfilled', value: 'successful task' });
    });

    it('rejects new work after shutdown', async() => {
        const limiter = createLocalLimiter('youtube', 1);
        limiter.shutdown();

        await expect(limiter.run(async() => 'not accepted')).rejects.toThrow('youtube limiter is shut down');
    });

    it('rejects queued work when shutting down', async() => {
        const limiter = createLocalLimiter('rss', 1);
        let resolveActive!: () => void;
        const activeGate = new Promise<void>((resolve) => { resolveActive = resolve; });
        const active = limiter.run(async() => activeGate);
        const queued = limiter.run(async() => 'not started');

        await Promise.resolve();
        limiter.shutdown();

        await expect(queued).rejects.toThrow('rss limiter is shut down');
        resolveActive();
        await expect(active).resolves.toBeUndefined();
    });
});
