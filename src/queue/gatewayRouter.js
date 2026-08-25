import { logger } from '../utils/logger.js';
 
import { config } from '../config/config.js';
import { createQueue } from './queue.js';

export async function queueOrRun(jobName, data, handler) {
    if (config.queue.enabled) {
        const queue = await createQueue(config.queue.prefix);
        const job = await queue.add(jobName, data);
        logger.info(`[Gateway] Enqueued ${jobName} as job ${job.id}`);
        return { queued: true, jobId: job.id };
    }
    return handler(data);
}
