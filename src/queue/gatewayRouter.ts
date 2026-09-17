// Gateway Router - TypeScript migration

import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { createQueue } from './queue.js';

export async function queueOrRun<T, R>(
    jobName: string,
    data: T,
    handler: (_data: T) => Promise<R>
): Promise<{ queued: true; jobId: string } | { queued: false; result: R }> {
    if (config.queue.enabled) {
        const queue = await createQueue(config.queue.prefix);
        const job = await queue.add(jobName, data);
        logger.info(`[Gateway] Enqueued ${jobName} as job ${job.id}`);
        return { queued: true, jobId: job.id! };
    }
    const result = await handler(data);
    return { queued: false, result };
}