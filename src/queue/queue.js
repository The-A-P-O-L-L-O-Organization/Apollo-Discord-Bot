import { createLogger } from '../utils/logger.js';
import { Queue } from 'bullmq';
import { config } from '../config/config.js';
import { createRedisClient } from '../utils/redis.js';
import { encode, decode } from 'msgpackr';

const logger = createLogger({ component: 'queue' });

export const JobNames = {
    PROCESS_COMMAND: 'process-command',
    HEAVY_OPERATION: 'heavy-operation',
    SCHEDULED_TASK: 'scheduled-task',
    NSFW_ANALYZE: 'nsfw:analyze'
};

const queues = new Map();

// Custom serializer for BullMQ using msgpackr
function serializeJobData(data) {
    return encode(data);
}

function deserializeJobData(data) {
    return decode(data);
}

export async function createQueue(name, queueConfig = config.queue) {
    if (queues.has(name)) {return queues.get(name);}

    // Determine shard-specific queue prefix
    const SHARD_ID = process.env.SHARD_ID ? parseInt(process.env.SHARD_ID, 10) : undefined;
    const IS_SHARD_WORKER = typeof SHARD_ID !== 'undefined' && !isNaN(SHARD_ID);
    const queuePrefix = IS_SHARD_WORKER
        ? `${config.shard.queuePrefixBase}:shard-${SHARD_ID}`
        : config.queue.prefix;

    let q;
    if (queueConfig.enabled) {
        const conn = createRedisClient('queue', { 
            family: 4,
            password: config.queue.redis.password,
            username: config.queue.redis.username
        });
        await conn.connect();
        q = new Queue(`${queuePrefix}:${name}`, {
            connection: conn,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400, count: 1000 }
            },
            // Custom serializer for job data
            serializer: {
                serialize: serializeJobData,
                deserialize: deserializeJobData
            }
        });
    } else {
        q = {
            name,
            _enabled: false,
            async add(jobName, data, _opts) {
                logger.info(`[Queue] Would add job ${jobName} (queue disabled)`);
                return { id: 'noop', name: jobName, data };
            },
            async close() {}
        };
    }

    queues.set(name, q);
    return q;
}

export async function closeAll() {
    for (const [, q] of queues) {
        await q.close();
    }
    queues.clear();
}
