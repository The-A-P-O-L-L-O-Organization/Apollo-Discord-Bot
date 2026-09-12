// Circuit Breaker Utility
// Implements circuit breaker pattern for external API resilience

import { logger } from './logger.js';
import { EventEmitter } from 'events';

/**
 * Circuit breaker states
 */
export const CircuitState = {
    CLOSED: 'closed',     // Normal operation, requests go through
    OPEN: 'open',         // Failing, requests blocked
    HALF_OPEN: 'half_open' // Testing if service recovered
} as const;

export type CircuitStateType = typeof CircuitState[keyof typeof CircuitState];

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    failureThreshold: number;        // Number of failures before opening
    successThreshold: number;        // Number of successes in half-open before closing
    timeout: number;                 // Time in ms before trying half-open
    rollingWindow: number;           // Time window for failure counting
    minimumRequests: number;         // Minimum requests before evaluating
    excludedErrors: (string | number)[];  // Error types/codes that don't count as failures
}

export const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    rollingWindow: 60000,
    minimumRequests: 10,
    excludedErrors: []
};

/**
 * Circuit Breaker class
 */
export class CircuitBreaker extends EventEmitter {
    public readonly name: string;
    public readonly config: CircuitBreakerConfig;

    public state: CircuitStateType = CircuitState.CLOSED;
    public failures = 0;
    public successes = 0;
    public requests = 0;
    public lastFailureTime = 0;
    public lastStateChange = Date.now();

    // Rolling window for failure tracking
    private failureTimestamps: number[] = [];

    constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
        super();
        this.name = name;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Executes a function with circuit breaker protection
     * @param {Function} fn - Async function to execute
     * @returns {Promise<T>} Result of the function
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
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
    private _onSuccess(): void {
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
    private _onFailure(error: unknown): void {
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
    private _isExcludedError(error: unknown): boolean {
        if (!this.config.excludedErrors.length) { return false; }

        // Check error code
        if (error && typeof error === 'object' && 'code' in error && this.config.excludedErrors.includes(String(error.code))) {
            return true;
        }

        // Check error name
        if (error && typeof error === 'object' && 'name' in error && this.config.excludedErrors.includes(String(error.name))) {
            return true;
        }

        // Check HTTP status codes (convert to string for comparison)
        if (error && typeof error === 'object' && 'status' in error && this.config.excludedErrors.includes(String(error.status))) {
            return true;
        }

        if (error && typeof error === 'object' && 'response' in error &&
            error.response && typeof error.response === 'object' && 'status' in error.response &&
            this.config.excludedErrors.includes(String(error.response.status))) {
            return true;
        }

        return false;
    }

    /**
     * Cleans old failure timestamps outside the rolling window
     */
    private _cleanOldFailures(): void {
        const cutoff = Date.now() - this.config.rollingWindow;
        this.failureTimestamps = this.failureTimestamps.filter(ts => ts > cutoff);
        this.failures = this.failureTimestamps.length;
    }

    /**
     * Determines if circuit should open
     */
    private _shouldOpen(): boolean {
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
    private _transitionToOpen(): void {
        this.state = CircuitState.OPEN;
        this.lastStateChange = Date.now();
        this.successes = 0;
        this.emit('open', { name: this.name, failures: this.failures });
        logger.info(`[CIRCUIT] ${this.name} opened after ${this.failures} failures`);
    }

    /**
     * Transitions to HALF_OPEN state
     */
    private _transitionToHalfOpen(): void {
        this.state = CircuitState.HALF_OPEN;
        this.lastStateChange = Date.now();
        this.successes = 0;
        this.emit('half_open', { name: this.name });
        logger.info(`[CIRCUIT] ${this.name} half-open (testing recovery)`);
    }

    /**
     * Transitions to CLOSED state
     */
    private _transitionToClosed(): void {
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
    getStatus(): CircuitBreakerStatus {
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
    reset(): void {
        this._transitionToClosed();
    }

    /**
     * Manually forces the circuit open
     */
    forceOpen(): void {
        this._transitionToOpen();
    }
}

export interface CircuitBreakerStatus {
    name: string;
    state: CircuitStateType;
    failures: number;
    successes: number;
    requests: number;
    lastStateChange: number;
    lastFailureTime: number;
    config: CircuitBreakerConfig;
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
    public readonly circuitName: string;

    constructor(name: string) {
        super(`Circuit breaker "${name}" is OPEN`);
        this.name = 'CircuitBreakerOpenError';
        this.circuitName = name;
    }
}

/**
 * Circuit Breaker Registry - manages multiple circuit breakers
 */
export class CircuitBreakerRegistry {
    private breakers = new Map<string, CircuitBreaker>();

    /**
     * Gets or creates a circuit breaker
     */
    get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker(name, config));
        }
        return this.breakers.get(name)!;
    }

    /**
     * Executes a function with a named circuit breaker
     */
    async execute<T>(name: string, fn: () => Promise<T>, config?: Partial<CircuitBreakerConfig>): Promise<T> {
        const breaker = this.get(name, config);
        return breaker.execute(fn);
    }

    /**
     * Gets status of all circuit breakers
     */
    getAllStatus(): Record<string, CircuitBreakerStatus> {
        const status: Record<string, CircuitBreakerStatus> = {};
        for (const [name, breaker] of this.breakers) {
            status[name] = breaker.getStatus();
        }
        return status;
    }

    /**
     * Gets status of a specific circuit breaker
     */
    getStatus(name: string): CircuitBreakerStatus | null {
        const breaker = this.breakers.get(name);
        return breaker ? breaker.getStatus() : null;
    }

    /**
     * Resets a specific circuit breaker
     */
    reset(name: string): void {
        const breaker = this.breakers.get(name);
        if (breaker) {
            breaker.reset();
        }
    }

    /**
     * Resets all circuit breakers
     */
    resetAll(): void {
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
export function createServiceBreaker(serviceName: string, config: Partial<CircuitBreakerConfig> = {}): CircuitBreaker {
    const serviceConfigs: Record<string, Partial<CircuitBreakerConfig>> = {
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