// NSFW ConnectRPC Client
// Connects to the Rust NSFW detection worker via ConnectRPC (gRPC compatible)

import { createClient } from '@connectrpc/connect';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { create } from '@bufbuild/protobuf';
import { NsfwService, AnalyzeRequestSchema, AnalyzeResponseSchema, HealthCheckRequestSchema, HealthCheckResponseSchema } from '../generated/nsfw/nsfw/v1/nsfw_pb.js';
import type { AnalyzeRequest, AnalyzeResponse, HealthCheckRequest, HealthCheckResponse } from '../generated/nsfw/nsfw/v1/nsfw_pb.js';
import { logger } from '../utils/logger.js';

// gRPC status codes that should trigger fail-open after retries
const FAIL_OPEN_CODES = new Set([
    14, // UNAVAILABLE
    4,  // DEADLINE_EXCEEDED
    8   // RESOURCE_EXHAUSTED
]);

// Circuit breaker state
interface CircuitBreakerState {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 30_000; // 30 seconds
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const BASE_BACKOFF_MS = 100;

let cachedClient: ReturnType<typeof createClient<typeof NsfwService>> | null = null;

function getClient(): ReturnType<typeof createClient<typeof NsfwService>> {
    if (!cachedClient) {
        const address = process.env['NSFW_GRPC_ADDR'] ?? 'localhost:50051';
        const transport = createGrpcTransport({
            baseUrl: `http://${address}`,
        });
        cachedClient = createClient(NsfwService, transport);
    }
    return cachedClient;
}

/**
 * Checks if circuit breaker should allow requests
 * @returns true if requests should proceed, false if circuit is open
 */
function checkCircuitBreaker(): boolean {
    const now = Date.now();

    if (circuitBreaker.isOpen) {
        if (now - circuitBreaker.lastFailure >= CIRCUIT_BREAKER_RESET_MS) {
            // Reset circuit breaker after timeout
            circuitBreaker.isOpen = false;
            circuitBreaker.failures = 0;
            logger.info({ msg: '[NSFW Client] Circuit breaker reset - allowing requests' });
            return true;
        }
        return false;
    }
    return true;
}

/**
 * Records a failure and potentially opens the circuit breaker
 */
function recordFailure(): void {
    circuitBreaker.failures++;
    circuitBreaker.lastFailure = Date.now();

    if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitBreaker.isOpen = true;
        logger.warn({
            msg: `[NSFW Client] Circuit breaker opened after ${circuitBreaker.failures} failures`,
            failures: circuitBreaker.failures,
            resetInMs: CIRCUIT_BREAKER_RESET_MS
        });
    }
}

/**
 * Records a successful request (resets failure count)
 */
function recordSuccess(): void {
    if (circuitBreaker.failures > 0) {
        circuitBreaker.failures = 0;
    }
}

/**
 * Determines if a gRPC error code should trigger fail-open
 */
function isFailOpenError(code: number): boolean {
    return FAIL_OPEN_CODES.has(code);
}

/**
 * Sleeps for the specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Analyzes an image for NSFW content via ConnectRPC
 * @param imageUrl - URL of the image to analyze
 * @param threshold - Classification threshold (0.0-1.0)
 * @param guildId - Guild ID for logging/metrics
 * @param userId - User ID for logging/metrics
 * @returns Analysis result
 */
export async function analyzeImageGrpc(
    imageUrl: string,
    threshold: number,
    guildId: string,
    userId: string
): Promise<AnalyzeResponse> {
    // Check feature flag
    if (process.env['NSFW_USE_RUST'] !== 'true') {
        throw new Error('NSFW_USE_RUST not enabled');
    }

    // Check circuit breaker
    if (!checkCircuitBreaker()) {
        logger.warn({ msg: '[NSFW Client] Circuit breaker open - failing open' });
        return create(AnalyzeResponseSchema, {
            isNsfw: false,
            predictions: {},
            maxConfidence: 0,
            inferenceMs: 0n
        });
    }

    const client = getClient();
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
            const request = create(AnalyzeRequestSchema, {
                imageData: new Uint8Array(0),
                imageUrl,
                threshold,
                guildId,
                userId
            });

            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            const response = await client.analyze(request, { signal: controller.signal });
            clearTimeout(timeoutId);

            recordSuccess();
            return response;
        } catch (error) {
            lastError = error;
            if (timeoutId) clearTimeout(timeoutId);

            // Check if it's a ConnectRPC error with a code
            const connectError = error as { code?: number; message?: string };
            const code = connectError.code;

            if (attempt < MAX_RETRIES) {
                const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
                logger.warn({
                    msg: `[NSFW Client] Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms`,
                    error: connectError.message ?? String(error),
                    code,
                    attempt: attempt + 1,
                    maxRetries: MAX_RETRIES
                });
                await sleep(backoffMs);
                continue;
            }

            // All retries exhausted
            logger.error({
                msg: `[NSFW Client] All ${MAX_RETRIES + 1} attempts failed`,
                error: connectError.message ?? String(error),
                code
            });

            // Check if we should fail-open
            if (code !== undefined && isFailOpenError(code)) {
                recordFailure();
                return create(AnalyzeResponseSchema, {
                    isNsfw: false,
                    predictions: {},
                    maxConfidence: 0,
                    inferenceMs: 0n
                });
            }

            // For other errors, re-throw
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    // Should not reach here, but TypeScript needs it
    throw lastError instanceof Error ? lastError : new Error('Unknown error');
}

/**
 * Performs a health check on the NSFW ConnectRPC service
 * @returns Health check response
 */
export async function healthCheckGrpc(): Promise<HealthCheckResponse> {
    if (process.env['NSFW_USE_RUST'] !== 'true') {
        throw new Error('NSFW_USE_RUST not enabled');
    }

    const client = getClient();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await client.healthCheck(create(HealthCheckRequestSchema), { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error instanceof Error ? error : new Error(String(error));
    }
}

/**
 * Checks if the Rust NSFW worker is available
 * @returns true if available, false otherwise
 */
export async function isRustWorkerAvailable(): Promise<boolean> {
    if (process.env['NSFW_USE_RUST'] !== 'true') {
        return false;
    }

    try {
        const response = await healthCheckGrpc();
        return response.healthy === true;
    } catch {
        return false;
    }
}

/**
 * Resets the circuit breaker (for testing/admin purposes)
 */
export function resetCircuitBreaker(): void {
    circuitBreaker.failures = 0;
    circuitBreaker.lastFailure = 0;
    circuitBreaker.isOpen = false;
    logger.info({ msg: '[NSFW Client] Circuit breaker manually reset' });
}

/**
 * Gets current circuit breaker status
 */
export function getCircuitBreakerStatus(): CircuitBreakerState {
    return { ...circuitBreaker };
}