import { describe, expect, it } from 'vitest';
import { createMetrics } from '../../src/utils/metrics.js';

describe('performance metrics', () => {
    it('registers bounded queue and worker signals', async() => {
        const metrics = createMetrics({ prefix: 'test_' });
        const snapshots = await metrics.register.getMetricsAsJSON();
        const names = snapshots.map(metric => metric.name);

        expect(names).toContain('test_queue_wait_seconds');
        expect(names).toContain('test_queue_job_duration_seconds');
        expect(names).toContain('test_queue_active_jobs');
        expect(names).toContain('test_queue_job_outcomes_total');
        expect(names).toContain('test_redis_operation_duration_seconds');
        expect(names).toContain('test_event_loop_delay_seconds');
        expect(names).toContain('test_worker_memory_bytes');
    });

    it('keeps performance labels bounded and free of request identifiers', async() => {
        const metrics = createMetrics({ prefix: 'test_' });
        metrics.recordQueueWait('queue:commands:123', 'process-command:job-456', 25);
        metrics.recordQueueJobDuration('queue:commands:123', 'process-command:job-456', 50);
        metrics.setQueueActive('queue:commands:123', 1);
        metrics.recordQueueOutcome('queue:commands:123', 'process-command:job-456', 'failure');
        metrics.recordRedisOperation('get', 4);
        metrics.setWorkerMemory('worker-123', 1024);

        const snapshots = await metrics.register.getMetricsAsJSON();
        const performanceMetrics = snapshots.filter(metric => metric.name?.startsWith('test_queue_') || metric.name === 'test_worker_memory_bytes');
        const labels = performanceMetrics.flatMap(metric => metric.values.map(value => value.labels));
        const serializedLabels = JSON.stringify(labels);
        expect(serializedLabels).not.toContain('123');
        expect(serializedLabels).not.toContain('456');
        expect(serializedLabels).not.toContain('job-');
        expect(serializedLabels).not.toContain('queue:commands');
        expect(serializedLabels).toContain('"queue":"commands"');
        expect(serializedLabels).toContain('"job":"process-command"');
    });
});
