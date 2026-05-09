import { describe, it, expect } from 'vitest';

describe('Worker entry point', () => {
  it('should export a start function', async () => {
    const worker = await import('../../src/worker.js');
    expect(typeof worker.startWorker).toBe('function');
  });

  it('should export a stop function', async () => {
    const worker = await import('../../src/worker.js');
    expect(typeof worker.stopWorker).toBe('function');
  });
});
