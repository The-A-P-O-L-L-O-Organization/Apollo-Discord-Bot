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
export function recordCommand(command, guild, status) {
    commandsTotal.inc({ command, guild: guild || 'dm', status });
}

export function recordCommandDuration(command, durationMs) {
    commandDuration.observe({ command }, durationMs / 1000);
}

export function setQueueDepth(queue, depth) {
    queueDepth.set({ queue }, depth);
}

export function recordDbQuery(operation, store, durationMs) {
    dbQueryDuration.observe({ operation, store }, durationMs / 1000);
}

export function setActivePlugins(count) {
    activePlugins.set(count);
}

export function setWorkerMemory(plugin, bytes) {
    workerMemoryUsage.set({ plugin }, bytes);
}

export function setRedisConnections(count) {
    redisConnections.set(count);
}

export function setAnalyticsCacheSize(type, count) {
    analyticsCacheSize.set({ type }, count);
}

export function setSpamTrackerSize(guild, count) {
    spamTrackerSize.set({ guild }, count);
}

export function setEventBusHandlers(event, count) {
    eventBusHandlers.set({ event }, count);
}

export function recordHttpRequest(method, path, status, durationMs) {
    httpRequestsTotal.inc({ method, path, status: String(status) });
    httpRequestDuration.observe({ method, path }, durationMs / 1000);
}

export function recordError(type, component) {
    errorsTotal.inc({ type, component });
}

export function recordPluginLoad(plugin, durationMs) {
    pluginLoadDuration.observe({ plugin }, durationMs / 1000);
}

export function recordStartupDuration(durationMs) {
    startupDuration.observe(durationMs / 1000);
}

export function recordGatewayLatency(shard, latencyMs) {
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
 * @param {Object} options - Options for the metrics
 * @param {string} options.prefix - Prefix for all metric names (default: 'apollo_')
 * @returns {Object} Object containing register and all metric functions
 */
export function createMetrics({ prefix = 'apollo_' } = {}) {
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
    function recordCommand(command, guild, status) {
        commandsTotal.inc({ command, guild: guild || 'dm', status });
    }

    function recordCommandDuration(command, durationMs) {
        commandDuration.observe({ command }, durationMs / 1000);
    }

    function setQueueDepth(queue, depth) {
        queueDepth.set({ queue }, depth);
    }

    function recordDbQuery(operation, store, durationMs) {
        dbQueryDuration.observe({ operation, store }, durationMs / 1000);
    }

    function setActivePlugins(count) {
        activePlugins.set(count);
    }

    function setWorkerMemory(plugin, bytes) {
        workerMemoryUsage.set({ plugin }, bytes);
    }

    function setRedisConnections(count) {
        redisConnections.set(count);
    }

    function setAnalyticsCacheSize(type, count) {
        analyticsCacheSize.set({ type }, count);
    }

    function setSpamTrackerSize(guild, count) {
        spamTrackerSize.set({ guild }, count);
    }

    function setEventBusHandlers(event, count) {
        eventBusHandlers.set({ event }, count);
    }

    function recordHttpRequest(method, path, status, durationMs) {
        httpRequestsTotal.inc({ method, path, status: String(status) });
        httpRequestDuration.observe({ method, path }, durationMs / 1000);
    }

    function recordError(type, component) {
        errorsTotal.inc({ type, component });
    }

    function recordPluginLoad(plugin, durationMs) {
        pluginLoadDuration.observe({ plugin }, durationMs / 1000);
    }

    function recordStartupDuration(durationMs) {
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
