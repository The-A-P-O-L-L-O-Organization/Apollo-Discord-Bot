import { describe, it, expect, beforeEach } from 'vitest';
import { registerHandler, getHandler, handleJob, clearHandlers } from '../../../src/queue/jobHandler.js';

describe('Job handler registry', () => {
  beforeEach(() => {
    clearHandlers();
  });

  it('should register and retrieve a handler', () => {
    const fn = async (job) => ({ processed: true });
    registerHandler('test-job', fn);
    const retrieved = getHandler('test-job');
    expect(retrieved).toBe(fn);
  });

  it('should throw on duplicate handler registration', () => {
    registerHandler('dup-job', async () => {});
    expect(() => registerHandler('dup-job', async () => {})).toThrow('already registered');
  });

  it('should execute a handler via handleJob', async () => {
    registerHandler('echo', async (job) => ({ received: job.data.msg }));
    const result = await handleJob({ name: 'echo', data: { msg: 'hello' } });
    expect(result).toEqual({ received: 'hello' });
  });

  it('should throw for unregistered job name', async () => {
    await expect(handleJob({ name: 'no-such-job', data: {} })).rejects.toThrow('No handler');
  });
});
