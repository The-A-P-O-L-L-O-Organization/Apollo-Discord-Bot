import { performance } from 'node:perf_hooks';
import { summarizeQueueBenchmark } from '../src/queue/metrics.js';
import { createMetrics } from '../src/utils/metrics.js';

export const benchmarkWorkloads = ['command', 'nsfw', 'scheduled', 'webhook'] as const;
export type BenchmarkWorkload = typeof benchmarkWorkloads[number];
export type BenchmarkHandler = (
    workload: BenchmarkWorkload,
    jobNumber: number,
    signal: AbortSignal
) => Promise<void>;

export interface QueueBenchmarkWorkloadResult {
    totalJobs: number;
    failureCount: number;
}

export interface QueueBenchmarkReport {
    concurrency: number;
    totalJobs: number;
    completedJobs: number;
    failureCount: number;
    failureRate: number;
    throughputJobsPerSecond: number;
    peakActiveJobs: number;
    queueWaitMs: {
        count: number;
        average: number;
        p95: number;
    };
    processingDurationMs: {
        count: number;
        average: number;
        p95: number;
    };
    workloads: Record<BenchmarkWorkload, QueueBenchmarkWorkloadResult>;
}

export interface QueueBenchmarkOptions {
    concurrency: number;
    jobsPerWorkload?: number;
    handlerTimeoutMs?: number;
    handlers?: Partial<Record<BenchmarkWorkload, BenchmarkHandler>>;
}

interface BenchmarkJob {
    workload: BenchmarkWorkload;
    jobNumber: number;
    enqueuedAt: number;
}

const DEFAULT_HANDLER_TIMEOUT_MS = 5000;
const MAX_HANDLER_TIMEOUT_MS = 60000;

function percentile(values: number[], percentileValue: number): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
    return sorted[index] ?? 0;
}

function validateOptions(options: QueueBenchmarkOptions): {
    concurrency: number;
    jobsPerWorkload: number;
    handlerTimeoutMs: number;
} {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 100) {
        throw new Error('concurrency must be an integer between 1 and 100');
    }
    const jobsPerWorkload = options.jobsPerWorkload ?? 10;
    if (!Number.isInteger(jobsPerWorkload) || jobsPerWorkload < 1 || jobsPerWorkload > 10000) {
        throw new Error('jobsPerWorkload must be an integer between 1 and 10000');
    }
    const handlerTimeoutMs = options.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
    if (!Number.isInteger(handlerTimeoutMs) || handlerTimeoutMs < 1 || handlerTimeoutMs > MAX_HANDLER_TIMEOUT_MS) {
        throw new Error(`handlerTimeoutMs must be an integer between 1 and ${MAX_HANDLER_TIMEOUT_MS}`);
    }
    return { concurrency: options.concurrency, jobsPerWorkload, handlerTimeoutMs };
}

