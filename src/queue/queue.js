/* eslint-disable no-console */
import { Queue } from 'bullmq';
import { config } from '../config/config.js';

export const JobNames = {
    PROCESS_COMMAND: 'process-command',
    HEAVY_OPERATION: 'heavy-operation',
    SCHEDULED_TASK: 'scheduled-task'
};

const queues = new Map();
let connection = null;

async function getConnection() {
    if (connection) {return connection;}
    const { redis } = config.queue;
    const { Redis } = await import('ioredis');
    connection = new Redis({
        host: redis.host,
        port: redis.port,
        password: redis.password || undefined,
        maxRetriesPerRequest: null
    });
    return connection;
}

export async function createQueue(name, queueConfig = config.queue) {
    if (queues.has(name)) {return queues.get(name);}

    let q;
    if (queueConfig.enabled) {
        const conn = await getConnection();
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
    if (connection) {
        await connection.quit();
        connection = null;
    }
}
