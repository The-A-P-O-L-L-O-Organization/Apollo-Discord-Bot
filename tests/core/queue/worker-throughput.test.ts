import { describe, expect, it } from 'vitest';
import { runQueueThroughputBenchmark } from '../../../benchmarks/queue-worker-benchmark.js';

function delay(milliseconds: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}

describe('queue worker throughput benchmark', () => {
    it('reports wait, duration, throughput, failures, and peak active jobs without external services', async() => {
        const report = await runQueueThroughputBenchmark({
            concurrency: 2,
            jobsPerWorkload: 2,
            handlerTimeoutMs: 1000,
            handlers: {
                command: async() => {
                    await delay(5);
                },
                nsfw: async() => {
                    await delay(5);
                    throw new Error('deterministic failure');
                },
                scheduled: async() => {
                    await delay(5);
                },
                webhook: async() => {
                    await delay(5);
                }
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
        const timingValues = [
            report.throughputJobsPerSecond,
            report.queueWaitMs.average,
            report.queueWaitMs.p95,
            report.processingDurationMs.average,
            report.processingDurationMs.p95
        ];
        for (const value of timingValues) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
        }
        expect(report.queueWaitMs.p95).toBeGreaterThan(report.queueWaitMs.average);
        expect(report.processingDurationMs.average).toBeGreaterThan(0);
        expect(report.processingDurationMs.p95).toBeGreaterThanOrEqual(report.processingDurationMs.average);
        expect(report.workloads).toEqual({
            command: { totalJobs: 2, failureCount: 0 },
            nsfw: { totalJobs: 2, failureCount: 2 },
            scheduled: { totalJobs: 2, failureCount: 0 },
            webhook: { totalJobs: 2, failureCount: 0 }
        });
    });

    it('reports handlers that exceed the timeout as failures', async() => {
        const report = await runQueueThroughputBenchmark({
            concurrency: 4,
            jobsPerWorkload: 1,
            handlerTimeoutMs: 10,
            handlers: {
                command: () => new Promise<void>(() => undefined)
            }
        });

        expect(report.totalJobs).toBe(4);
        expect(report.completedJobs).toBe(4);
        expect(report.failureCount).toBe(1);
        expect(report.failureRate).toBe(0.25);
        expect(report.workloads.command.failureCount).toBe(1);
        expect(report.processingDurationMs.average).toBeGreaterThan(0);
        expect(Number.isFinite(report.processingDurationMs.p95)).toBe(true);
    });

    it('rejects unbounded or invalid handler timeouts', async() => {
        await expect(runQueueThroughputBenchmark({
            concurrency: 1,
            handlerTimeoutMs: 0
        })).rejects.toThrow('handlerTimeoutMs must be an integer');
        await expect(runQueueThroughputBenchmark({
            concurrency: 1,
            handlerTimeoutMs: 60001
        })).rejects.toThrow('handlerTimeoutMs must be an integer');
    });
});