async function runHandlerWithTimeout(
    handler: BenchmarkHandler,
    workload: BenchmarkWorkload,
    jobNumber: number,
    timeoutMs: number
): Promise<void> {
    const controller = new AbortController();
    const timeoutError = new Error(`benchmark handler timed out after ${timeoutMs}ms`);
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(timeoutError);
    }, timeoutMs);
    try {
        await Promise.resolve().then(() => handler(workload, jobNumber, controller.signal));
        if (timedOut) {
            throw timeoutError;
        }
    } catch (error) {
        if (timedOut) {
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export async function runQueueThroughputBenchmark(options: QueueBenchmarkOptions): Promise<QueueBenchmarkReport> {
    const { concurrency, jobsPerWorkload, handlerTimeoutMs } = validateOptions(options);
    const metrics = createMetrics({ prefix: 'benchmark_' });
    const queue = 'benchmark';
    const jobs = benchmarkWorkloads.flatMap(workload => Array.from({ length: jobsPerWorkload }, (_, jobNumber) => ({
        workload,
        jobNumber,
        enqueuedAt: performance.now()
    })));
    const waitDurations: number[] = [];
    const processingDurations: number[] = [];
    const workloads = Object.fromEntries(benchmarkWorkloads.map(workload => [
        workload,
        { totalJobs: jobsPerWorkload, failureCount: 0 }
    ])) as Record<BenchmarkWorkload, QueueBenchmarkWorkloadResult>;
    let nextJob = 0;
    let activeJobs = 0;
    let peakActiveJobs = 0;
    let failureCount = 0;
    const startedAt = performance.now();

    for (const job of jobs) {
        metrics.recordQueueEnqueue(queue, job.workload === 'command' ? 'process-command' : `${job.workload === 'nsfw' ? 'nsfw:analyze' : job.workload === 'scheduled' ? 'scheduled-task' : 'webhook:delivery'}`);
    }

    const runNext = async(): Promise<void> => {
        const job = jobs[nextJob];
        nextJob += 1;
        if (!job) {
            return;
        }
        const jobName = job.workload === 'command'
            ? 'process-command'
            : job.workload === 'nsfw'
                ? 'nsfw:analyze'
                : job.workload === 'scheduled'
                    ? 'scheduled-task'
                    : 'webhook:delivery';
        const waitMs = Math.max(0, performance.now() - job.enqueuedAt);
        waitDurations.push(waitMs);
        metrics.recordQueueStart(queue, jobName, waitMs / 1000);
        activeJobs += 1;
        peakActiveJobs = Math.max(peakActiveJobs, activeJobs);
        const processingStartedAt = performance.now();
        let failed = false;
        try {
            await runHandlerWithTimeout(
                options.handlers?.[job.workload] ?? (async() => undefined),
                job.workload,
                job.jobNumber,
                handlerTimeoutMs
            );
        } catch {
            failed = true;
            failureCount += 1;
            workloads[job.workload].failureCount += 1;
        } finally {
            const durationMs = Math.max(0, performance.now() - processingStartedAt);
            processingDurations.push(durationMs);
            metrics.recordQueueJobDuration(queue, jobName, durationMs);
            metrics.recordQueueOutcome(queue, jobName, failed ? 'failure' : 'success');
            activeJobs -= 1;
        }
        await runNext();
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => runNext()));
    const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, Number.EPSILON);

    const summary = summarizeQueueBenchmark(jobs.length, failureCount);
    return {
        concurrency,
        totalJobs: jobs.length,
        completedJobs: summary.completedJobs,
        failureCount: summary.failureCount,
        failureRate: summary.failureRate,
        throughputJobsPerSecond: jobs.length / elapsedSeconds,
        peakActiveJobs,
        queueWaitMs: {
            count: waitDurations.length,
            average: waitDurations.reduce((sum, value) => sum + value, 0) / waitDurations.length,
            p95: percentile(waitDurations, 0.95)
        },
        processingDurationMs: {
            count: processingDurations.length,
            average: processingDurations.reduce((sum, value) => sum + value, 0) / processingDurations.length,
            p95: percentile(processingDurations, 0.95)
        },
        workloads
    };
}

function parseConcurrency(argument: string | undefined): number[] {
    const values = (argument ?? '1,4,8').split(',').map(value => Number(value.trim()));
    if (values.some(value => !Number.isInteger(value) || value < 1 || value > 100)) {
        throw new Error('--concurrency must contain integers between 1 and 100');
    }
    return values;
}

function formatReport(report: QueueBenchmarkReport): string {
    return JSON.stringify(report, null, 2);
}

async function main(): Promise<void> {
    const concurrencyArgumentIndex = process.argv.indexOf('--concurrency');
    const concurrencyArgument = concurrencyArgumentIndex >= 0 ? process.argv[concurrencyArgumentIndex + 1] : undefined;
    for (const concurrency of parseConcurrency(concurrencyArgument)) {
        const report = await runQueueThroughputBenchmark({ concurrency });
        process.stdout.write(`${formatReport(report)}\n`);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await main();
}
