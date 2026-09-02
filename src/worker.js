import { Worker } from 'bullmq';
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

let worker = null;

export async function startWorker() {
    logger.info('[Worker] Starting in worker mode...');

    // Warn if ALLOW_UNVERIFIED_PLUGINS is enabled in production
    warnUnverifiedPlugins();

    const db = getDb();
    await runMigrations();
    createAdapter(db);
    logger.info('[Worker] Database ready');

    registerProcessCommand();
    registerNsfwAnalyze();
    logger.info('[Worker] Job handlers registered');

    const { redis } = config.queue;
    const { Redis } = await import('ioredis');
    const connection = new Redis({
        host: redis.host,
        port: redis.port,
        password: redis.password || undefined,
        maxRetriesPerRequest: null
    });

    worker = new Worker(config.queue.prefix, async(job) => {
        logger.info(`[Worker] Received job: ${job.name} (${job.id})`);
        return handleJob(job);
    }, {
        connection,
        concurrency: 4,
        lockDuration: 60000,
        limiter: { max: 50, duration: 1000 }
    });

    worker.on('completed', (job) => {
        logger.info(`[Worker] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`[Worker] Job ${job.id} failed:`, err.message);
    });

    logger.info('[Worker] Ready and waiting for jobs');
    return worker;
}

export async function stopWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
    await closeQueues();
    await closeDb();
    await closeLockRedis();
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (isMain) {
    startWorker().catch((err) => {
        logger.error('[Worker] Fatal error:', err);
        process.exit(1);
    });

    const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS, 10) || 30000;

    const stopWorkerWithTimeout = async() => {
        const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('shutdown timeout')), SHUTDOWN_TIMEOUT_MS);
        });
        await Promise.race([stopWorker(), timeout]);
    };

    process.on('SIGTERM', async() => {
        logger.info('[Worker] Shutting down...');
        await stopWorkerWithTimeout();
        process.exit(0);
    });
    process.on('SIGINT', async() => {
        logger.info('[Worker] Shutting down...');
        await stopWorkerWithTimeout();
        process.exit(0);
    });
}
