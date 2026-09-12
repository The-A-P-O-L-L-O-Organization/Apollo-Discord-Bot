// Distributed Tracing Foundation using AsyncLocalStorage
// Provides request-scoped context propagation for trace IDs, span IDs, and metadata

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID as cryptoRandomUUID } from 'node:crypto';

// Types for trace context
interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    name?: string;
    attributes: Record<string, unknown>;
    startTime: number;
}

// Global AsyncLocalStorage instance for trace context
const traceContext = new AsyncLocalStorage<TraceContext>();

/**
 * Generates a new trace ID
 * @returns Trace ID
 */
export function generateTraceId(): string {
    return cryptoRandomUUID();
}

/**
 * Generates a new span ID
 * @returns Span ID
 */
export function generateSpanId(): string {
    return cryptoRandomUUID().slice(0, 16);
}

/**
 * Runs a function within a trace context
 * @param context - Trace context object
 * @param fn - Function to run
 * @returns Result of the function
 */
export function runWithTrace<T>(context: TraceContext, fn: () => T): T {
    return traceContext.run(context, fn);
}

/**
 * Gets the current trace context
 * @returns Current trace context or null if not in a trace
 */
export function getTraceContext(): TraceContext | null {
    return traceContext.getStore() ?? null;
}

/**
 * Gets the current trace ID
 * @returns Current trace ID or null
 */
export function getTraceId(): string | null {
    const ctx = getTraceContext();
    return ctx?.traceId ?? null;
}

/**
 * Gets the current span ID
 * @returns Current span ID or null
 */
export function getSpanId(): string | null {
    const ctx = getTraceContext();
    return ctx?.spanId ?? null;
}

/**
 * Gets the current parent span ID
 * @returns Current parent span ID or null
 */
export function getParentSpanId(): string | null {
    const ctx = getTraceContext();
    return ctx?.parentSpanId ?? null;
}

/**
 * Creates a child span context
 * @param options - Span options
 * @returns Child span context
 */
export function createChildSpan(options: { name: string; attributes?: Record<string, unknown> }): TraceContext {
    const parentCtx = getTraceContext();
    return {
        traceId: parentCtx?.traceId ?? generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: parentCtx?.spanId ?? null,
        name: options.name,
        attributes: options.attributes ?? {},
        startTime: Date.now()
    };
}

/**
 * Runs a function within a child span
 * @param span - Span context
 * @param fn - Function to run
 * @returns Result of the function
 */
export function runWithSpan<T>(span: TraceContext, fn: () => T): T {
    const parentCtx = getTraceContext();
    const childCtx: TraceContext = {
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
 * @param attributes - Attributes to add
 */
export function addSpanAttributes(attributes: Record<string, unknown>): void {
    const ctx = getTraceContext();
    if (ctx) {
        ctx.attributes = { ...ctx.attributes, ...attributes };
    }
}

/**
 * Gets all attributes from the current span
 * @returns Current span attributes
 */
export function getSpanAttributes(): Record<string, unknown> {
    const ctx = getTraceContext();
    return ctx?.attributes ?? {};
}

/**
 * Creates a trace context for an incoming request (e.g., HTTP, Discord interaction)
 * @param options - Options
 * @returns New trace context
 */
export function createTraceContext(options: { traceId?: string; parentSpanId?: string } = {}): TraceContext {
    return {
        traceId: options.traceId ?? generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: options.parentSpanId ?? null,
        attributes: {},
        startTime: Date.now()
    };
}

/**
 * Middleware factory for Express/HTTP servers
 * @returns Express middleware
 */
export function traceMiddleware(): (req: unknown, res: unknown, next: () => void) => void {
    return (req: Record<string, unknown>, res: Record<string, unknown>, next: () => void): void => {
        const headers = (req.headers as Record<string, string>) ?? {};
        const traceId = headers['x-trace-id'] ?? headers['traceparent']?.split('-')[1];
        const parentSpanId = headers['x-parent-span-id'];
        
        const ctx = createTraceContext({ traceId, parentSpanId });
        
        // Add request info to span
        ctx.attributes = {
            'http.method': req.method,
            'http.url': req.url,
            'http.route': req.route?.path ?? req.path,
            'http.user_agent': headers['user-agent']
        };
        
        // Run handler with trace context
        traceContext.run(ctx, () => {
            // Add trace headers to response
            if (res.setHeader) {
                res.setHeader('x-trace-id', ctx.traceId);
                res.setHeader('x-span-id', ctx.spanId);
            }
            next();
        });
    };
}

/**
 * Wraps a Discord interaction handler with tracing
 * @param handler - Interaction handler
 * @returns Wrapped handler
 * @note Expects interaction.customId to be in format "traceId:parentSpanId" if trace context is embedded.
 *       This format is used when interactions are created with trace context (e.g., from components/buttons).
 */
export function traceInteraction<T extends Record<string, unknown>>(
    handler: (interaction: T) => Promise<unknown>
): (interaction: T) => Promise<unknown> {
    return async (interaction: T): Promise<unknown> => {
        // Extract trace context from interaction if available
        // Expected customId format: "traceId:parentSpanId" (set when creating traced components)
        const customId = interaction.customId as string | undefined;
        const traceId = customId?.split(':')[0];
        const parentSpanId = customId?.split(':')[1];
        
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
 * @param processor - Job processor
 * @returns Wrapped processor
 */
export function traceJob<T extends { data?: Record<string, unknown>; name: string; id: string; queueName: string }>(
    processor: (job: T) => Promise<unknown>
): (job: T) => Promise<unknown> {
    return async (job: T): Promise<unknown> => {
        // Extract trace context from job data
        const traceId = job.data?.traceId as string | undefined;
        const parentSpanId = job.data?.spanId as string | undefined;
        
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