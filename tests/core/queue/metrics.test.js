import { describe, it, expect } from 'vitest';
import { getQueueMetrics, MetricsNames } from '../../../src/queue/metrics.js';

describe('Queue metrics', () => {
  it('should define metric names', () => {
    expect(MetricsNames.QUEUE_WAITING).toBe('apollo_queue_waiting');
    expect(MetricsNames.QUEUE_ACTIVE).toBe('apollo_queue_active');
    expect(MetricsNames.QUEUE_FAILED).toBe('apollo_queue_failed');
  });

  it('should return zero metrics when queue is disabled', async () => {
    const metrics = await getQueueMetrics({ enabled: false });
    expect(metrics.waiting).toBe(0);
    expect(metrics.active).toBe(0);
  });
});
