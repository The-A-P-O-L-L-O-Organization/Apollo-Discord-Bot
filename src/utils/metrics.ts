// Metrics Utility
// Prometheus metrics for monitoring and observability
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { config } from '../config/config.js';

export const register = new Registry();
register.setDefaultLabels({ app: 'apollo-bot', pod: config.podId });

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register, prefix: 'apollo_' });

// Custom metrics
export const commandsTotal = new Counter({
    name: 'apollo_commands_total',
    help: 'Total commands executed',
    labelNames: ['command', 'guild', 'status'],
    registers: [register]
});

export const commandDuration = new Histogram({
    name: 'apollo_command_duration_seconds',
    help: 'Command execution duration in seconds',
    labelNames: ['command'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
    registers: [register]
});

export const queueDepth = new Gauge({
    name: 'apollo_queue_depth',
    help: 'Jobs waiting in queue',
    labelNames: ['queue'],
    registers: [register]
});

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

// Helper functions
export function recordCommand(command: string, guild: string | undefined, status: string): void {
    commandsTotal.inc({ command, guild: guild ?? 'dm', status });
}

export function recordCommandDuration(command: string, durationMs: number): void {
    commandDuration.observe({ command }, durationMs / 1000);
}

export function setQueueDepth(queue: string, depth: number): void {
    queueDepth.set({ queue }, depth);
}

export function recordDbQuery(operation: string, store: string, durationMs: number): void {
    dbQueryDuration.observe({ operation, store }, durationMs / 1000);
}

export function setActivePlugins(count: number): void {
    activePlugins.set(count);
}

export function setWorkerMemory(plugin: string, bytes: number): void {
    workerMemoryUsage.set({ plugin }, bytes);
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

export default {
    register,
    commandsTotal,
    commandDuration,
    queueDepth,
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
    recordGatewayLatency
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
    recordCommand: (command: string, guild: string | undefined, status: string) => void;
    recordCommandDuration: (command: string, durationMs: number) => void;
    setQueueDepth: (queue: string, depth: number) => void;
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
} {
    const register = new Registry();
    register.setDefaultLabels({ app: 'apollo-bot', pod: config.podId });
    collectDefaultMetrics({ register, prefix });

    // Custom metrics
    const commandsTotal = new Counter({
        name: `${prefix}commands_total`,
        help: 'Total commands executed',
        labelNames: ['command', 'guild', 'status'],
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

    // Helper functions (using locally created metrics)
    function recordCommand(command: string, guild: string | undefined, status: string): void {
        commandsTotal.inc({ command, guild: guild ?? 'dm', status });
    }

    function recordCommandDuration(command: string, durationMs: number): void {
        commandDuration.observe({ command }, durationMs / 1000);
    }

    function setQueueDepth(queue: string, depth: number): void {
        queueDepth.set({ queue }, depth);
    }

    function recordDbQuery(operation: string, store: string, durationMs: number): void {
        dbQueryDuration.observe({ operation, store }, durationMs / 1000);
    }

    function setActivePlugins(count: number): void {
        activePlugins.set(count);
    }

    function setWorkerMemory(plugin: string, bytes: number): void {
        workerMemoryUsage.set({ plugin }, bytes);
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

    return {
        register,
        commandsTotal,
        commandDuration,
        queueDepth,
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
        recordCommand,
        recordCommandDuration,
        setQueueDepth,
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
        recordStartupDuration
    };
}