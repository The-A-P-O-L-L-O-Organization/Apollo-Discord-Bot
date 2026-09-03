// Queue system types (BullMQ integration)

import type { Job, Queue, QueueEvents, Worker, JobsOptions } from 'bullmq';
import type { SerializedInteraction, SerializedUser, SerializedMember, SerializedCommandData, SerializedCommandOption } from './shared.js';

export type JobName =
    | 'process-command'
    | 'heavy-operation'
    | 'scheduled-task'
    | 'nsfw:analyze'
    | 'analytics:flush'
    | 'moderation:action'
    | 'webhook:deliver'
    | 'email:send'
    | 'backup:create'
    | 'cleanup:expired';

export interface QueueJobDataMap {
    'process-command': ProcessCommandJobData;
    'heavy-operation': HeavyOperationJobData;
    'scheduled-task': ScheduledTaskJobData;
    'nsfw:analyze': NSFWAnalyzeJobData;
    'analytics:flush': AnalyticsFlushJobData;
    'moderation:action': ModerationActionJobData;
    'webhook:deliver': WebhookDeliverJobData;
    'email:send': EmailSendJobData;
    'backup:create': BackupCreateJobData;
    'cleanup:expired': CleanupExpiredJobData;
}

export interface ProcessCommandJobData {
    interaction: SerializedInteraction;
    timestamp: number;
}

export interface HeavyOperationJobData {
    operation: string;
    data: unknown;
    priority?: number;
    timeout?: number;
}

export interface ScheduledTaskJobData {
    taskName: string;
    cron?: string;
    interval?: number;
    data?: unknown;
}

export interface NSFWAnalyzeJobData {
    imageUrl: string;
    guildId: string;
    threshold: number;
    attachmentName?: string;
    attachmentId?: string;
}

export interface AnalyticsFlushJobData {
    guildId?: string;
    force?: boolean;
}

export interface ModerationActionJobData {
    guildId: string;
    userId: string;
    moderatorId: string;
    type: 'ban' | 'kick' | 'timeout' | 'warn' | 'mute' | 'unmute' | 'unban';
    reason: string;
    duration?: number;
    deleteMessageSeconds?: number;
}

export interface WebhookDeliverJobData {
    webhookId: string;
    webhookToken: string;
    payload: Record<string, unknown>;
    retries?: number;
}

export interface EmailSendJobData {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: {
        filename: string;
        content: Buffer | string;
        contentType?: string;
    }[];
}

export interface BackupCreateJobData {
    type: 'full' | 'incremental';
    includeData: boolean;
    destination: string;
}

export interface CleanupExpiredJobData {
    type: 'reminders' | 'polls' | 'tickets' | 'warnings' | 'analytics';
    olderThan: number;
    dryRun?: boolean;
}

// Re-export shared serialized types
export type {
    SerializedInteraction,
    SerializedUser,
    SerializedMember,
    SerializedCommandData,
    SerializedCommandOption
} from './shared.js';

export interface QueueConfig {
    name: string;
    prefix: string;
    redis: RedisConnectionConfig;
    defaultJobOptions: DefaultJobOptions;
    serializer: JobSerializer;
}

export interface RedisConnectionConfig {
    host: string;
    port: number;
    password?: string;
    username?: string;
    db?: number;
    family?: number;
    tls?: boolean;
    maxRetriesPerRequest?: number;
    enableReadyCheck?: boolean;
    lazyConnect?: boolean;
}

export interface DefaultJobOptions {
    attempts: number;
    backoff: BackoffOptions;
    removeOnComplete: RemoveOptions;
    removeOnFail: RemoveOptions;
    priority?: number;
    delay?: number;
    timeout?: number;
    stackTraceLimit?: number;
}

export interface BackoffOptions {
    type: 'exponential' | 'fixed';
    delay: number;
}

export interface RemoveOptions {
    age: number;
    count: number;
}

export interface JobSerializer {
    serialize: (data: unknown) => Buffer | string;
    deserialize: (data: Buffer | string) => unknown;
}

export interface QueueMetrics {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    total: number;
}

export interface QueueHealthCheck {
    healthy: boolean;
    redisConnected: boolean;
    queuePaused: boolean;
    metrics: QueueMetrics;
    oldestJobAge?: number;
    workersOnline: number;
}

export type WorkerProcessor<T extends JobName = JobName> = (
    job: Job<QueueJobDataMap[T]>
) => Promise<WorkerResult>;

export interface WorkerResult {
    success: boolean;
    data?: unknown;
    error?: string;
    duration: number;
}

export interface WorkerOptions {
    concurrency: number;
    limiter?: RateLimiterOptions;
    lockDuration?: number;
    maxStalledCount?: number;
    stalledInterval?: number;
    drainTimeout?: number;
}

export interface RateLimiterOptions {
    max: number;
    duration: number;
}

export interface QueueManager {
    getQueue: <T extends JobName>(name: T) => Queue<QueueJobDataMap[T]> | null;
    createQueue: <T extends JobName>(name: T, config?: Partial<QueueConfig>) => Promise<Queue<QueueJobDataMap[T]>>;
    closeQueue: (name: string) => Promise<void>;
    closeAll: () => Promise<void>;
    getMetrics: (name: string) => Promise<QueueMetrics>;
    healthCheck: (name: string) => Promise<QueueHealthCheck>;
    pauseQueue: (name: string) => Promise<void>;
    resumeQueue: (name: string) => Promise<void>;
    addJob: <T extends JobName>(
        queueName: T,
        jobName: T,
        data: QueueJobDataMap[T],
        options?: JobsOptions
    ) => Promise<Job<QueueJobDataMap[T]>>;
    getJob: <T extends JobName>(queueName: T, jobId: string) => Promise<Job<QueueJobDataMap[T]> | undefined>;
    removeJob: (queueName: string, jobId: string) => Promise<void>;
    retryJob: (queueName: string, jobId: string) => Promise<void>;
    promoteJob: (queueName: string, jobId: string) => Promise<void>;
}