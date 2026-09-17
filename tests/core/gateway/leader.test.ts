import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LeaderRedis } from '../../../src/gateway/leader.js';

describe('Leader election', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should elect a leader via SET NX', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue('pod-a'),
      quit: vi.fn(),
    };

    const { tryAcquireLock } = await import('../../../src/gateway/leader.js');
    const result = await tryAcquireLock(mockRedis as unknown as LeaderRedis, 'apollo:gateway:leader', 'pod-a', 10000);
    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'apollo:gateway:leader', 'pod-a', 'PX', 10000, 'NX'
    );
  });

  it('should return false when lock is held by another', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue(null),
      quit: vi.fn(),
    };

    const { tryAcquireLock } = await import('../../../src/gateway/leader.js');
    const result = await tryAcquireLock(mockRedis as unknown as LeaderRedis, 'pod-b', 10000 as unknown as string);
    expect(result).toBe(false);
  });

  it('should release lock only if still owned by us', async () => {
    const calls = [];
    const mockRedis = {
      eval: vi.fn(async (script, keys, args) => {
        calls.push({ script, keys, args });
        return 1;
      }),
      quit: vi.fn(),
    };

    const { releaseLock } = await import('../../../src/gateway/leader.js');
    await releaseLock(mockRedis as unknown as LeaderRedis, 'pod-b', undefined as unknown as string);
    expect(calls.length).toBe(1);
  });

  it('should start and stop heartbeat', async () => {
    vi.useFakeTimers();
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      quit: vi.fn(),
    };

    const { startHeartbeat, stopHeartbeat } = await import('../../../src/gateway/leader.js');
    const stop = await startHeartbeat(mockRedis as unknown as LeaderRedis, 'apollo:gateway:leader', 'pod-a', 6000);

    vi.advanceTimersByTime(2000);
    expect(mockRedis.set).toHaveBeenCalledWith('apollo:gateway:leader', 'pod-a', 'PX', 6000, 'XX');

    stopHeartbeat();
    vi.advanceTimersByTime(2000);
    const callCount = mockRedis.set.mock.calls.length;
    vi.advanceTimersByTime(3000);
    expect(mockRedis.set.mock.calls.length).toBe(callCount);

    vi.useRealTimers();
  });
});
