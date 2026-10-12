import pino from 'pino';
import { hostname } from 'node:os';
import { randomUUID as cryptoRandomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { ZERO_TRACE_ID, ZERO_SPAN_ID } from '../observability/traceparent.js';

// Generate a traceId for the service instance (fallback when no trace context)
const serviceTraceId = cryptoRandomUUID();

// Log sampling configuration
const LOG_SAMPLE_RATE = parseFloat(process.env['LOG_SAMPLE_RATE'] ?? '') || 1.0; // 1.0 = 100% (no sampling)

// Levels that should never be sampled (always logged)
const NEVER_SAMPLE_LEVELS = new Set(['fatal', 'error']);

// Detect production mode
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

/**
 * Creates a sampling function for pino
 * @param sampleRate - Sample rate (0.0 to 1.0)
 * @returns Sampling function
 */
function createSampler(sampleRate: number): (_level: string) => boolean {
    if (sampleRate >= 1.0) {
        return () => true; // No sampling
    }
    if (sampleRate <= 0) {
        return (_level: string) => NEVER_SAMPLE_LEVELS.has(_level); // Only log never-sample levels
    }
    return (_level: string) => NEVER_SAMPLE_LEVELS.has(_level) || Math.random() < sampleRate;
}

createSampler(LOG_SAMPLE_RATE); // Initialize sampler (logger uses internal sampling)

export function traceLogFields(): Record<string, string> {
    const spanContext = trace.getActiveSpan()?.spanContext();
    if (!spanContext || spanContext.traceId === ZERO_TRACE_ID || spanContext.spanId === ZERO_SPAN_ID) {
        return {};
    }
    return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
}

// Create a logger instance for this module
const logger = pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: {
        service: 'apollo',
        pid: process.pid,
        hostname: hostname(),
        traceId: serviceTraceId
    },
    mixin: traceLogFields,
    timestamp: pino.stdTimeFunctions.isoTime,
    // Use pretty print in development, JSON in production
    transport: IS_PRODUCTION ? undefined : {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname,service,traceId',
            singleLine: true
        }
    }
});

// Export the logger as-is without wrapping - pino's types are complex
export { logger };

/**
 * Factory function to create a Pino logger with context
 * @param context - Context object to add to log output
 * @returns Logger instance
 */
export function createLogger(context: Record<string, unknown>): typeof logger {
    return logger.child(context);
}