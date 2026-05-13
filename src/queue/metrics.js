export const MetricsNames = {
    QUEUE_WAITING: 'apollo_queue_waiting',
    QUEUE_ACTIVE: 'apollo_queue_active',
    QUEUE_FAILED: 'apollo_queue_failed'
};

export async function getQueueMetrics(queueConfig) {
    if (!queueConfig.enabled) {
        return { waiting: 0, active: 0, failed: 0 };
    }

    try {
        const { Queue } = await import('bullmq');
        const { Redis } = await import('ioredis');

        const connection = new Redis({
            host: queueConfig.redis.host,
            port: queueConfig.redis.port,
            password: queueConfig.redis.password || undefined,
            maxRetriesPerRequest: null
        });

        const queue = new Queue(queueConfig.prefix, { connection });
        const [waiting, active, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getFailedCount()
        ]);

        await queue.close();
        await connection.quit();

        return { waiting, active, failed };
    } catch (err) {
        console.error('[Metrics] Failed to get queue metrics:', err.message);
        return { waiting: -1, active: -1, failed: -1 };
    }
}
