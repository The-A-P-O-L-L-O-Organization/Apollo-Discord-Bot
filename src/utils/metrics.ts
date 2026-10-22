// Metrics Utility
// Prometheus metrics for monitoring and observability
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from '@prometheus-io/client';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { config } from '../config/config.js';

export const register = new Registry();
register.setDefaultLabels({ app: 'apollo-bot', pod: config.podId });

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register, prefix: 'apollo_' });

// Custom metrics
export const commandsTotal = new Counter({
    name: 'apollo_commands_total',
    help: 'Total number of slash commands executed',
    labelNames: ['command', 'status'],
    registers: [register]
});

export const commandDuration = new Histogram({
    name: 'apollo_command_duration_seconds',
    help: 'Command execution duration in seconds',
    labelNames: ['command'],
    buckets: [0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 20, 30],
    registers: [register]
});

export const queueDepth = new Gauge({
    name: 'apollo_queue_depth',
    help: 'Jobs waiting in queue',
    labelNames: ['queue'],
    registers: [register]
});

export const queueJobsTotal = new Counter({
    name: 'apollo_queue_jobs_total',
    help: 'Total number of queue jobs processed by outcome',
    labelNames: ['queue', 'outcome'],
    registers: [register]
});

const queueLabels = ['commands', 'nsfw', 'heavy', 'scheduled', 'default'] as const;
const jobLabels = ['process-command', 'nsfw:analyze', 'heavy-operation', 'scheduled-task', 'unknown'] as const;
const outcomeLabels = ['success', 'retry', 'failure'] as const;
type QueueLabel = typeof queueLabels[number];
type JobLabel = typeof jobLabels[number];
type OutcomeLabel = typeof outcomeLabels[number];

function normalizeQueueLabel(value: string): QueueLabel {
    const normalized = value.toLowerCase();
    if (normalized.includes('nsfw')) { return 'nsfw'; }
    if (normalized.includes('heavy')) { return 'heavy'; }
    if (normalized.includes('scheduled')) { return 'scheduled'; }
    if (normalized.includes('command')) { return 'commands'; }
    return 'default';
}

function normalizeJobLabel(value: string): JobLabel {
    if ((jobLabels as readonly string[]).includes(value)) {
        return value as JobLabel;
    }
    const candidate = value.split(':', 1)[0] ?? value;
    return (jobLabels as readonly string[]).includes(candidate) ? candidate as JobLabel : 'unknown';
}

function normalizeOutcomeLabel(value: string): OutcomeLabel {
    return (outcomeLabels as readonly string[]).includes(value) ? value as OutcomeLabel : 'failure';
}

export const queueWaitSeconds = new Histogram({
    name: 'apollo_queue_wait_seconds',
    help: 'Time spent waiting for a queue worker in seconds',
    labelNames: ['queue', 'job'],
    buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5, 30, 60],
    registers: [register]
});

export const queueJobDurationSeconds = new Histogram({
    name: 'apollo_queue_job_duration_seconds',
    help: 'Queue job processing duration in seconds',
    labelNames: ['queue', 'job'],
    buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5, 30, 60],
    registers: [register]
});

export const queueActiveJobs = new Gauge({
    name: 'apollo_queue_active_jobs',
    help: 'Number of jobs currently being processed by queue workers',
    labelNames: ['queue'],
    registers: [register]
});

export const queueJobOutcomesTotal = new Counter({
    name: 'apollo_queue_job_outcomes_total',
    help: 'Queue job outcomes by bounded queue, job, and outcome labels',
    labelNames: ['queue', 'job', 'outcome'],
    registers: [register]
});

export const redisOperationDurationSeconds = new Histogram({
    name: 'apollo_redis_operation_duration_seconds',
    help: 'Redis operation latency in seconds',
    labelNames: ['operation'],
    buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
});

export const eventLoopDelaySeconds = new Histogram({
    name: 'apollo_event_loop_delay_seconds',
    help: 'Event-loop delay in seconds',
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1],
    registers: [register]
});

