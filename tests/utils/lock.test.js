import { describe, it, expect, vi } from 'vitest';

describe('Distributed lock', () => {
    it('should acquire lock via SET NX', async() => {
        const { acquireLock } = await import('../../src/utils/lock.js');
        const redis = { set: vi.fn().mockResolvedValue('OK') };
        const result = await acquireLock(redis, 'test:lock', 'pod-a', 5000);
        expect(result).toBe(true);
        expect(redis.set).toHaveBeenCalledWith('apollo:lock:test:lock', 'pod-a', 'NX', 'PX', 5000);
    });

    it('should return false when lock is held', async() => {
        const { acquireLock } = await import('../../src/utils/lock.js');
        const redis = { set: vi.fn().mockResolvedValue(null) };
        const result = await acquireLock(redis, 'test:lock', 'pod-a', 5000);
        expect(result).toBe(false);
    });

    it('should release lock with lua script', async() => {
        const { releaseLock } = await import('../../src/utils/lock.js');
        const redis = { eval: vi.fn().mockResolvedValue(1) };
        await releaseLock(redis, 'test:lock', 'pod-a');
        expect(redis.eval).toHaveBeenCalled();
    });

    it('should execute callback under lock via withLock', async() => {
        const { withLock } = await import('../../src/utils/lock.js');
        const redis = {
            set: vi.fn().mockResolvedValue('OK'),
            eval: vi.fn().mockResolvedValue(1)
        };
        const fn = vi.fn().mockResolvedValue('done');
        const result = await withLock(redis, 'test:lock', 'pod-a', fn, 5000);
        expect(result).toBe('done');
        expect(fn).toHaveBeenCalledOnce();
    });

    it('should release lock when callback throws', async() => {
        const { withLock } = await import('../../src/utils/lock.js');
        const redis = {
            set: vi.fn().mockResolvedValue('OK'),
            eval: vi.fn().mockResolvedValue(1)
        };
        const fn = vi.fn().mockRejectedValue(new Error('callback error'));
        await expect(withLock(redis, 'test:lock', 'pod-a', fn, 5000)).rejects.toThrow('callback error');
        expect(redis.eval).toHaveBeenCalled();
    });

    it('should skip callback when lock is not acquired', async() => {
        const { withLock } = await import('../../src/utils/lock.js');
        const redis = { set: vi.fn().mockResolvedValue(null) };
        const fn = vi.fn();
        const result = await withLock(redis, 'test:lock', 'pod-a', fn, 5000);
        expect(result).toBe(false);
        expect(fn).not.toHaveBeenCalled();
    });
});
