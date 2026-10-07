import { Worker } from 'bullmq';
import Redis from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { config } from './config/config.js';
import { getDb, runMigrations, closeDb } from './db/knex.js';
import { createAdapter } from './db/adapter.js';
import { handleJob } from './queue/jobHandler.js';
import { closeAll as closeQueues } from './queue/queue.js';
import registerProcessCommand from './queue/jobs/processCommand.js';
import registerNsfwAnalyze from './queue/jobs/nsfwAnalyze.js';
import { createLogger } from './utils/logger.js';
import { warnUnverifiedPlugins } from './utils/startupChecks.js';
import { closeLockRedis } from './utils/lock.js';

const logger = createLogger({ component: 'worker' });

let worker: Worker | null = null;

export async function startWorker(): Promise<Worker> {
    logger.info('[Worker] Starting in worker mode...');

    warnUnverifiedPlugins();

    const db = getDb();
    await runMigrations();
    createAdapter(db);
    logger.info('[Worker] Database ready');

    registerProcessCommand();
    registerNsfwAnalyze();
    logger.info('[Worker] Job handlers registered');

    const { redis } = config.queue;
    // @ts-expect-error ioredis v6 module export issue (same pattern as utils/redis.ts)
    const connection: RedisType = new Redis({
        host: redis.host,
        port: redis.port,
        password: redis.password ?? undefined,
        maxRetriesPerRequest: null,
        protocol: 2
    });

    worker = new Worker(config.queue.prefix, async (job: Parameters<typeof handleJob>[0]) => {
        logger.info(`[Worker] Received job: ${String(job.name)} (${String(job.id)})`);
        return handleJob(job);
    }, {
        connection,
        concurrency: 4,
        lockDuration: 60000,
        limiter: { max: 50, duration: 1000 }
    });

    worker.on('completed', (job) => {
        logger.info(`[Worker] Job ${String(job.id)} completed`);
    });

    worker.on('failed', (job, err) => {
        logger.error({ err }, `[Worker] Job ${job?.id ? String(job.id) : 'unknown'} failed`);
    });

    logger.info('[Worker] Ready and waiting for jobs');
    return worker;
}

export async function stopWorker(): Promise<void> {
    if (worker) {
        await worker.close();
        worker = null;
    }
    await closeQueues();
    await closeDb();
    await closeLockRedis();
}

// Entry point is now src/index.ts with RUN_MODE=worker
// This module only exports startWorker/stopWorker for programmatic use
