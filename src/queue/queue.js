/* eslint-disable no-console */
import { Queue } from 'bullmq';
import { config } from '../config/config.js';
import { getRedis } from '../utils/redis.js';

export const JobNames = {
    PROCESS_COMMAND: 'process-command',
    HEAVY_OPERATION: 'heavy-operation',
    SCHEDULED_TASK: 'scheduled-task'
};

const queues = new Map();

export async function createQueue(name, queueConfig = config.queue) {
    if (queues.has(name)) {return queues.get(name);}

    let q;
    if (queueConfig.enabled) {
        const conn = getRedis('queue', { family: 4 });
        await conn.connect();
        q = new Queue(name, {
            connection: conn,
            defaultJobOptions: {
                removeOnComplete: { age: 3600 },
                removeOnFail: { age: 86400 }
            }
        });
    } else {
        q = {
            name,
            _enabled: false,
            async add(jobName, data, _opts) {
                console.log(`[Queue] Would add job ${jobName} (queue disabled)`);
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
