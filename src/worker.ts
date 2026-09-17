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
        maxRetriesPerRequest: null
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

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]);
if (isMain) {
    startWorker().catch((err: unknown) => {
        logger.error({ err: err as Error }, '[Worker] Fatal error');
        process.exit(1);
    });

    const SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env['SHUTDOWN_TIMEOUT_MS'] ?? '', 10) || 30000;

    const stopWorkerWithTimeout = async (): Promise<void> => {
        const timeout = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('shutdown timeout')), SHUTDOWN_TIMEOUT_MS);
        });
        await Promise.race([stopWorker(), timeout]);
    };

    process.on('SIGTERM', () => {
        logger.info('[Worker] Shutting down...');
        stopWorkerWithTimeout().then(() => process.exit(0)).catch(() => process.exit(1));
    });
    process.on('SIGINT', () => {
        logger.info('[Worker] Shutting down...');
        stopWorkerWithTimeout().then(() => process.exit(0)).catch(() => process.exit(1));
    });
}
