import { describe, expect, it } from 'vitest';
import { runQueueThroughputBenchmark } from '../../../benchmarks/queue-worker-benchmark.js';
import type { BenchmarkHandler } from '../../../benchmarks/queue-worker-benchmark.js';

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

    it('waits for timed-out handlers to settle before starting another job', async() => {
        let activeHandlers = 0;
        let peakActiveHandlers = 0;
        const handler: BenchmarkHandler = async(_workload, _jobNumber, signal) => {
            activeHandlers += 1;
            peakActiveHandlers = Math.max(peakActiveHandlers, activeHandlers);
            try {
                await new Promise<void>(resolve => {
                    const timer = setTimeout(resolve, 100);
                    signal?.addEventListener('abort', () => {
                        clearTimeout(timer);
                        resolve();
                    }, { once: true });
                });
            } finally {
                activeHandlers -= 1;
            }
        };
        const report = await runQueueThroughputBenchmark({
            concurrency: 1,
            jobsPerWorkload: 1,
            handlerTimeoutMs: 10,
            handlers: {
                command: handler,
                nsfw: handler,
                scheduled: handler,
                webhook: handler
            }
        });

        expect(report.totalJobs).toBe(4);
        expect(report.completedJobs).toBe(4);
        expect(report.failureCount).toBe(4);
        expect(report.failureRate).toBe(1);
        expect(report.peakActiveJobs).toBe(1);
        expect(peakActiveHandlers).toBe(1);
        expect(activeHandlers).toBe(0);
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
