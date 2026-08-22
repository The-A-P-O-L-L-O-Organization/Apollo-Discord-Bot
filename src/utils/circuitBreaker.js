// Circuit Breaker Utility
// Implements circuit breaker pattern for external API resilience
import { logger } from './utils/logger.js';

import { EventEmitter } from 'events';

/**
 * Circuit breaker states
 */
export const CircuitState = {
    CLOSED: 'closed',     // Normal operation, requests go through
    OPEN: 'open',         // Failing, requests blocked
    HALF_OPEN: 'half_open' // Testing if service recovered
};

/**
 * Circuit breaker configuration
 */
export const DEFAULT_CONFIG = {
    failureThreshold: 5,        // Number of failures before opening
    successThreshold: 2,        // Number of successes in half-open before closing
    timeout: 30000,             // Time in ms before trying half-open
    rollingWindow: 60000,       // Time window for failure counting
    minimumRequests: 10,        // Minimum requests before evaluating
    excludedErrors: []          // Error types/codes that don't count as failures
};

/**
 * Circuit Breaker class
 */
export class CircuitBreaker extends EventEmitter {
    constructor(name, config = {}) {
        super();
        this.name = name;
        this.config = { ...DEFAULT_CONFIG, ...config };
        
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.requests = 0;
        this.lastFailureTime = 0;
        this.lastStateChange = Date.now();
        
        // Rolling window for failure tracking
        this.failureTimestamps = [];
    }
    
    /**
     * Executes a function with circuit breaker protection
     * @param {Function} fn - Async function to execute
     * @returns {Promise<any>} Result of the function
     */
    async execute(fn) {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() - this.lastFailureTime >= this.config.timeout) {
                this._transitionToHalfOpen();
            } else {
                throw new CircuitBreakerOpenError(this.name);
            }
        }
        
        this.requests++;
        
        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure(error);
            throw error;
        }
    }
    
    /**
     * Handles successful execution
     */
    _onSuccess() {
        this._cleanOldFailures();
        
        if (this.state === CircuitState.HALF_OPEN) {
            this.successes++;
            if (this.successes >= this.config.successThreshold) {
                this._transitionToClosed();
            }
        } else if (this.state === CircuitState.CLOSED) {
            // Reset failure count on success in closed state
            this.failures = 0;
            this.failureTimestamps = [];
        }
    }
    
    /**
     * Handles failed execution
     */
    _onFailure(error) {
        this._cleanOldFailures();
        
        // Check if error should be excluded
        if (this._isExcludedError(error)) {
            return;
        }
        
        this.failures++;
        this.failureTimestamps.push(Date.now());
        this.lastFailureTime = Date.now();
        
        if (this.state === CircuitState.HALF_OPEN) {
            // Any failure in half-open goes back to open
            this._transitionToOpen();
        } else if (this.state === CircuitState.CLOSED) {
            // Check if we should open the circuit
            if (this._shouldOpen()) {
                this._transitionToOpen();
            }
        }
    }
    
    /**
     * Checks if error should be excluded from failure counting
     */
    _isExcludedError(error) {
        if (!this.config.excludedErrors.length) {return false;}
        
        // Check error code
        if (error.code && this.config.excludedErrors.includes(error.code)) {
            return true;
        }
        
        // Check error name
        if (error.name && this.config.excludedErrors.includes(error.name)) {
            return true;
        }
        
        // Check HTTP status codes (convert to string for comparison)
        if (error.status && this.config.excludedErrors.includes(String(error.status))) {
            return true;
        }
        
        if (error.response?.status && this.config.excludedErrors.includes(String(error.response.status))) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Cleans old failure timestamps outside the rolling window
     */
    _cleanOldFailures() {
        const cutoff = Date.now() - this.config.rollingWindow;
        this.failureTimestamps = this.failureTimestamps.filter(ts => ts > cutoff);
        this.failures = this.failureTimestamps.length;
    }
    
    /**
     * Determines if circuit should open
     */
    _shouldOpen() {
        // Need minimum requests before evaluating
        if (this.requests < this.config.minimumRequests) {
            return false;
        }
        
        // Check failure threshold
        return this.failures >= this.config.failureThreshold;
    }
    
    /**
     * Transitions to OPEN state
     */
    _transitionToOpen() {
        this.state = CircuitState.OPEN;
        this.lastStateChange = Date.now();
        this.successes = 0;
        this.emit('open', { name: this.name, failures: this.failures });
        logger.info(`[CIRCUIT] ${this.name} opened after ${this.failures} failures`);
    }
    
    /**
     * Transitions to HALF_OPEN state
     */
    _transitionToHalfOpen() {
        this.state = CircuitState.HALF_OPEN;
        this.lastStateChange = Date.now();
        this.successes = 0;
        this.emit('half_open', { name: this.name });
        logger.info(`[CIRCUIT] ${this.name} half-open (testing recovery)`);
    }
    
    /**
     * Transitions to CLOSED state
     */
    _transitionToClosed() {
        this.state = CircuitState.CLOSED;
        this.lastStateChange = Date.now();
        this.failures = 0;
        this.failureTimestamps = [];
        this.successes = 0;
        this.requests = 0;
        this.emit('close', { name: this.name });
        logger.info(`[CIRCUIT] ${this.name} closed (recovered)`);
    }
    
    /**
     * Gets current circuit breaker status
     */
    getStatus() {
        return {
            name: this.name,
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            requests: this.requests,
            lastStateChange: this.lastStateChange,
            lastFailureTime: this.lastFailureTime,
            config: this.config
        };
    }
    
    /**
     * Manually resets the circuit breaker
     */
    reset() {
        this._transitionToClosed();
    }
    
    /**
     * Manually forces the circuit open
     */
    forceOpen() {
        this._transitionToOpen();
    }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
    constructor(name) {
        super(`Circuit breaker "${name}" is OPEN`);
        this.name = 'CircuitBreakerOpenError';
        this.circuitName = name;
    }
}

