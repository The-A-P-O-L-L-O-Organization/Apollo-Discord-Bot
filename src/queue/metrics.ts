// Queue Metrics - TypeScript migration

import { logger } from '../utils/logger.js';
import { performance } from 'node:perf_hooks';
import type { ApolloConfig } from '../types/config.js';
import {
    recordQueueEnqueue,
    recordQueueJobDuration,
    recordQueueOutcome,
    recordQueueWait,
    recordRedisOperation,
    setQueueActive
} from '../utils/metrics.js';

export const MetricsNames = {
    QUEUE_WAITING: 'apollo_queue_waiting',
    QUEUE_ACTIVE: 'apollo_queue_active',
    QUEUE_FAILED: 'apollo_queue_failed',
    QUEUE_WAIT_SECONDS: 'apollo_queue_wait_seconds',
    QUEUE_JOB_DURATION_SECONDS: 'apollo_queue_job_duration_seconds',
    QUEUE_ACTIVE_JOBS: 'apollo_queue_active_jobs',
    QUEUE_JOB_OUTCOMES_TOTAL: 'apollo_queue_job_outcomes_total',
    REDIS_OPERATION_DURATION_SECONDS: 'apollo_redis_operation_duration_seconds',
    EVENT_LOOP_DELAY_SECONDS: 'apollo_event_loop_delay_seconds',
    WORKER_MEMORY_BYTES: 'apollo_worker_memory_bytes'
} as const;

export {
    recordQueueEnqueue,
    recordQueueJobDuration,
    recordQueueOutcome,
    recordQueueWait,
    setQueueActive
};

export interface QueueMetricsResult {
    waiting: number;
    active: number;
    failed: number;
}

export interface QueueBenchmarkSummary {
    completedJobs: number;
    failureCount: number;
    failureRate: number;
}

export function summarizeQueueBenchmark(completedJobs: number, failureCount: number): QueueBenchmarkSummary {
    const completed = Math.max(0, Math.trunc(completedJobs));
    const failures = Math.min(completed, Math.max(0, Math.trunc(failureCount)));
    return {
        completedJobs: completed,
        failureCount: failures,
        failureRate: completed === 0 ? 0 : failures / completed
    };
}

export async function getQueueMetrics(queueConfig: ApolloConfig['queue']): Promise<QueueMetricsResult> {
    if (!queueConfig.enabled) {
        return { waiting: 0, active: 0, failed: 0 };
    }

    try {
        const { Queue } = await import('bullmq');
        const { Redis } = await import('ioredis');

        const connection = new Redis({
            host: queueConfig.redis.host,
            port: queueConfig.redis.port,
            password: queueConfig.redis.password ?? undefined,
            maxRetriesPerRequest: null,
            protocol: 2
        });

        const queue = new Queue(queueConfig.prefix, { connection });
        const startedAt = performance.now();
        const [waiting, active, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getFailedCount()
        ]);
        recordRedisOperation('get', performance.now() - startedAt);
        setQueueActive(queueConfig.prefix, active);

        await queue.close();
        await connection.quit();

        return { waiting, active, failed };
    } catch (err) {
        logger.error({ err: err as Error, msg: '[Metrics] Failed to get queue metrics' });
        return { waiting: -1, active: -1, failed: -1 };
    }
}