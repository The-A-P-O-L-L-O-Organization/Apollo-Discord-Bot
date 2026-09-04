// Job Handler Registry - TypeScript migration

import type { Job } from 'bullmq';
import type { QueueJobDataMap, JobName } from '../types/queue.js';

// Use a wider type for the handlers map to avoid complex generic constraints
const handlers = new Map<string, (_job: Job<unknown>) => Promise<unknown>>();

export function registerHandler<T extends JobName>(
    jobName: T,
    fn: (_job: Job<QueueJobDataMap[T]>) => Promise<unknown>
): void {
    if (handlers.has(jobName)) {
        throw new Error(`Handler for "${jobName}" is already registered`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlers.set(jobName, fn as (_job: Job<any>) => Promise<any>);
}

export function getHandler<T extends JobName>(jobName: T): ((_job: Job<QueueJobDataMap[T]>) => Promise<unknown>) | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (handlers.get(jobName) as ((_job: Job<any>) => Promise<any>) | undefined) ?? null;
}

export async function handleJob<T extends JobName>(_job: Job<QueueJobDataMap[T]>): Promise<unknown> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = handlers.get(_job.name) as ((_job: Job<any>) => Promise<any>) | undefined;
    if (!fn) {
        throw new Error(`No handler registered for job: "${_job.name}"`);
    }
    return fn(_job);
}

export function clearHandlers(): void {
    handlers.clear();
}