/**
 * Circuit Breaker Registry - manages multiple circuit breakers
 */
export class CircuitBreakerRegistry {
    constructor() {
        this.breakers = new Map();
    }
    
    /**
     * Gets or creates a circuit breaker
     */
    get(name, config) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker(name, config));
        }
        return this.breakers.get(name);
    }
    
    /**
     * Executes a function with a named circuit breaker
     */
    async execute(name, fn, config) {
        const breaker = this.get(name, config);
        return breaker.execute(fn);
    }
    
    /**
     * Gets status of all circuit breakers
     */
    getAllStatus() {
        const status = {};
        for (const [name, breaker] of this.breakers) {
            status[name] = breaker.getStatus();
        }
        return status;
    }
    
    /**
     * Gets status of a specific circuit breaker
     */
    getStatus(name) {
        const breaker = this.breakers.get(name);
        return breaker ? breaker.getStatus() : null;
    }
    
    /**
     * Resets a specific circuit breaker
     */
    reset(name) {
        const breaker = this.breakers.get(name);
        if (breaker) {
            breaker.reset();
        }
    }
    
    /**
     * Resets all circuit breakers
     */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.reset();
        }
    }
}

// Global registry instance
export const circuitBreakers = new CircuitBreakerRegistry();

/**
 * Creates a circuit breaker for a specific external service
 * @param {string} serviceName - Name of the service (e.g., 'openai', 'twitch', 'youtube', 'github')
 * @param {Object} config - Circuit breaker configuration
 * @returns {CircuitBreaker}
 */
export function createServiceBreaker(serviceName, config = {}) {
    const serviceConfigs = {
        openai: {
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 60000,
            excludedErrors: ['ECONNREFUSED', 'ETIMEDOUT', '429', '500', '502', '503', '504']
        },
        twitch: {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 30000,
            excludedErrors: ['ECONNREFUSED', 'ETIMEDOUT', '429', '500', '502', '503', '504']
        },
        youtube: {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 30000,
            excludedErrors: ['ECONNREFUSED', 'ETIMEDOUT', '429', '500', '502', '503', '504']
        },
        github: {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 30000,
            excludedErrors: ['ECONNREFUSED', 'ETIMEDOUT', '429', '500', '502', '503', '504']
        },
        discord: {
            failureThreshold: 10,
            successThreshold: 3,
            timeout: 15000,
            excludedErrors: ['ECONNREFUSED', 'ETIMEDOUT', '429', '500', '502', '503', '504']
        }
    };
    
    const defaultConfig = serviceConfigs[serviceName] || {};
    return circuitBreakers.get(serviceName, { ...defaultConfig, ...config });
}

export default {
    CircuitBreaker,
    CircuitBreakerRegistry,
    CircuitBreakerOpenError,
    CircuitState,
    circuitBreakers,
    createServiceBreaker
};