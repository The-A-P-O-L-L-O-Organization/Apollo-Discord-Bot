import pino from 'pino';
import { hostname } from 'node:os';
import { randomUUID as cryptoRandomUUID } from 'node:crypto';

// Generate a traceId for the service instance (fallback when no trace context)
const serviceTraceId = cryptoRandomUUID();

// Log sampling configuration
const LOG_SAMPLE_RATE = parseFloat(process.env['LOG_SAMPLE_RATE'] ?? '') || 1.0; // 1.0 = 100% (no sampling)

// Levels that should never be sampled (always logged)
const NEVER_SAMPLE_LEVELS = new Set(['fatal', 'error']);

/**
 * Creates a sampling function for pino
 * @param sampleRate - Sample rate (0.0 to 1.0)
 * @returns Sampling function
 */
function createSampler(sampleRate: number): (level: string) => boolean {
    if (sampleRate >= 1.0) {
        return () => true; // No sampling
    }
    if (sampleRate <= 0) {
        return (level: string) => NEVER_SAMPLE_LEVELS.has(level); // Only log never-sample levels
    }
    return (level: string) => NEVER_SAMPLE_LEVELS.has(level) || Math.random() < sampleRate;
}

const shouldSample = createSampler(LOG_SAMPLE_RATE);

// Create a logger instance for this module
const logger = pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: {
        service: 'apollo',
        pid: process.pid,
        hostname: hostname(),
        traceId: serviceTraceId
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Custom formatter to add trace context to each log entry
    formatters: {
        log: (object: Record<string, unknown>) => {
            return object;
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