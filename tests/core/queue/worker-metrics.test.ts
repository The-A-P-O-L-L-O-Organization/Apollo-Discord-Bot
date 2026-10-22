import { describe, expect, it } from 'vitest';
import { createMetrics } from '../../../src/utils/metrics.js';

describe('worker performance metrics', () => {
    it('records queue lifecycle outcomes with fixed labels', async() => {
        const metrics = createMetrics({ prefix: 'test_' });

        metrics.recordQueueEnqueue('commands', 'process-command');
        metrics.recordQueueStart('commands', 'process-command', 0.25);
        metrics.recordQueueJobDuration('commands', 'process-command', 1.5);
        metrics.recordQueueOutcome('commands', 'process-command', 'success');
        metrics.recordQueueOutcome('commands', 'process-command', 'retry');
        metrics.recordQueueOutcome('commands', 'process-command', 'failure');

        const snapshots = await metrics.register.getMetricsAsJSON();
        const outcomes = snapshots.find(metric => metric.name === 'test_queue_job_outcomes_total');
        expect(outcomes?.type).toBe('counter');
        expect(outcomes?.values.some(value => value.labels['queue'] === 'commands')).toBe(true);
        expect(outcomes?.values.some(value => value.labels['job'] === 'process-command')).toBe(true);
    });

    it('exposes active jobs, Redis latency, and worker memory', async() => {
        const metrics = createMetrics({ prefix: 'test_' });
        metrics.setQueueActive('commands', 2);
        metrics.recordRedisOperation('ping', 0.01);
        metrics.setWorkerMemory('worker', 1024);

        const snapshots = await metrics.register.getMetricsAsJSON();
        expect(snapshots.find(metric => metric.name === 'test_queue_active_jobs')?.type).toBe('gauge');
        expect(snapshots.find(metric => metric.name === 'test_redis_operation_duration_seconds')?.type).toBe('histogram');
        expect(snapshots.find(metric => metric.name === 'test_worker_memory_bytes')?.type).toBe('gauge');
    });
});
