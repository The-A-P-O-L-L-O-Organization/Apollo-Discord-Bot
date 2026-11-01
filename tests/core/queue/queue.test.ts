import { describe, it, expect } from 'vitest';
import { createQueue, getQueueDefaultJobOptions, JobNames } from '../../../src/queue/queue.js';

describe('Queue', () => {
  it('should define job names', () => {
    expect(JobNames.PROCESS_COMMAND).toBe('process-command');
    expect(JobNames.HEAVY_OPERATION).toBe('heavy-operation');
    expect(JobNames.SCHEDULED_TASK).toBe('scheduled-task');
    expect(JobNames.NSFW_ANALYZE).toBe('nsfw:analyze');
  });

  it('should preserve default retry settings', () => {
    expect(getQueueDefaultJobOptions().attempts).toBe(3);
    expect(getQueueDefaultJobOptions().backoff).toEqual({ type: 'exponential', delay: 1000 });
    expect(getQueueDefaultJobOptions().removeOnFail).toEqual({ age: 86400, count: 1000 });
  });

  it('should apply configured retry settings without changing failure retention', () => {
    const options = getQueueDefaultJobOptions({
      concurrency: 8,
      limiter: { max: 75, duration: 2500 },
      lockDuration: 90000,
      retry: { attempts: 5, backoffDelay: 2000 }
    });

    expect(options.attempts).toBe(5);
    expect(options.backoff).toEqual({ type: 'exponential', delay: 2000 });
    expect(options.removeOnFail).toEqual({ age: 86400, count: 1000 });
  });

  it('should create a queue without redis when disabled', async () => {
    const q = await createQueue('test-queue', { enabled: false } as unknown as Parameters<typeof createQueue>[1]);
    expect(q).toBeDefined();
    expect(q.name).toBe('test-queue');
  });
});
