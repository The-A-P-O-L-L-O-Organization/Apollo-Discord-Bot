// In-memory fixed-window rate limiter
// Per-instance only; not shared across pods (distributed limits are out of scope).

export default class RateLimiter {
    constructor({ limit = 60, windowMs = 60000 } = {}) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.buckets = new Map();
    }

    check(key) {
        const now = Date.now();
        let bucket = this.buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + this.windowMs };
            this.buckets.set(key, bucket);
        }
        bucket.count += 1;
        return {
            allowed: bucket.count <= this.limit,
            retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
        };
    }
}
