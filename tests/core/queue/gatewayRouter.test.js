import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Gateway router', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should run handler inline when queue is disabled', async () => {
    const { queueOrRun } = await import('../../../src/queue/gatewayRouter.js');
    const result = await queueOrRun('test-job', { msg: 'hello' }, async (data) => {
      return { processed: data.msg };
    });
    expect(result).toEqual({ queued: false, result: { processed: 'hello' } });
  });
});
