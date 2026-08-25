// Distributed Tracing Foundation using AsyncLocalStorage
// Provides request-scoped context propagation for trace IDs, span IDs, and metadata

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID as cryptoRandomUUID } from 'crypto';

// Global AsyncLocalStorage instance for trace context
const traceContext = new AsyncLocalStorage();

/**
 * Generates a new trace ID
 * @returns {string} Trace ID
 */
export function generateTraceId() {
    return cryptoRandomUUID();
}

/**
 * Generates a new span ID
 * @returns {string} Span ID
 */
export function generateSpanId() {
    return cryptoRandomUUID().slice(0, 16);
}

/**
 * Runs a function within a trace context
 * @param {Object} context - Trace context object
 * @param {Function} fn - Function to run
 * @returns {Promise<*>} Result of the function
 */
export function runWithTrace(context, fn) {
    return traceContext.run(context, fn);
}

/**
 * Gets the current trace context
 * @returns {Object|null} Current trace context or null if not in a trace
 */
export function getTraceContext() {
    return traceContext.getStore() || null;
}

/**
 * Gets the current trace ID
 * @returns {string|null} Current trace ID or null
 */
export function getTraceId() {
    const ctx = getTraceContext();
    return ctx?.traceId || null;
}

/**
 * Gets the current span ID
 * @returns {string|null} Current span ID or null
 */
export function getSpanId() {
    const ctx = getTraceContext();
    return ctx?.spanId || null;
}

/**
 * Gets the current parent span ID
 * @returns {string|null} Current parent span ID or null
 */
export function getParentSpanId() {
    const ctx = getTraceContext();
    return ctx?.parentSpanId || null;
}

/**
 * Creates a child span context
 * @param {Object} options - Span options
 * @param {string} options.name - Span name
 * @param {Object} options.attributes - Span attributes
 * @returns {Object} Child span context
 */
export function createChildSpan({ name, attributes = {} }) {
    const parentCtx = getTraceContext();
    return {
        traceId: parentCtx?.traceId || generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: parentCtx?.spanId || null,
        name,
        attributes,
        startTime: Date.now()
    };
}

/**
 * Runs a function within a child span
 * @param {Object} span - Span context
 * @param {Function} fn - Function to run
 * @returns {Promise<*>} Result of the function
 */
export function runWithSpan(span, fn) {
    const parentCtx = getTraceContext();
    const childCtx = {
        ...parentCtx,
        ...span,
        // Keep original traceId but update spanId and parentSpanId
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId
    };
    return traceContext.run(childCtx, fn);
}

/**
 * Adds attributes to the current span
 * @param {Object} attributes - Attributes to add
 */
export function addSpanAttributes(attributes) {
    const ctx = getTraceContext();
    if (ctx) {
        ctx.attributes = { ...ctx.attributes, ...attributes };
    }
}

/**
 * Gets all attributes from the current span
 * @returns {Object} Current span attributes
 */
export function getSpanAttributes() {
    const ctx = getTraceContext();
    return ctx?.attributes || {};
}

/**
 * Creates a trace context for an incoming request (e.g., HTTP, Discord interaction)
 * @param {Object} options - Options
 * @param {string} [options.traceId] - Existing trace ID from headers
 * @param {string} [options.parentSpanId] - Parent span ID from headers
 * @returns {Object} New trace context
 */
export function createTraceContext({ traceId, parentSpanId } = {}) {
    return {
        traceId: traceId || generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: parentSpanId || null,
        attributes: {},
        startTime: Date.now()
    };
}

/**
 * Middleware factory for Express/HTTP servers
 * @returns {Function} Express middleware
 */
export function traceMiddleware() {
    return (req, res, next) => {
        const traceId = req.headers['x-trace-id'] || req.headers['traceparent']?.split('-')[1];
        const parentSpanId = req.headers['x-parent-span-id'];
        
        const ctx = createTraceContext({ traceId, parentSpanId });
        
        // Add request info to span
        ctx.attributes = {
            'http.method': req.method,
            'http.url': req.url,
            'http.route': req.route?.path || req.path,
            'http.user_agent': req.headers['user-agent']
        };
        
        // Run handler with trace context
        traceContext.run(ctx, () => {
            // Add trace headers to response
            res.setHeader('x-trace-id', ctx.traceId);
            res.setHeader('x-span-id', ctx.spanId);
            next();
        });
    };
}

/**
 * Wraps a Discord interaction handler with tracing
 * @param {Function} handler - Interaction handler
 * @returns {Function} Wrapped handler
 * @note Expects interaction.customId to be in format "traceId:parentSpanId" if trace context is embedded.
 *       This format is used when interactions are created with trace context (e.g., from components/buttons).
 */
export function traceInteraction(handler) {
    return async(interaction) => {
        // Extract trace context from interaction if available
        // Expected customId format: "traceId:parentSpanId" (set when creating traced components)
        const traceId = interaction.customId?.split(':')[0];
        const parentSpanId = interaction.customId?.split(':')[1];
        
        const ctx = createTraceContext({ traceId, parentSpanId });
        ctx.attributes = {
            'discord.interaction.type': interaction.type,
            'discord.interaction.command': interaction.commandName,
            'discord.guild.id': interaction.guildId,
            'discord.channel.id': interaction.channelId,
            'discord.user.id': interaction.user?.id
        };
        
        return traceContext.run(ctx, () => handler(interaction));
    };
}

/**
 * Wraps a BullMQ job processor with tracing
 * @param {Function} processor - Job processor
 * @returns {Function} Wrapped processor
 */
export function traceJob(processor) {
    return async(job) => {
        // Extract trace context from job data
        const traceId = job.data?.traceId;
        const parentSpanId = job.data?.spanId;
        
        const ctx = createTraceContext({ traceId, parentSpanId });
        ctx.attributes = {
            'job.name': job.name,
            'job.id': job.id,
            'job.queue': job.queueName
        };
        
        return traceContext.run(ctx, () => processor(job));
    };
}

export default {
    traceContext,
    generateTraceId,
    generateSpanId,
    runWithTrace,
    getTraceContext,
    getTraceId,
    getSpanId,
    getParentSpanId,
    createChildSpan,
    runWithSpan,
    addSpanAttributes,
    getSpanAttributes,
    createTraceContext,
    traceMiddleware,
    traceInteraction,
    traceJob
};