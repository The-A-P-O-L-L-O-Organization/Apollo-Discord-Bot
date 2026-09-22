// NSFW gRPC Client
// Connects to the Rust NSFW detection worker via gRPC

import { loadSync } from '@grpc/proto-loader';
import { loadPackageDefinition, credentials, type ClientOptions, type ChannelOptions } from '@grpc/grpc-js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';
import type { AnalyzeRequest, AnalyzeResponse, HealthCheckRequest, HealthCheckResponse } from '../generated/nsfw/nsfw/v1/nsfw.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Proto file path
const PROTO_PATH = join(__dirname, '../../protos/nsfw/v1/nsfw.proto');

// Load proto definition
const packageDefinition = loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const protoDescriptor = loadPackageDefinition(packageDefinition) as unknown as {
    nsfw: {
        v1: {
            NsfwService: new (address: string, credentials: ClientOptions, options?: ChannelOptions) => {
                Analyze(request: AnalyzeRequest, callback: (error: unknown, response: AnalyzeResponse) => void): void;
                HealthCheck(request: HealthCheckRequest, callback: (error: unknown, response: HealthCheckResponse) => void): void;
            };
        };
    };
};

const NsfwServiceClient = protoDescriptor.nsfw.v1.NsfwService;

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
 * Creates a gRPC client instance
 */
function createClient(): InstanceType<typeof NsfwServiceClient> {
    const address = process.env['NSFW_GRPC_ADDR'] ?? 'localhost:50051';
    return new NsfwServiceClient(address, credentials.createInsecure(), {
        'grpc.max_receive_message_length': 10 * 1024 * 1024, // 10MB
        'grpc.max_send_message_length': 10 * 1024 * 1024
    });
}

/**
 * Sleeps for the specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines if a gRPC error code should trigger fail-open
 */
function isFailOpenError(code: number): boolean {
    return FAIL_OPEN_CODES.has(code);
}

/**
 * Analyzes an image for NSFW content via gRPC
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
        return {
            isNsfw: false,
            predictions: {},
            maxConfidence: 0,
            inferenceMs: '0'
        };
    }

    const client = createClient();
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Use proto field names (snake_case) for dynamic grpc-js client
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const request: any = {
                image_data: new Uint8Array(0),
                image_url: imageUrl,
                threshold,
                guild_id: guildId,
                user_id: userId
            };

            const response = await new Promise<AnalyzeResponse>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Request timeout'));
                }, REQUEST_TIMEOUT_MS);

                client.Analyze(request, (error: unknown, response: AnalyzeResponse) => {
                    clearTimeout(timeout);
                    if (error) {
                        reject(error instanceof Error ? error : new Error((error as { message?: string }).message ?? 'Unknown gRPC error'));
                    } else {
                        resolve(response);
                    }
                });
            });

            recordSuccess();
            // Normalize response keys: the dynamic grpc-js client (keepCase)
            // returns proto snake_case names; normalize to camelCase.
            const raw = response as unknown as Record<string, unknown>;
            return {
                isNsfw: Boolean(raw['isNsfw'] ?? raw['is_nsfw'] ?? false),
                predictions: (raw['predictions'] ?? {}) as Record<string, number>,
                maxConfidence: Number(raw['maxConfidence'] ?? raw['max_confidence'] ?? 0),
                inferenceMs: String(raw['inferenceMs'] ?? raw['inference_ms'] ?? '0')
            };
        } catch (error) {
            lastError = error;

            // Check if it's a gRPC error with a code
            const grpcError = error as { code?: number; details?: string; message?: string };
            const code = grpcError.code;

            if (attempt < MAX_RETRIES) {
                const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
                logger.warn({
                    msg: `[NSFW Client] Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms`,
                    error: grpcError.message ?? String(error),
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
                error: grpcError.message ?? String(error),
                code
            });

            // Check if we should fail-open
            if (code !== undefined && isFailOpenError(code)) {
                recordFailure();
                return {
                    isNsfw: false,
                    predictions: {},
                    maxConfidence: 0,
                    inferenceMs: '0'
                };
            }

            // For other errors, re-throw
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    // Should not reach here, but TypeScript needs it
    throw lastError instanceof Error ? lastError : new Error('Unknown error');
}

/**
 * Performs a health check on the NSFW gRPC service
 * @returns Health check response
 */
export async function healthCheckGrpc(): Promise<HealthCheckResponse> {
    if (process.env['NSFW_USE_RUST'] !== 'true') {
        throw new Error('NSFW_USE_RUST not enabled');
    }

    const client = createClient();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Health check timeout'));
        }, REQUEST_TIMEOUT_MS);

        const request: HealthCheckRequest = {};
        client.HealthCheck(request, (error: unknown, response: HealthCheckResponse) => {
            clearTimeout(timeout);
            if (error) {
                reject(error instanceof Error ? error : new Error((error as { message?: string }).message ?? 'Unknown gRPC error'));
            } else {
                // Normalize response keys (see analyzeImageGrpc).
                const raw = response as unknown as Record<string, unknown>;
                resolve({
                    healthy: Boolean(raw['healthy'] ?? false),
                    modelVersion: String(raw['modelVersion'] ?? raw['model_version'] ?? ''),
                    uptimeMs: String(raw['uptimeMs'] ?? raw['uptime_ms'] ?? '0')
                });
            }
        });
    });
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