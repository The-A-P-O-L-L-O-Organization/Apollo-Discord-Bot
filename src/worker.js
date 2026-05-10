import { Worker } from 'bullmq';
import { config } from './config/config.js';
import { getDb, runMigrations, closeDb } from './db/knex.js';
import { createAdapter } from './db/adapter.js';
import { handleJob } from './queue/jobHandler.js';
import { closeAll as closeQueues } from './queue/queue.js';
import registerProcessCommand from './queue/jobs/processCommand.js';

let worker = null;

export async function startWorker() {
  console.log('[Worker] Starting in worker mode...');

  const db = getDb();
  await runMigrations();
  createAdapter(db);
  console.log('[Worker] Database ready');

  registerProcessCommand();
  console.log('[Worker] Job handlers registered');

  const { redis } = config.queue;
  const { Redis } = await import('ioredis');
  const connection = new Redis({
    host: redis.host,
    port: redis.port,
    password: redis.password || undefined,
    maxRetriesPerRequest: null,
  });

  worker = new Worker(config.queue.prefix, async (job) => {
    console.log(`[Worker] Received job: ${job.name} (${job.id})`);
    return handleJob(job);
  }, { connection });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed:`, err.message);
  });

  console.log('[Worker] Ready and waiting for jobs');
  return worker;
}

export async function stopWorker() {
  if (worker) {
    await worker.close();
    worker = null;
  }
  await closeQueues();
  await closeDb();
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1]);
if (isMain) {
  startWorker().catch((err) => {
    console.error('[Worker] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    console.log('[Worker] Shutting down...');
    await stopWorker();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    console.log('[Worker] Shutting down...');
    await stopWorker();
    process.exit(0);
  });
}
