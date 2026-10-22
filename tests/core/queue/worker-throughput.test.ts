import { describe, expect, it } from 'vitest';
import { runQueueThroughputBenchmark } from '../../../benchmarks/queue-worker-benchmark.js';

describe('queue worker throughput benchmark', () => {
    it('reports wait, duration, throughput, failures, and peak active jobs without external services', async() => {
        const report = await runQueueThroughputBenchmark({
            concurrency: 2,
            jobsPerWorkload: 2,
            handlers: {
                command: async() => undefined,
                nsfw: async() => {
                    throw new Error('deterministic failure');
                },
                scheduled: async() => undefined,
                webhook: async() => undefined
            }
        });

        expect(report.totalJobs).toBe(8);
        expect(report.completedJobs).toBe(8);
        expect(report.failureCount).toBe(2);
        expect(report.failureRate).toBe(0.25);
        expect(report.peakActiveJobs).toBe(2);
        expect(report.throughputJobsPerSecond).toBeGreaterThan(0);
        expect(report.queueWaitMs.count).toBe(8);
        expect(report.processingDurationMs.count).toBe(8);
        expect(report.workloads).toEqual({
            command: { totalJobs: 2, failureCount: 0 },
            nsfw: { totalJobs: 2, failureCount: 2 },
            scheduled: { totalJobs: 2, failureCount: 0 },
            webhook: { totalJobs: 2, failureCount: 0 }
        });
    });
});
