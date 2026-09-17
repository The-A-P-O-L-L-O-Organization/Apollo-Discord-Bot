import { createLogger } from '../utils/logger.js';
import { Queue, type QueueOptions } from 'bullmq';
import { config } from '../config/config.js';
import { createRedisClient } from '../utils/redis.js';
import { encode, decode } from 'msgpackr';

const logger = createLogger({ component: 'queue' });

export const JobNames = {
    PROCESS_COMMAND: 'process-command',
    HEAVY_OPERATION: 'heavy-operation',
    SCHEDULED_TASK: 'scheduled-task',
    NSFW_ANALYZE: 'nsfw:analyze'
} as const;

export type JobName = typeof JobNames[keyof typeof JobNames];

const queues = new Map<string, Queue | NoopQueue>();

// Custom serializer for BullMQ using msgpackr
function serializeJobData(data: unknown): Buffer {
    return encode(data);
}

function deserializeJobData(data: Buffer): unknown {
    return decode(data);
}

interface NoopQueue {
    name: string;
    _enabled: false;
    add: (_jobName: string, _data: unknown, _opts?: unknown) => Promise<{ id: string; name: string; data: unknown }>;
    close: () => Promise<void>;
}

export async function createQueue(name: string, queueConfig = config.queue): Promise<Queue | NoopQueue> {
    if (queues.has(name)) {
        return queues.get(name)!;
    }

    // Determine shard-specific queue prefix
    const SHARD_ID = process.env['SHARD_ID'] ? parseInt(process.env['SHARD_ID'], 10) : undefined;
    const IS_SHARD_WORKER = typeof SHARD_ID !== 'undefined' && !isNaN(SHARD_ID);
    const queuePrefix = IS_SHARD_WORKER
        ? `${config.shard.queuePrefixBase}:shard-${SHARD_ID}`
        : config.queue.prefix;

    let q: Queue | NoopQueue;
    if (queueConfig.enabled) {
        const conn = createRedisClient('queue', {
            family: 4,
            password: config.queue.redis.password ?? undefined,
            username: config.queue.redis.username ?? undefined
        });
        await conn.connect();

        // Use type assertion for serializer since it's not in the base QueueOptions
        const queueOptions: QueueOptions = {
            connection: conn,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400, count: 1000 }
            }
        };

        // @ts-expect-error serializer is supported by BullMQ but not in QueueOptions type
        queueOptions.serializer = {
            serialize: serializeJobData,
            deserialize: deserializeJobData
        };

        q = new Queue(`${queuePrefix}:${name}`, queueOptions);
    } else {
        q = {
            name,
            _enabled: false,
            add(_jobName: string, _data: unknown, _opts?: unknown) {
                logger.info(`[Queue] Would add job ${_jobName} (queue disabled)`);
                return Promise.resolve({ id: 'noop', name: _jobName, data: _data });
            },
            close() {
                return Promise.resolve();
            }
        };
    }

    queues.set(name, q);
    return q;
}

export async function closeAll(): Promise<void> {
    for (const [, q] of queues) {
        await q.close();
    }
    queues.clear();
}

export function getQueue(name: string): Queue | NoopQueue | undefined {
    return queues.get(name);
}