let eventLoopMonitor: ReturnType<typeof monitorEventLoopDelay> | null = null;

export function startPerformanceMetrics(): void {
    if (eventLoopMonitor) { return; }
    eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
    eventLoopMonitor.enable();
}

export function stopPerformanceMetrics(): void {
    if (!eventLoopMonitor) { return; }
    eventLoopMonitor.disable();
    eventLoopDelaySeconds.observe(eventLoopMonitor.mean / 1_000_000_000);
    eventLoopMonitor = null;
}

export const dbQueryDuration = new Histogram({
    name: 'apollo_db_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['operation', 'store'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    registers: [register]
});

export const activePlugins = new Gauge({
    name: 'apollo_active_plugins',
    help: 'Number of active plugins',
    registers: [register]
});

export const workerMemoryUsage = new Gauge({
    name: 'apollo_worker_memory_bytes',
    help: 'Worker process memory usage in bytes',
    labelNames: ['plugin'],
    registers: [register]
});

export const redisConnections = new Gauge({
    name: 'apollo_redis_connections',
    help: 'Number of active Redis connections',
    registers: [register]
});

export const analyticsCacheSize = new Gauge({
    name: 'apollo_analytics_cache_entries',
    help: 'Number of entries in analytics cache',
    labelNames: ['type'],
    registers: [register]
});

export const spamTrackerSize = new Gauge({
    name: 'apollo_spam_tracker_entries',
    help: 'Number of entries in spam tracker',
    labelNames: ['guild'],
    registers: [register]
});

export const spamDetectionsTotal = new Counter({
    name: 'apollo_spam_detections_total',
    help: 'Total spam detections',
    labelNames: ['guild', 'type', 'action'],
    registers: [register]
});

export const spamConfidence = new Histogram({
    name: 'apollo_spam_confidence',
    help: 'Spam detection confidence score',
    labelNames: ['guild', 'type'],
    buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0],
    registers: [register]
});

