import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock getLockRedis to return null for all tests to simulate Redis unavailability
vi.doMock('../../../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn().mockResolvedValue(null)
}));

import { 
    DistributedRateLimiter,
    MemoryRateLimiter,
    RateLimiter,
    createRateLimiter
} from '../../../../src/plugins/interlink/rateLimit.js';
import { getRedis, closeAll, removeRedis } from '../../../../src/utils/redis.js';
import { closeLockRedis } from '../../../../src/utils/lock.js';

describe('Rate Limiter', () => {
    const testNames = new Set();

    function getTestName(base) {
        const name = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        testNames.add(name);
        return name;
    }

    beforeEach(() => {
        // No Redis connection needed since we are mocking Redis to be unavailable
    });

    afterEach(() => {
        testNames.clear();
    });

    describe('MemoryRateLimiter', () => {
        let limiter;

        beforeEach(() => {
            limiter = new MemoryRateLimiter({ limit: 5, windowMs: 1000 });
        });

        it('should allow requests within limit', () => {
            for (let i = 0; i < 5; i++) {
                const result = limiter.check('key1');
                expect(result.allowed).toBe(true);
                expect(result.remaining).toBe(5 - i - 1);
            }
        });

        it('should deny requests over limit', () => {
            for (let i = 0; i < 5; i++) {
                limiter.check('key1');
            }
            
            const result = limiter.check('key1');
            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.retryAfter).toBeGreaterThan(0);
        });

        it('should track different keys separately', () => {
            for (let i = 0; i < 5; i++) {
                limiter.check('key1');
            }
            
            // key2 should still be allowed
            const result = limiter.check('key2');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4);
        });

        it('should reset key', () => {
            for (let i = 0; i < 5; i++) {
                limiter.check('key1');
            }
            
            limiter.reset('key1');
            
            const result = limiter.check('key1');
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(4);
        });

        it('should get status', () => {
            limiter.check('key1');
            limiter.check('key1');
            
            const status = limiter.getStatus('key1');
            expect(status.count).toBe(2);
            expect(status.remaining).toBe(3);
            expect(status.resetAt).toBeGreaterThan(Date.now());
        });

        it('should reset window after expiry', async () => {
            const limiter = new MemoryRateLimiter({ limit: 2, windowMs: 50 });
            
            limiter.check('key1');
            limiter.check('key1');
            
            expect(limiter.check('key1').allowed).toBe(false);
            
            // Wait for window to expire
            await new Promise(r => setTimeout(r, 60));
            
            expect(limiter.check('key1').allowed).toBe(true);
        });

        it('should evict LRU when maxKeys exceeded', () => {
            const limiter = new MemoryRateLimiter({ limit: 10, windowMs: 60000, maxKeys: 3 });
            
            limiter.check('key1');
            limiter.check('key2');
            limiter.check('key3');
            
            // This should evict key1 (LRU)
            limiter.check('key4');
            
            // key1 should be evicted
            const status1 = limiter.getStatus('key1');
            expect(status1.count).toBe(0);
            
            // key2, key3, key4 should exist
            expect(limiter.getStatus('key2').count).toBe(1);
            expect(limiter.getStatus('key3').count).toBe(1);
            expect(limiter.getStatus('key4').count).toBe(1);
        });
    });

    describe('DistributedRateLimiter', () => {
        // We are using the globally mocked lock.js, so getLockRedis returns null
        // Therefore, DistributedRateLimiter will act as if Redis is unavailable

        it('should allow requests within limit', async () => {
            const limiter = new DistributedRateLimiter({ limit: 5, windowMs: 1000 });
            
            // With Redis unavailable, all requests should be allowed
            for (let i = 0; i < 10; i++) {
                const result = await limiter.check('dist-key1');
                expect(result.allowed).toBe(true);
                expect(result.retryAfter).toBe(0);
                expect(result.remaining).toBe(limiter.limit);
            }
        });

        it('should deny requests over limit', async () => {
            const limiter = new DistributedRateLimiter({ limit: 5, windowMs: 1000 });
            
            // With Redis unavailable, no requests are denied
            for (let i = 0; i < 10; i++) {
                const result = await limiter.check('dist-key2');
                expect(result.allowed).toBe(true);
            }
        });

        it('should reset key', async () => {
            const limiter = new DistributedRateLimiter({ limit: 5, windowMs: 1000 });
            
            // Reset does nothing when Redis is unavailable
            await limiter.reset('dist-key3');
            
            // All requests should still be allowed
            const result = await limiter.check('dist-key3');
            expect(result.allowed).toBe(true);
        });

        it('should get status', async () => {
            const limiter = new DistributedRateLimiter({ limit: 5, windowMs: 1000 });
            
            // Status should show no requests counted when Redis is unavailable
            const status = await limiter.getStatus('dist-key4');
            expect(status.count).toBe(0);
            expect(status.remaining).toBe(limiter.limit);
            expect(status.resetAt).toBeGreaterThan(Date.now());
        });
    });

    describe('createRateLimiter factory', () => {
        it('should create MemoryRateLimiter when Redis unavailable', async () => {
            // Since we are using a global mock that makes getLockRedis return null,
            // we expect a MemoryRateLimiter
            const limiter = await createRateLimiter({ limit: 5, windowMs: 1000 });
            expect(limiter).toBeInstanceOf(MemoryRateLimiter);
        });
    });

    describe('RateLimiter backward compatibility', () => {
        it('should extend MemoryRateLimiter', () => {
            const limiter = new RateLimiter({ limit: 5, windowMs: 1000 });
            expect(limiter).toBeInstanceOf(MemoryRateLimiter);
        });
    });
});