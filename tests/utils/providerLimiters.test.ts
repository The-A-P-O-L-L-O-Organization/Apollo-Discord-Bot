import { describe, expect, it, vi } from 'vitest';
import { ProviderLimiterManager } from '../../src/utils/providerLimiters.js';

describe('ProviderLimiterManager', () => {
    it('bounds local provider concurrency and queue depth', async() => {
        const manager = new ProviderLimiterManager({
            redisEnabled: false,
            settings: { twitch: { maxConcurrent: 2, minTimeMs: 1, highWater: 2 } }
        });
        let active = 0;
        let peak = 0;
        const releases: Array<() => void> = [];
        const tasks = Array.from({ length: 4 }, () => manager.schedule('twitch', async() => {
            active += 1;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => releases.push(resolve));
            active -= 1;
        }));

        await vi.waitFor(() => expect(peak).toBeGreaterThan(0));
        expect(peak).toBeLessThanOrEqual(2);
        releases.splice(0, 2).forEach(resolve => resolve());
        await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
        releases.splice(0).forEach(resolve => resolve());
        await Promise.all(tasks);
        expect(peak).toBe(2);
        await manager.shutdown();
    });

    it('keeps provider settings isolated', async() => {
        const manager = new ProviderLimiterManager({ redisEnabled: false });
        expect(manager.getSettings('twitch')).not.toEqual(manager.getSettings('openai'));
        await manager.schedule('twitch', async() => undefined);
        await manager.schedule('openai', async() => undefined);
        await manager.shutdown();
    });

    it('honors a provider retry-after delay once', async() => {
        const manager = new ProviderLimiterManager({
            redisEnabled: false,
            settings: { openai: { minTimeMs: 1 } }
        });
        let attempts = 0;
        const result = await manager.schedule('openai', async() => {
            attempts += 1;
            if (attempts === 1) {
                const error = new Error('rate limited') as Error & { retryAfterMs?: number };
                error.retryAfterMs = 1;
                throw error;
            }
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(attempts).toBe(2);
        await manager.shutdown();
    });

    it('falls back to local limiting when Redis is unavailable', async() => {
        const manager = new ProviderLimiterManager({
            redisEnabled: true,
            redisFactory: () => ({
                ping: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
                quit: vi.fn().mockResolvedValue('OK')
            } as never)
        });
        await manager.schedule('github', async() => 'ok');
        expect(await manager.schedule('github', async() => 'ok')).toBe('ok');
        await manager.shutdown();
    });
});
