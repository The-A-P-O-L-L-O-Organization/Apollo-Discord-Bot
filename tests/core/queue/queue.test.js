import { describe, it, expect } from 'vitest';
import { createQueue, JobNames } from '../../../src/queue/queue.js';

describe('Queue', () => {
  it('should define job names', () => {
    expect(JobNames.PROCESS_COMMAND).toBe('process-command');
    expect(JobNames.HEAVY_OPERATION).toBe('heavy-operation');
    expect(JobNames.SCHEDULED_TASK).toBe('scheduled-task');
  });

  it('should create a queue without redis when disabled', async () => {
    const q = await createQueue('test-queue', { enabled: false });
    expect(q).toBeDefined();
    expect(q.name).toBe('test-queue');
  });
});
