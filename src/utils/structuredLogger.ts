// Structured Logger
// JSON logging with levels, correlation IDs, and structured fields

import { logger } from './logger.js';

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const DEFAULT_LEVEL = process.env['LOG_LEVEL'] ?? 'info';
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';

let _logLevel = LOG_LEVELS[DEFAULT_LEVEL as LogLevel] ?? LOG_LEVELS.info;
let _correlationId: string | null = null;

/**
 * Sets the minimum log level
 * @param level - Log level (debug, info, warn, error, fatal)
 */
export function setLogLevel(level: string): void {
    _logLevel = LOG_LEVELS[level as LogLevel] ?? LOG_LEVELS.info;
}

/**
 * Gets current log level
 * @returns Current log level string
 */
export function getLogLevel(): string {
    return Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k as LogLevel] === _logLevel) ?? 'info';
}

/**
 * Sets correlation ID for request tracing
 * @param id - Correlation ID
 */
export function setCorrelationId(id: string): void {
    _correlationId = id;
}

/**
 * Clears correlation ID
 */
export function clearCorrelationId(): void {
    _correlationId = null;
}

/**
 * Generates a new correlation ID
 * @returns New correlation ID string
 */
export function generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Formats log entry as JSON
 * @private
 */
function _formatLog(level: string, message: string, meta: Record<string, unknown> = {}): string {
    const entry: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta
    };

    if (_correlationId) {
        entry['correlationId'] = _correlationId;
    }

    // Add process info in development
    if (!IS_PRODUCTION) {
        entry['pid'] = process.pid;
    }

    return JSON.stringify(entry);
}

/**
 * Logs a debug message
 * @param message - Log message
 * @param meta - Additional metadata
 */
export function debug(message: string, meta: Record<string, unknown> = {}): void {
    if (_logLevel <= LOG_LEVELS.debug) {
        logger.info(_formatLog('debug', message, meta));
    }
}

/**
 * Logs an info message
 * @param message - Log message
 * @param meta - Additional metadata
 */
export function info(message: string, meta: Record<string, unknown> = {}): void {
    if (_logLevel <= LOG_LEVELS.info) {
        logger.info(_formatLog('info', message, meta));
    }
}

/**
 * Logs a warning message
 * @param message - Log message
 * @param meta - Additional metadata
 */
export function warn(message: string, meta: Record<string, unknown> = {}): void {
    if (_logLevel <= LOG_LEVELS.warn) {
        logger.warn(_formatLog('warn', message, meta));
    }
}

/**
 * Logs an error message
 * @param message - Log message
 * @param meta - Additional metadata (error, stack, etc.)
 */
export function error(message: string, meta: Record<string, unknown> = {}): void {
    if (_logLevel <= LOG_LEVELS.error) {
        logger.error(_formatLog('error', message, meta));
    }
}

/**
 * Logs a fatal message and optionally exits
 * @param message - Log message
 * @param meta - Additional metadata
 * @param exit - Whether to exit process
 */
export function fatal(message: string, meta: Record<string, unknown> = {}, exit = true): void {
    logger.error(_formatLog('fatal', message, meta));
    if (exit) {
        process.exit(1);
    }
}

interface ChildLogger {
    debug: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    fatal: (message: string, meta?: Record<string, unknown>, exit?: boolean) => void;
    child: (childContext: Record<string, unknown>) => ChildLogger;
}

/**
 * Creates a child logger with additional context
 * @param context - Context to include in all logs
 * @returns Child logger with same methods
 */
export function createChildLogger(context: Record<string, unknown> = {}): ChildLogger {
    return {
        debug: (message: string, meta: Record<string, unknown> = {}) => debug(message, { ...context, ...meta }),
        info: (message: string, meta: Record<string, unknown> = {}) => info(message, { ...context, ...meta }),
        warn: (message: string, meta: Record<string, unknown> = {}) => warn(message, { ...context, ...meta }),
        error: (message: string, meta: Record<string, unknown> = {}) => error(message, { ...context, ...meta }),
        fatal: (message: string, meta: Record<string, unknown> = {}, exit = true) => fatal(message, { ...context, ...meta }, exit),
        child: (childContext: Record<string, unknown>) => createChildLogger({ ...context, ...childContext })
    };
}

/**
 * Express/Connect middleware for request logging
 * @returns Middleware function
 */
export function requestLogger(): (req: { headers: Record<string, string | string[] | undefined>; method: string; url: string; ip?: string; get: (name: string) => string | undefined }, res: { setHeader: (name: string, value: string | number | string[]) => void; send: (body: unknown) => unknown; statusCode: number }, next: () => void) => void {
    return (req, res, next) => {
        const start = Date.now();
        const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();

        // Set correlation ID for this request
        const prevCorrelationId = _correlationId;
        _correlationId = correlationId;

        // Add correlation ID to response headers
        res.setHeader('X-Correlation-ID', correlationId);

        // Log request
        info('HTTP Request', {
            method: req.method,
            url: req.url,
            ip: req.ip,
            userAgent: req.get('user-agent')
        });

        // Log response
        const originalSend = res.send;
        res.send = function(body: unknown) {
            const duration = Date.now() - start;
            info('HTTP Response', {
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                durationMs: duration
            });
            _correlationId = prevCorrelationId;
            return originalSend.call(this, body);
        };

        next();
    };
}

/**
 * Creates a logger for a specific plugin
 * @param pluginName - Plugin name
 * @returns Plugin logger
 */
export function createPluginLogger(pluginName: string): ChildLogger {
    return createChildLogger({ plugin: pluginName });
}

export default {
    debug,
    info,
    warn,
    error,
    fatal,
    setLogLevel,
    getLogLevel,
    setCorrelationId,
    clearCorrelationId,
    generateCorrelationId,
    createChildLogger,
    requestLogger,
    createPluginLogger
};