/* eslint-disable no-console */
// Structured Logger
// JSON logging with levels, correlation IDs, and structured fields

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
};

const DEFAULT_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let _logLevel = LOG_LEVELS[DEFAULT_LEVEL] ?? LOG_LEVELS.info;
let _correlationId = null;

/**
 * Sets the minimum log level
 * @param {string} level - Log level (debug, info, warn, error, fatal)
 */
export function setLogLevel(level) {
    _logLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
}

/**
 * Gets current log level
 * @returns {string}
 */
export function getLogLevel() {
    return Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === _logLevel) || 'info';
}

/**
 * Sets correlation ID for request tracing
 * @param {string} id - Correlation ID
 */
export function setCorrelationId(id) {
    _correlationId = id;
}

/**
 * Clears correlation ID
 */
export function clearCorrelationId() {
    _correlationId = null;
}

/**
 * Generates a new correlation ID
 * @returns {string}
 */
export function generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Formats log entry as JSON
 * @private
 */
function _formatLog(level, message, meta = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta
    };
    
    if (_correlationId) {
        entry.correlationId = _correlationId;
    }
    
    // Add process info in development
    if (!IS_PRODUCTION) {
        entry.pid = process.pid;
    }
    
    return JSON.stringify(entry);
}

/**
 * Logs a debug message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
export function debug(message, meta = {}) {
    if (_logLevel <= LOG_LEVELS.debug) {
        console.log(_formatLog('debug', message, meta));
    }
}

/**
 * Logs an info message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
export function info(message, meta = {}) {
    if (_logLevel <= LOG_LEVELS.info) {
        console.log(_formatLog('info', message, meta));
    }
}

/**
 * Logs a warning message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 */
export function warn(message, meta = {}) {
    if (_logLevel <= LOG_LEVELS.warn) {
        console.warn(_formatLog('warn', message, meta));
    }
}

/**
 * Logs an error message
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata (error, stack, etc.)
 */
export function error(message, meta = {}) {
    if (_logLevel <= LOG_LEVELS.error) {
        console.error(_formatLog('error', message, meta));
    }
}

/**
 * Logs a fatal message and optionally exits
 * @param {string} message - Log message
 * @param {Object} meta - Additional metadata
 * @param {boolean} exit - Whether to exit process
 */
export function fatal(message, meta = {}, exit = true) {
    console.error(_formatLog('fatal', message, meta));
    if (exit) {
        process.exit(1);
    }
}

/**
 * Creates a child logger with additional context
 * @param {Object} context - Context to include in all logs
 * @returns {Object} Child logger with same methods
 */
export function createChildLogger(context = {}) {
    return {
        debug: (message, meta = {}) => debug(message, { ...context, ...meta }),
        info: (message, meta = {}) => info(message, { ...context, ...meta }),
        warn: (message, meta = {}) => warn(message, { ...context, ...meta }),
        error: (message, meta = {}) => error(message, { ...context, ...meta }),
        fatal: (message, meta = {}, exit = true) => fatal(message, { ...context, ...meta }, exit),
        child: (childContext) => createChildLogger({ ...context, ...childContext })
    };
}

/**
 * Express/Connect middleware for request logging
 * @returns {Function} Middleware function
 */
export function requestLogger() {
    return (req, res, next) => {
        const start = Date.now();
        const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
        
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
        res.send = function(body) {
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
 * @param {string} pluginName - Plugin name
 * @returns {Object} Plugin logger
 */
export function createPluginLogger(pluginName) {
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