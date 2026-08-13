import { describe, it, expect, beforeEach } from 'vitest';
import RateLimiter from '../../../src/plugins/interlink/rateLimit.js';

describe('RateLimiter', () => {
    let limiter;

    beforeEach(() => {
        limiter = new RateLimiter({ limit: 2, windowMs: 1000 });
    });

    it('should allow requests up to the limit', () => {
        expect(limiter.check('1.2.3.4').allowed).toBe(true);
        expect(limiter.check('1.2.3.4').allowed).toBe(true);
    });

    it('should deny requests over the limit', () => {
        limiter.check('1.2.3.4');
        limiter.check('1.2.3.4');
        expect(limiter.check('1.2.3.4').allowed).toBe(false);
    });

    it('should track different keys independently', () => {
        limiter.check('a');
        limiter.check('a');
        expect(limiter.check('b').allowed).toBe(true);
    });

    it('should reset after the window elapses', () => {
        limiter.check('1.2.3.4');
        limiter.check('1.2.3.4');
        limiter.check('1.2.3.4');
        // Force window rollover by backdating the bucket
        const bucket = limiter.buckets.get('1.2.3.4');
        bucket.resetAt = Date.now() - 100;
        expect(limiter.check('1.2.3.4').allowed).toBe(true);
    });

    it('should expose retryAfter seconds', () => {
        const result = limiter.check('x');
        expect(result.retryAfter).toBeGreaterThanOrEqual(0);
    });
});
