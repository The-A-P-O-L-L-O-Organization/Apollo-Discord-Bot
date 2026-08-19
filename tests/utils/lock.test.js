import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
    acquireLock,
    releaseLock,
    withLock
} from '../../src/utils/lock.js';

// Mock Redis implementation with TTL support
class MockRedis {
    constructor() {
        this.data = new Map(); // key => {value, expires}
        this.status = 'ready';
    }
    async connect() {
        this.status = 'ready';
    }
    async quit() {
        this.status = 'closed';
    }
    set(key, value, nx, px, ttlMs) {
        const now = Date.now();
        const existing = this.data.get(key);
        if (nx && existing) {
            // check if expired
            if (!existing.expires || now < existing.expires) {
                return null; // not expired, nx fails
            }
            // expired, treat as absent
        }
        const expires = ttlMs ? now + ttlMs : null;
        this.data.set(key, { value, expires });
        return 'OK';
    }
    async eval(script, numKeys, key, owner) {
        const stored = this.data.get(key);
        if (!stored) {return 0;}
        // check expiration
        if (!stored.expires || Date.now() < stored.expires) {
            // not expired
            if (stored.value === owner) {
                this.data.delete(key);
                return 1;
            }
            return 0;
        } else {
            // expired, treat as absent
            this.data.delete(key);
            return 0;
        }
    }
}

describe('Lock Manager', () => {
    let redis;

    beforeEach(() => {
        redis = new MockRedis();
    });

    afterEach(() => {
        // no cleanup needed
    });

    it('should acquire and release lock', async() => {
        const acquired = await acquireLock(redis, 'test-lock-1', 'owner1', 5000);
        expect(acquired).toBe(true);
        
        // Try to acquire same lock - should fail
        const acquired2 = await acquireLock(redis, 'test-lock-1', 'owner2', 5000);
        expect(acquired2).toBe(false);
        
        // Release lock
        await releaseLock(redis, 'test-lock-1', 'owner1');
        
        // Should be able to acquire now
        const acquired3 = await acquireLock(redis, 'test-lock-1', 'owner2', 5000);
        expect(acquired3).toBe(true);
        
        await releaseLock(redis, 'test-lock-1', 'owner2');
    });

    it('should not release lock owned by another', async() => {
        await acquireLock(redis, 'test-lock-2', 'owner1', 5000);
        
        // Try to release with wrong owner - should not delete
        await releaseLock(redis, 'test-lock-2', 'owner2');
        
        // Lock should still be held by owner1
        const acquired = await acquireLock(redis, 'test-lock-2', 'owner3', 5000);
        expect(acquired).toBe(false);
        
        await releaseLock(redis, 'test-lock-2', 'owner1');
    });

    it('should execute function with lock', async() => {
        let counter = 0;
        
        const result = await withLock(redis, 'test-lock-3', 'owner1', async() => {
            counter++;
            // simulate async
            await new Promise(r => setTimeout(r, 10));
            counter++;
            return counter;
        }, 5000);
        
        expect(result).toBe(2);
        expect(counter).toBe(2);
    });

    it('should release lock even if function throws', async() => {
        const lockReleased = false;
        
        try {
            await withLock(redis, 'test-lock-4', 'owner1', async() => {
                throw new Error('Test error');
            }, 5000);
        } catch (e) {
            // Expected
        }
        
        // Lock should be released, so we can acquire it
        const acquired = await acquireLock(redis, 'test-lock-4', 'owner2', 5000);
        expect(acquired).toBe(true);
        
        await releaseLock(redis, 'test-lock-4', 'owner2');
    });

    it('should return false if lock not acquired', async() => {
        await acquireLock(redis, 'test-lock-5', 'owner1', 5000);
        
        const result = await withLock(redis, 'test-lock-5', 'owner2', async() => {
            return 'should not run';
        }, 100); // Short TTL
        
        expect(result).toBe(false);
        
        await releaseLock(redis, 'test-lock-5', 'owner1');
    });

    it('should handle lock expiration', async() => {
        // Acquire with very short TTL
        await acquireLock(redis, 'test-lock-6', 'owner1', 50);
        
        // Wait for expiration
        await new Promise(r => setTimeout(r, 100));
        
        // Should be able to acquire now
        const acquired = await acquireLock(redis, 'test-lock-6', 'owner2', 5000);
        expect(acquired).toBe(true);
        
        await releaseLock(redis, 'test-lock-6', 'owner2');
    });
});