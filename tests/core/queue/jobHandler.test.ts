import { describe, it, expect, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { JobName } from '../../../src/types/queue.js';
import { registerHandler, getHandler, handleJob, clearHandlers } from '../../../src/queue/jobHandler.js';

describe('Job handler registry', () => {
  beforeEach(() => {
    clearHandlers();
  });

  it('should register and retrieve a handler', () => {
    const fn = async (_job: Job<unknown>): Promise<unknown> => ({ processed: true });
    registerHandler('test-job' as unknown as JobName, fn);
    const retrieved = getHandler('test-job' as unknown as JobName);
    expect(retrieved).toBe(fn);
  });

  it('should throw on duplicate handler registration', () => {
    registerHandler('dup-job' as unknown as JobName, async () => {});
    expect(() => registerHandler('dup-job' as unknown as JobName, async () => {})).toThrow('already registered');
  });

  it('should execute a handler via handleJob', async () => {
    registerHandler('echo' as unknown as JobName, async (_job: Job<unknown>) => ({ received: (_job.data as { msg: string }).msg }));
    const result = await handleJob({ name: 'echo', data: { msg: 'hello' } } as unknown as Parameters<typeof handleJob>[0]);
    expect(result).toEqual({ received: 'hello' });
  });

  it('should throw for unregistered job name', async () => {
    await expect(handleJob({ name: 'no-such-job', data: {} } as unknown as Parameters<typeof handleJob>[0])).rejects.toThrow('No handler');
  });
});
