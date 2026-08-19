import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMetrics } from '../../src/utils/metrics.js';

describe('Metrics', () => {
    let register;
    let metrics;

    beforeEach(() => {
        // Create fresh registry and metrics for each test
        const m = createMetrics({ prefix: 'test_' });
        register = m.register;
        metrics = m;
    });

    afterEach(() => {
        register.clear();
    });

    it('should register default metrics', async() => {
        const metricsList = await register.getMetricsAsJSON();
        expect(metricsList).toBeDefined();
        expect(Array.isArray(metricsList)).toBe(true);
    });

    it('should record command metrics', async() => {
        metrics.recordCommand('ping', 'guild1', 'success');
        metrics.recordCommand('ping', 'guild1', 'success');
        metrics.recordCommand('ping', 'guild2', 'error');
        
        const metricsList = await register.getMetricsAsJSON();
        const cmdMetric = metricsList.find(m => m.name === 'test_commands_total');
        expect(cmdMetric).toBeDefined();
    });

    it('should record command duration', async() => {
        metrics.recordCommandDuration('ping', 100);
        metrics.recordCommandDuration('ping', 200);
        
        const metricsList = await register.getMetricsAsJSON();
        const durationMetric = metricsList.find(m => m.name === 'test_command_duration_seconds');
        expect(durationMetric).toBeDefined();
    });

    it('should set queue depth', async() => {
        metrics.setQueueDepth('commands', 10);
        metrics.setQueueDepth('heavy', 5);
        
        const metricsList = await register.getMetricsAsJSON();
        const queueMetric = metricsList.find(m => m.name === 'test_queue_depth');
        expect(queueMetric).toBeDefined();
    });

    it('should record DB query duration', async() => {
        metrics.recordDbQuery('select', 'warnings', 50);
        metrics.recordDbQuery('insert', 'warnings', 100);
        
        const metricsList = await register.getMetricsAsJSON();
        const dbMetric = metricsList.find(m => m.name === 'test_db_query_duration_seconds');
        expect(dbMetric).toBeDefined();
    });

    it('should set active plugins count', async() => {
        metrics.setActivePlugins(7);
        
        const metricsList = await register.getMetricsAsJSON();
        const pluginMetric = metricsList.find(m => m.name === 'test_active_plugins');
        expect(pluginMetric).toBeDefined();
    });

    it('should set worker memory', async() => {
        metrics.setWorkerMemory('automod', 1024 * 1024 * 100); // 100MB
        
        const metricsList = await register.getMetricsAsJSON();
        const memMetric = metricsList.find(m => m.name === 'test_worker_memory_bytes');
        expect(memMetric).toBeDefined();
    });

    it('should set Redis connections', async() => {
        metrics.setRedisConnections(5);
        
        const metricsList = await register.getMetricsAsJSON();
        const redisMetric = metricsList.find(m => m.name === 'test_redis_connections');
        expect(redisMetric).toBeDefined();
    });

    it('should set analytics cache size', async() => {
        metrics.setAnalyticsCacheSize('commands', 100);
        metrics.setAnalyticsCacheSize('messages', 200);
        
        const metricsList = await register.getMetricsAsJSON();
        const cacheMetric = metricsList.find(m => m.name === 'test_analytics_cache_entries');
        expect(cacheMetric).toBeDefined();
    });

    it('should set spam tracker size', async() => {
        metrics.setSpamTrackerSize('guild1', 50);
        
        const metricsList = await register.getMetricsAsJSON();
        const spamMetric = metricsList.find(m => m.name === 'test_spam_tracker_entries');
        expect(spamMetric).toBeDefined();
    });

    it('should set event bus handlers', async() => {
        metrics.setEventBusHandlers('messageCreate', 10);
        
        const metricsList = await register.getMetricsAsJSON();
        const eventMetric = metricsList.find(m => m.name === 'test_eventbus_handlers');
        expect(eventMetric).toBeDefined();
    });

    it('should record HTTP requests', async() => {
        metrics.recordHttpRequest('GET', '/api/v1/bots', 200, 50);
        metrics.recordHttpRequest('POST', '/api/v1/bots', 201, 100);
        metrics.recordHttpRequest('GET', '/api/v1/bots', 404, 25);
        
        const metricsList = await register.getMetricsAsJSON();
        const httpMetric = metricsList.find(m => m.name === 'test_http_requests_total');
        expect(httpMetric).toBeDefined();
    });

    it('should record errors', async() => {
        metrics.recordError('validation', 'reportCommand');
        metrics.recordError('database', 'analyticsCollector');
        
        const metricsList = await register.getMetricsAsJSON();
        const errorMetric = metricsList.find(m => m.name === 'test_errors_total');
        expect(errorMetric).toBeDefined();
    });

    it('should record plugin load duration', async() => {
        metrics.recordPluginLoad('automod', 500);
        metrics.recordPluginLoad('utility', 100);
        
        const metricsList = await register.getMetricsAsJSON();
        const pluginMetric = metricsList.find(m => m.name === 'test_plugin_load_duration_seconds');
        expect(pluginMetric).toBeDefined();
    });

    it('should record startup duration', async() => {
        metrics.recordStartupDuration(2500);
        
        const metricsList = await register.getMetricsAsJSON();
        const startupMetric = metricsList.find(m => m.name === 'test_startup_duration_seconds');
        expect(startupMetric).toBeDefined();
    });

    it('should expose metrics in Prometheus format', async() => {
        metrics.recordCommand('test', 'guild1', 'success');
        
        const output = await register.metrics();
        expect(output).toContain('test_commands_total');
        expect(output).toContain('test');
        expect(output).toContain('guild1');
        expect(output).toContain('success');
    });

    it('should expose content type', () => {
        expect(register.contentType).toContain('text/plain');
    });
});