export const threatScoreDistribution = new Histogram({
    name: 'apollo_threat_score',
    help: 'User threat score distribution',
    labelNames: ['guild'],
    buckets: [0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    registers: [register]
});

export const spamActionsTotal = new Counter({
    name: 'apollo_spam_actions_total',
    help: 'Total spam actions taken',
    labelNames: ['guild', 'action'],
    registers: [register]
});

export const eventBusHandlers = new Gauge({
    name: 'apollo_eventbus_handlers',
    help: 'Number of registered event handlers',
    labelNames: ['event'],
    registers: [register]
});

export const httpRequestsTotal = new Counter({
    name: 'apollo_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [register]
});

export const httpRequestDuration = new Histogram({
    name: 'apollo_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [register]
});

export const errorsTotal = new Counter({
    name: 'apollo_errors_total',
    help: 'Total errors',
    labelNames: ['type', 'component'],
    registers: [register]
});

export const pluginLoadDuration = new Histogram({
    name: 'apollo_plugin_load_duration_seconds',
    help: 'Plugin load duration in seconds',
    labelNames: ['plugin'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [register]
});

export const startupDuration = new Histogram({
    name: 'apollo_startup_duration_seconds',
    help: 'Bot startup duration in seconds',
    buckets: [1, 2, 5, 10, 30, 60],
    registers: [register]
});

export const gatewayLatencyMs = new Histogram({
    name: 'apollo_gateway_latency_ms',
    help: 'Gateway latency in milliseconds',
    labelNames: ['shard'],
    buckets: [10, 20, 50, 100, 200, 500, 1000, 2000],
    registers: [register]
});

export const gatewayConnected = new Gauge({
    name: 'apollo_gateway_connected',
    help: 'Whether this pod is the active gateway leader (1) or not (0)',
    labelNames: [],
    registers: [register]
});

export const doraDeploymentFrequency = new Counter({
    name: 'apollo_dora_deployment_frequency_total',
    help: 'Total number of production deployments',
    labelNames: ['environment'],
    registers: [register]
});

export const doraLeadTimeSeconds = new Histogram({
    name: 'apollo_dora_lead_time_seconds',
    help: 'Lead time from commit to production deployment in seconds',
    labelNames: ['environment'],
    buckets: [300, 600, 1800, 3600, 7200, 21600, 43200, 86400],
    registers: [register]
});

export const doraMTTRSeconds = new Histogram({
    name: 'apollo_dora_mttr_seconds',
    help: 'Mean time to recovery from incident in seconds',
    labelNames: ['environment', 'severity'],
    buckets: [300, 600, 1800, 3600, 7200, 21600, 43200, 86400],
    registers: [register]
});

export const doraChangeFailureTotal = new Counter({
    name: 'apollo_dora_change_failure_total',
    help: 'Total number of failed production deployments',
    labelNames: ['environment'],
    registers: [register]
});

export const doraChangeTotal = new Counter({
    name: 'apollo_dora_change_total',
    help: 'Total number of production deployments (success + failure)',
    labelNames: ['environment'],
    registers: [register]
});

// Helper functions
export type CommandStatus = 'success' | 'error' | 'not_found' | 'invalid';

export function recordCommand(command: string, status: CommandStatus): void {
    commandsTotal.inc({ command, status });
}

export function recordCommandDuration(command: string, durationMs: number): void {
    commandDuration.observe({ command }, durationMs / 1000);
}

export function setQueueDepth(queue: string, depth: number): void {
    queueDepth.set({ queue }, depth);
}

export function recordQueueEnqueue(queue: string, job: string): void {
    queueJobOutcomesTotal.inc({ queue: normalizeQueueLabel(queue), job: normalizeJobLabel(job), outcome: 'success' }, 0);
}

export function recordQueueWait(queue: string, job: string, durationMs: number): void {
    queueWaitSeconds.observe({ queue: normalizeQueueLabel(queue), job: normalizeJobLabel(job) }, Math.max(0, durationMs) / 1000);
}

export function recordQueueStart(queue: string, job: string, waitSeconds: number): void {
    recordQueueWait(queue, job, waitSeconds * 1000);
    setQueueActive(queue, getQueueActive(queue) + 1);
}

export function recordQueueJobDuration(queue: string, job: string, durationMs: number): void {
    queueJobDurationSeconds.observe({ queue: normalizeQueueLabel(queue), job: normalizeJobLabel(job) }, Math.max(0, durationMs) / 1000);
}

const activeQueueCounts = new Map<QueueLabel, number>();

function getQueueActive(queue: string): number {
    return activeQueueCounts.get(normalizeQueueLabel(queue)) ?? 0;
}

export function setQueueActive(queue: string, count: number): void {
    const label = normalizeQueueLabel(queue);
    const boundedCount = Math.max(0, Number.isFinite(count) ? count : 0);
    activeQueueCounts.set(label, boundedCount);
    queueActiveJobs.set({ queue: label }, boundedCount);
}

export function recordQueueOutcome(queue: string, job: string, outcome: string): void {
    const label = normalizeQueueLabel(queue);
    if (outcome === 'success' || outcome === 'retry' || outcome === 'failure') {
        setQueueActive(label, Math.max(0, getQueueActive(label) - 1));
    }
    queueJobOutcomesTotal.inc({ queue: label, job: normalizeJobLabel(job), outcome: normalizeOutcomeLabel(outcome) });
}

export function recordRedisOperation(operation: string, durationMs: number): void {
    const safeOperation = ['get', 'set', 'del', 'ping', 'connect', 'publish', 'subscribe', 'unknown'].includes(operation)
        ? operation
        : 'unknown';
    redisOperationDurationSeconds.observe({ operation: safeOperation }, Math.max(0, durationMs) / 1000);
}

export function recordDbQuery(operation: string, store: string, durationMs: number): void {
    dbQueryDuration.observe({ operation, store }, durationMs / 1000);
}

export function setActivePlugins(count: number): void {
    activePlugins.set(count);
}

export function setWorkerMemory(plugin: string, bytes: number): void {
    workerMemoryUsage.set({ plugin: plugin === 'worker' ? 'worker' : 'plugin' }, bytes);
}

export function setRedisConnections(count: number): void {
    redisConnections.set(count);
}

export function setAnalyticsCacheSize(type: string, count: number): void {
    analyticsCacheSize.set({ type }, count);
}

export function setSpamTrackerSize(guild: string, count: number): void {
    spamTrackerSize.set({ guild }, count);
}

export function recordSpamDetection(guild: string, type: string, action: string): void {
    spamDetectionsTotal.inc({ guild, type, action });
}

export function recordSpamConfidence(guild: string, type: string, confidence: number): void {
    spamConfidence.observe({ guild, type }, confidence);
}

export function recordThreatScore(guild: string, score: number): void {
    threatScoreDistribution.observe({ guild }, score);
}

export function recordSpamAction(guild: string, action: string): void {
    spamActionsTotal.inc({ guild, action });
}

export function setEventBusHandlers(event: string, count: number): void {
    eventBusHandlers.set({ event }, count);
}

export function recordHttpRequest(method: string, path: string, status: number | string, durationMs: number): void {
    httpRequestsTotal.inc({ method, path, status: String(status) });
    httpRequestDuration.observe({ method, path }, durationMs / 1000);
}

export function recordError(type: string, component: string): void {
    errorsTotal.inc({ type, component });
}

export function recordPluginLoad(plugin: string, durationMs: number): void {
    pluginLoadDuration.observe({ plugin }, durationMs / 1000);
}

export function recordStartupDuration(durationMs: number): void {
    startupDuration.observe(durationMs / 1000);
}

export function recordGatewayLatency(shard: string, latencyMs: number): void {
    gatewayLatencyMs.observe({ shard }, latencyMs);
}

export function recordDoraDeployment(environment: string, success: boolean): void {
    doraDeploymentFrequency.inc({ environment });
    doraChangeTotal.inc({ environment });
    if (!success) {
        doraChangeFailureTotal.inc({ environment });
    }
}

export function recordDoraLeadTime(environment: string, seconds: number): void {
    doraLeadTimeSeconds.observe({ environment }, seconds);
}

export function recordDoraMTTR(environment: string, severity: string, seconds: number): void {
    doraMTTRSeconds.observe({ environment, severity }, seconds);
}

export default {
    register,
    commandsTotal,
    commandDuration,
    queueDepth,
    queueJobsTotal,
    queueWaitSeconds,
    queueJobDurationSeconds,
    queueActiveJobs,
    queueJobOutcomesTotal,
    redisOperationDurationSeconds,
    eventLoopDelaySeconds,
    dbQueryDuration,
    activePlugins,
    workerMemoryUsage,
    redisConnections,
    analyticsCacheSize,
    spamTrackerSize,
    spamDetectionsTotal,
    spamConfidence,
    threatScoreDistribution,
    spamActionsTotal,
    eventBusHandlers,
    httpRequestsTotal,
    httpRequestDuration,
    errorsTotal,
    pluginLoadDuration,
    startupDuration,
    gatewayLatencyMs,
    recordCommand,
    recordCommandDuration,
    setQueueDepth,
    recordQueueEnqueue,
    recordQueueWait,
    recordQueueStart,
    recordQueueJobDuration,
    setQueueActive,
    recordQueueOutcome,
    recordRedisOperation,
    recordDbQuery,
    setActivePlugins,
    setWorkerMemory,
    setRedisConnections,
    setAnalyticsCacheSize,
    setSpamTrackerSize,
    recordSpamDetection,
    recordSpamConfidence,
    recordThreatScore,
    recordSpamAction,
    setEventBusHandlers,
    recordHttpRequest,
    recordError,
    recordPluginLoad,
    recordStartupDuration,
    recordGatewayLatency,
    gatewayConnected,
    doraDeploymentFrequency,
    doraLeadTimeSeconds,
    doraMTTRSeconds,
    doraChangeFailureTotal,
    doraChangeTotal,
    recordDoraDeployment,
    recordDoraLeadTime,
    recordDoraMTTR
};

/**
 * Creates a new metrics registry with all metrics
 * Useful for testing to isolate metrics between tests
 * @param options - Options for the metrics
 * @param options.prefix - Prefix for all metric names (default: 'apollo_')
 * @returns Object containing register and all metric functions
 */
export function createMetrics({ prefix = 'apollo_' } = {}): {
    register: Registry;
    commandsTotal: Counter;
    commandDuration: Histogram;
    queueDepth: Gauge;
    queueJobsTotal: Counter;
    queueWaitSeconds: Histogram;
    queueJobDurationSeconds: Histogram;
    queueActiveJobs: Gauge;
    queueJobOutcomesTotal: Counter;
    redisOperationDurationSeconds: Histogram;
    eventLoopDelaySeconds: Histogram;
    dbQueryDuration: Histogram;
    activePlugins: Gauge;
    workerMemoryUsage: Gauge;
    redisConnections: Gauge;
    analyticsCacheSize: Gauge;
    spamTrackerSize: Gauge;
    eventBusHandlers: Gauge;
    httpRequestsTotal: Counter;
    httpRequestDuration: Histogram;
    errorsTotal: Counter;
    pluginLoadDuration: Histogram;
    startupDuration: Histogram;
    gatewayConnected: Gauge;
    doraDeploymentFrequency: Counter;
    doraLeadTimeSeconds: Histogram;
    doraMTTRSeconds: Histogram;
    doraChangeFailureTotal: Counter;
    doraChangeTotal: Counter;
    recordCommand: (command: string, status: CommandStatus) => void;
    recordCommandDuration: (command: string, durationMs: number) => void;
    setQueueDepth: (queue: string, depth: number) => void;
    recordQueueEnqueue: (queue: string, job: string) => void;
    recordQueueWait: (queue: string, job: string, durationMs: number) => void;
    recordQueueStart: (queue: string, job: string, waitSeconds: number) => void;
    recordQueueJobDuration: (queue: string, job: string, durationMs: number) => void;
    setQueueActive: (queue: string, count: number) => void;
    recordQueueOutcome: (queue: string, job: string, outcome: string) => void;
    recordRedisOperation: (operation: string, durationMs: number) => void;
    recordDbQuery: (operation: string, store: string, durationMs: number) => void;
    setActivePlugins: (count: number) => void;
    setWorkerMemory: (plugin: string, bytes: number) => void;
    setRedisConnections: (count: number) => void;
    setAnalyticsCacheSize: (type: string, count: number) => void;
    setSpamTrackerSize: (guild: string, count: number) => void;
    setEventBusHandlers: (event: string, count: number) => void;
    recordHttpRequest: (method: string, path: string, status: number | string, durationMs: number) => void;
    recordError: (type: string, component: string) => void;
    recordPluginLoad: (plugin: string, durationMs: number) => void;
    recordStartupDuration: (durationMs: number) => void;
    recordDoraDeployment: (environment: string, success: boolean) => void;
    recordDoraLeadTime: (environment: string, seconds: number) => void;
    recordDoraMTTR: (environment: string, severity: string, seconds: number) => void;
} {
    const register = new Registry();
    register.setDefaultLabels({ app: 'apollo-bot', pod: config.podId });
    collectDefaultMetrics({ register, prefix });

    // Custom metrics
    const commandsTotal = new Counter({
        name: `${prefix}commands_total`,
        help: 'Total number of slash commands executed',
        labelNames: ['command', 'status'],
        registers: [register]
    });

    const commandDuration = new Histogram({
        name: `${prefix}command_duration_seconds`,
        help: 'Command execution duration in seconds',
        labelNames: ['command'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
        registers: [register]
    });

    const queueDepth = new Gauge({
        name: `${prefix}queue_depth`,
        help: 'Jobs waiting in queue',
        labelNames: ['queue'],
        registers: [register]
    });

    const dbQueryDuration = new Histogram({
        name: `${prefix}db_query_duration_seconds`,
        help: 'Database query duration in seconds',
        labelNames: ['operation', 'store'],
        buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
        registers: [register]
    });

    const queueJobsTotal = new Counter({
        name: `${prefix}queue_jobs_total`,
        help: 'Total number of queue jobs processed by outcome',
        labelNames: ['queue', 'outcome'],
        registers: [register]
    });

    const queueWaitSeconds = new Histogram({
        name: `${prefix}queue_wait_seconds`,
        help: 'Time spent waiting for a queue worker in seconds',
        labelNames: ['queue', 'job'],
        buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5, 30, 60],
        registers: [register]
    });

    const queueJobDurationSeconds = new Histogram({
        name: `${prefix}queue_job_duration_seconds`,
        help: 'Queue job processing duration in seconds',
        labelNames: ['queue', 'job'],
        buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5, 30, 60],
        registers: [register]
    });

    const queueActiveJobs = new Gauge({
        name: `${prefix}queue_active_jobs`,
        help: 'Number of jobs currently being processed by queue workers',
        labelNames: ['queue'],
        registers: [register]
    });

    const queueJobOutcomesTotal = new Counter({
        name: `${prefix}queue_job_outcomes_total`,
        help: 'Queue job outcomes by bounded queue, job, and outcome labels',
        labelNames: ['queue', 'job', 'outcome'],
        registers: [register]
    });

    const redisOperationDurationSeconds = new Histogram({
        name: `${prefix}redis_operation_duration_seconds`,
        help: 'Redis operation latency in seconds',
        labelNames: ['operation'],
        buckets: [0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
        registers: [register]
    });

    const eventLoopDelaySeconds = new Histogram({
        name: `${prefix}event_loop_delay_seconds`,
        help: 'Event-loop delay in seconds',
        buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1],
        registers: [register]
    });

    const activePlugins = new Gauge({
        name: `${prefix}active_plugins`,
        help: 'Number of active plugins',
        registers: [register]
    });

    const workerMemoryUsage = new Gauge({
        name: `${prefix}worker_memory_bytes`,
        help: 'Worker process memory usage in bytes',
        labelNames: ['plugin'],
        registers: [register]
    });

    const redisConnections = new Gauge({
        name: `${prefix}redis_connections`,
        help: 'Number of active Redis connections',
        registers: [register]
    });

    const analyticsCacheSize = new Gauge({
        name: `${prefix}analytics_cache_entries`,
        help: 'Number of entries in analytics cache',
        labelNames: ['type'],
        registers: [register]
    });

    const spamTrackerSize = new Gauge({
        name: `${prefix}spam_tracker_entries`,
        help: 'Number of entries in spam tracker',
        labelNames: ['guild'],
        registers: [register]
    });

    const eventBusHandlers = new Gauge({
        name: `${prefix}eventbus_handlers`,
        help: 'Number of registered event handlers',
        labelNames: ['event'],
        registers: [register]
    });

    const httpRequestsTotal = new Counter({
        name: `${prefix}http_requests_total`,
        help: 'Total HTTP requests',
        labelNames: ['method', 'path', 'status'],
        registers: [register]
    });

    const httpRequestDuration = new Histogram({
        name: `${prefix}http_request_duration_seconds`,
        help: 'HTTP request duration in seconds',
        labelNames: ['method', 'path'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
        registers: [register]
    });

    const errorsTotal = new Counter({
        name: `${prefix}errors_total`,
        help: 'Total errors',
        labelNames: ['type', 'component'],
        registers: [register]
    });

    const pluginLoadDuration = new Histogram({
        name: `${prefix}plugin_load_duration_seconds`,
        help: 'Plugin load duration in seconds',
        labelNames: ['plugin'],
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
        registers: [register]
    });

    const startupDuration = new Histogram({
        name: `${prefix}startup_duration_seconds`,
        help: 'Bot startup duration in seconds',
        buckets: [1, 2, 5, 10, 30, 60],
        registers: [register]
    });

    const gatewayConnected = new Gauge({
        name: `${prefix}gateway_connected`,
        help: 'Whether this pod is the active gateway leader (1) or not (0)',
        labelNames: [],
        registers: [register]
    });

    const doraDeploymentFrequency = new Counter({
        name: `${prefix}dora_deployment_frequency_total`,
        help: 'Total number of production deployments',
        labelNames: ['environment'],
        registers: [register]
    });

    const doraLeadTimeSeconds = new Histogram({
        name: `${prefix}dora_lead_time_seconds`,
        help: 'Lead time from commit to production deployment in seconds',
        labelNames: ['environment'],
        buckets: [300, 600, 1800, 3600, 7200, 21600, 43200, 86400],
        registers: [register]
    });

    const doraMTTRSeconds = new Histogram({
        name: `${prefix}dora_mttr_seconds`,
        help: 'Mean time to recovery from incident in seconds',
        labelNames: ['environment', 'severity'],
        buckets: [300, 600, 1800, 3600, 7200, 21600, 43200, 86400],
        registers: [register]
    });

    const doraChangeFailureTotal = new Counter({
        name: `${prefix}dora_change_failure_total`,
        help: 'Total number of failed production deployments',
        labelNames: ['environment'],
        registers: [register]
    });

    const doraChangeTotal = new Counter({
        name: `${prefix}dora_change_total`,
        help: 'Total number of production deployments (success + failure)',
        labelNames: ['environment'],
        registers: [register]
    });

    // Helper functions (using locally created metrics)
    function recordCommand(command: string, status: CommandStatus): void {
        commandsTotal.inc({ command, status });
    }

    function recordCommandDuration(command: string, durationMs: number): void {
        commandDuration.observe({ command }, durationMs / 1000);
    }

    function setQueueDepth(queue: string, depth: number): void {
        queueDepth.set({ queue }, depth);
    }

    const activeQueueCounts = new Map<QueueLabel, number>();
    const getQueueActive = (queue: string): number => activeQueueCounts.get(normalizeQueueLabel(queue)) ?? 0;
    function setQueueActive(queue: string, count: number): void {
        const label = normalizeQueueLabel(queue);
        const boundedCount = Math.max(0, Number.isFinite(count) ? count : 0);
        activeQueueCounts.set(label, boundedCount);
        queueActiveJobs.set({ queue: label }, boundedCount);
    }
    function recordQueueEnqueue(queue: string, job: string): void {
        queueJobOutcomesTotal.inc({ queue: normalizeQueueLabel(queue), job: normalizeJobLabel(job), outcome: 'success' }, 0);
    }
    function recordQueueWait(queue: string, job: string, durationMs: number): void {
        queueWaitSeconds.observe({ queue: normalizeQueueLabel(queue), job: normalizeJobLabel(job) }, Math.max(0, durationMs) / 1000);
    }
    function recordQueueStart(queue: string, job: string, waitSeconds: number): void {
        recordQueueWait(queue, job, waitSeconds * 1000);
        setQueueActive(queue, getQueueActive(queue) + 1);
    }
    function recordQueueJobDuration(queue: string, job: string, durationMs: number): void {
        queueJobDurationSeconds.observe({ queue: normalizeQueueLabel(queue), job: normalizeJobLabel(job) }, Math.max(0, durationMs) / 1000);
    }
    function recordQueueOutcome(queue: string, job: string, outcome: string): void {
        const label = normalizeQueueLabel(queue);
        if (outcome === 'success' || outcome === 'retry' || outcome === 'failure') {
            setQueueActive(label, Math.max(0, getQueueActive(label) - 1));
        }
        queueJobOutcomesTotal.inc({ queue: label, job: normalizeJobLabel(job), outcome: normalizeOutcomeLabel(outcome) });
    }
    function recordRedisOperation(operation: string, durationMs: number): void {
        const safeOperation = ['get', 'set', 'del', 'ping', 'connect', 'publish', 'subscribe', 'unknown'].includes(operation)
            ? operation
            : 'unknown';
        redisOperationDurationSeconds.observe({ operation: safeOperation }, Math.max(0, durationMs) / 1000);
    }

    function recordDbQuery(operation: string, store: string, durationMs: number): void {
        dbQueryDuration.observe({ operation, store }, durationMs / 1000);
    }

    function setActivePlugins(count: number): void {
        activePlugins.set(count);
    }

    function setWorkerMemory(plugin: string, bytes: number): void {
        workerMemoryUsage.set({ plugin: plugin === 'worker' ? 'worker' : 'plugin' }, bytes);
    }

    function setRedisConnections(count: number): void {
        redisConnections.set(count);
    }

    function setAnalyticsCacheSize(type: string, count: number): void {
        analyticsCacheSize.set({ type }, count);
    }

    function setSpamTrackerSize(guild: string, count: number): void {
        spamTrackerSize.set({ guild }, count);
    }

    function setEventBusHandlers(event: string, count: number): void {
        eventBusHandlers.set({ event }, count);
    }

    function recordHttpRequest(method: string, path: string, status: number | string, durationMs: number): void {
        httpRequestsTotal.inc({ method, path, status: String(status) });
        httpRequestDuration.observe({ method, path }, durationMs / 1000);
    }

    function recordError(type: string, component: string): void {
        errorsTotal.inc({ type, component });
    }

    function recordPluginLoad(plugin: string, durationMs: number): void {
        pluginLoadDuration.observe({ plugin }, durationMs / 1000);
    }

    function recordStartupDuration(durationMs: number): void {
        startupDuration.observe(durationMs / 1000);
    }

    function recordDoraDeployment(environment: string, success: boolean): void {
        doraDeploymentFrequency.inc({ environment });
        doraChangeTotal.inc({ environment });
        if (!success) {
            doraChangeFailureTotal.inc({ environment });
        }
    }

    function recordDoraLeadTime(environment: string, seconds: number): void {
        doraLeadTimeSeconds.observe({ environment }, seconds);
    }

    function recordDoraMTTR(environment: string, severity: string, seconds: number): void {
        doraMTTRSeconds.observe({ environment, severity }, seconds);
    }

    return {
        register,
        commandsTotal,
        commandDuration,
        queueDepth,
        queueJobsTotal,
        queueWaitSeconds,
        queueJobDurationSeconds,
        queueActiveJobs,
        queueJobOutcomesTotal,
        redisOperationDurationSeconds,
        eventLoopDelaySeconds,
        dbQueryDuration,
        activePlugins,
        workerMemoryUsage,
        redisConnections,
        analyticsCacheSize,
        spamTrackerSize,
        eventBusHandlers,
        httpRequestsTotal,
        httpRequestDuration,
        errorsTotal,
        pluginLoadDuration,
        startupDuration,
        gatewayConnected,
        recordCommand,
        recordCommandDuration,
        setQueueDepth,
        recordQueueEnqueue,
        recordQueueWait,
        recordQueueStart,
        recordQueueJobDuration,
        setQueueActive,
        recordQueueOutcome,
        recordRedisOperation,
        recordDbQuery,
        setActivePlugins,
        setWorkerMemory,
        setRedisConnections,
        setAnalyticsCacheSize,
        setSpamTrackerSize,
        setEventBusHandlers,
        recordHttpRequest,
        recordError,
        recordPluginLoad,
        recordStartupDuration,
        recordDoraDeployment,
        recordDoraLeadTime,
        recordDoraMTTR,
        doraDeploymentFrequency,
        doraLeadTimeSeconds,
        doraMTTRSeconds,
        doraChangeFailureTotal,
        doraChangeTotal
    };
}