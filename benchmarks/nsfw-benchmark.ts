// NSFW Detection Benchmark
// Benchmarks Rust gRPC worker latency and throughput
// Run with: pnpm exec tsx benchmarks/nsfw-benchmark.ts

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeImageGrpc, healthCheckGrpc, isRustWorkerAvailable, resetCircuitBreaker } from '../src/queue/nsfwClient.js';
import { logger } from '../src/utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

interface BenchmarkResult {
    name: string;
    timestamp: string;
    environment: {
        nodeVersion: string;
        platform: string;
        arch: string;
    };
    configuration: {
        grpcAddress: string;
        threshold: number;
        concurrentRequests: number;
        totalRequests: number;
        featureFlagEnabled: boolean;
    };
    results: {
        healthCheck: {
            success: boolean;
            latencyMs: number;
            modelVersion?: string;
        };
        latency: {
            p50: number;
            p95: number;
            p99: number;
            min: number;
            max: number;
            mean: number;
            stdDev: number;
            samples: number;
        };
        throughput: {
            requestsPerSecond: number;
            totalTimeMs: number;
            successfulRequests: number;
            failedRequests: number;
        };
        errors: Array<{ code?: number; message: string; count: number }>;
    };
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(p / 100 * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

function mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
}

async function runBenchmark(): Promise<BenchmarkResult> {
    const config = {
        grpcAddress: process.env['NSFW_GRPC_ADDR'] ?? 'localhost:50051',
        threshold: parseFloat(process.env['NSFW_THRESHOLD'] ?? '0.6'),
        concurrentRequests: parseInt(process.env['BENCHMARK_CONCURRENT'] ?? '10', 10),
        totalRequests: parseInt(process.env['BENCHMARK_TOTAL'] ?? '100', 10),
        featureFlagEnabled: process.env['NSFW_USE_RUST'] === 'true'
    };

    // Test image URLs
    const testImages = [
        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/220px-PNG_transparency_demonstration_1.png',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Red_square.svg/220px-Red_square.svg.png',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Blue_square.svg/220px-Blue_square.svg.png',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Green_square.svg/220px-Green_square.svg.png',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Yellow_square.svg/220px-Yellow_square.svg.png'
    ];

    const result: BenchmarkResult = {
        name: 'NSFW Rust Worker Benchmark',
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        },
        configuration: config,
        results: {
            healthCheck: {
                success: false,
                latencyMs: 0
            },
            latency: {
                p50: 0,
                p95: 0,
                p99: 0,
                min: 0,
                max: 0,
                mean: 0,
                stdDev: 0,
                samples: 0
            },
            throughput: {
                requestsPerSecond: 0,
                totalTimeMs: 0,
                successfulRequests: 0,
                failedRequests: 0
            },
            errors: []
        }
    };

    // Check if feature flag is enabled
    if (!config.featureFlagEnabled) {
        logger.warn({ msg: '[Benchmark] NSFW_USE_RUST is not enabled. Set NSFW_USE_RUST=true to run benchmark.' });
        console.log(JSON.stringify(result, null, 2));
        return result;
    }

    // Check if server is available
    logger.info({ msg: '[Benchmark] Checking server availability...' });
    const available = await isRustWorkerAvailable();
    if (!available) {
        logger.error({ msg: '[Benchmark] Rust NSFW worker not available. Ensure server is running on ' + config.grpcAddress });
        console.log(JSON.stringify(result, null, 2));
        return result;
    }

    // Reset circuit breaker before benchmark
    resetCircuitBreaker();

    // Health check benchmark
    logger.info({ msg: '[Benchmark] Running health check...' });
    const healthStart = Date.now();
    try {
        const healthResponse = await healthCheckGrpc();
        result.results.healthCheck = {
            success: true,
            latencyMs: Date.now() - healthStart,
            modelVersion: healthResponse.modelVersion
        };
        logger.info({ msg: `[Benchmark] Health check OK (${result.results.healthCheck.latencyMs}ms), model: ${healthResponse.modelVersion}` });
    } catch (error) {
        result.results.healthCheck = {
            success: false,
            latencyMs: Date.now() - healthStart
        };
        logger.error({ err: error as Error, msg: '[Benchmark] Health check failed' });
        console.log(JSON.stringify(result, null, 2));
        return result;
    }

    // Latency benchmark - sequential requests to measure individual latency
    logger.info({ msg: '[Benchmark] Running latency benchmark (sequential)...' });
    const latencies: number[] = [];
    const latencySamples = Math.min(20, config.totalRequests); // Up to 20 samples for latency

    for (let i = 0; i < latencySamples; i++) {
        const imageUrl = testImages[i % testImages.length];
        const start = Date.now();
        try {
            await analyzeImageGrpc(imageUrl, config.threshold, `bench-guild-${i}`, `bench-user-${i}`);
            const latency = Date.now() - start;
            latencies.push(latency);
        } catch (error) {
            const err = error as { code?: number; message?: string };
            const existing = result.results.errors.find(e => e.code === err.code && e.message === err.message);
            if (existing) {
                existing.count++;
            } else {
                result.results.errors.push({
                    code: err.code,
                    message: err.message ?? String(error),
                    count: 1
                });
            }
        }
        // Small delay between requests
        await new Promise(r => setTimeout(r, 50));
    }

    if (latencies.length > 0) {
        result.results.latency = {
            p50: percentile(latencies, 50),
            p95: percentile(latencies, 95),
            p99: percentile(latencies, 99),
            min: Math.min(...latencies),
            max: Math.max(...latencies),
            mean: mean(latencies),
            stdDev: stdDev(latencies),
            samples: latencies.length
        };
        logger.info({ msg: `[Benchmark] Latency: p50=${result.results.latency.p50}ms, p95=${result.results.latency.p95}ms, p99=${result.results.latency.p99}ms` });
    }

    // Throughput benchmark - concurrent requests
    logger.info({ msg: `[Benchmark] Running throughput benchmark (${config.totalRequests} requests, ${config.concurrentRequests} concurrent)...` });
    const throughputStart = Date.now();
    let successfulRequests = 0;
    let failedRequests = 0;

    // Process in batches of concurrentRequests
    for (let batchStart = 0; batchStart < config.totalRequests; batchStart += config.concurrentRequests) {
        const batchSize = Math.min(config.concurrentRequests, config.totalRequests - batchStart);
        const promises = Array.from({ length: batchSize }, (_, i) => {
            const idx = batchStart + i;
            const imageUrl = testImages[idx % testImages.length];
            return analyzeImageGrpc(imageUrl, config.threshold, `bench-guild-${idx}`, `bench-user-${idx}`)
                .then(() => { successfulRequests++; })
                .catch((error) => {
                    failedRequests++;
                    const err = error as { code?: number; message?: string };
                    const existing = result.results.errors.find(e => e.code === err.code && e.message === err.message);
                    if (existing) {
                        existing.count++;
                    } else {
                        result.results.errors.push({
                            code: err.code,
                            message: err.message ?? String(error),
                            count: 1
                        });
                    }
                });
        });
        await Promise.all(promises);
    }

    const totalTimeMs = Date.now() - throughputStart;
    result.results.throughput = {
        requestsPerSecond: (successfulRequests / totalTimeMs) * 1000,
        totalTimeMs,
        successfulRequests,
        failedRequests
    };

    logger.info({ msg: `[Benchmark] Throughput: ${result.results.throughput.requestsPerSecond.toFixed(2)} req/s (${successfulRequests} success, ${failedRequests} failed in ${totalTimeMs}ms)` });

    return result;
}

async function main(): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           NSFW Rust Worker Benchmark                         ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');

    // Check for TEST_MODEL_PATH
    if (!process.env['TEST_MODEL_PATH']) {
        logger.warn({ msg: '[Benchmark] TEST_MODEL_PATH not set. Integration tests will be skipped.' });
    }

    // Check for NSFW_USE_RUST
    if (process.env['NSFW_USE_RUST'] !== 'true') {
        logger.warn({ msg: '[Benchmark] NSFW_USE_RUST is not set to "true". Benchmark will not run against Rust worker.' });
        logger.info({ msg: '[Benchmark] To run: export NSFW_USE_RUST=true && pnpm exec tsx benchmarks/nsfw-benchmark.ts' });
    }

    try {
        const result = await runBenchmark();
        
        // Output JSON for CI parsing
        console.log('');
        console.log('=== BENCHMARK RESULTS (JSON) ===');
        console.log(JSON.stringify(result, null, 2));

        // Human-readable summary
        console.log('');
        console.log('=== SUMMARY ===');
        console.log(`Environment: Node ${result.environment.nodeVersion} on ${result.environment.platform}/${result.environment.arch}`);
        console.log(`gRPC Address: ${result.configuration.grpcAddress}`);
        console.log(`Feature Flag: ${result.configuration.featureFlagEnabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`Health Check: ${result.results.healthCheck.success ? 'PASS' : 'FAIL'} (${result.results.healthCheck.latencyMs}ms)`);
        if (result.results.healthCheck.modelVersion) {
            console.log(`Model Version: ${result.results.healthCheck.modelVersion}`);
        }
        if (result.results.latency.samples > 0) {
            console.log(`Latency (${result.results.latency.samples} samples):`);
            console.log(`  p50: ${result.results.latency.p50}ms`);
            console.log(`  p95: ${result.results.latency.p95}ms`);
            console.log(`  p99: ${result.results.latency.p99}ms`);
            console.log(`  Mean: ${result.results.latency.mean.toFixed(2)}ms (±${result.results.latency.stdDev.toFixed(2)}ms)`);
        }
        console.log(`Throughput: ${result.results.throughput.requestsPerSecond.toFixed(2)} req/s`);
        console.log(`  Total: ${result.results.throughput.totalTimeMs}ms`);
        console.log(`  Success: ${result.results.throughput.successfulRequests}`);
        console.log(`  Failed: ${result.results.throughput.failedRequests}`);
        if (result.results.errors.length > 0) {
            console.log('Errors:');
            for (const err of result.results.errors) {
                console.log(`  [${err.code ?? 'N/A'}] ${err.message} (x${err.count})`);
            }
        }

        // Exit code based on success
        const hasHealthCheck = result.results.healthCheck.success;
        const hasSuccessfulRequests = result.results.throughput.successfulRequests > 0;
        process.exit(hasHealthCheck && hasSuccessfulRequests ? 0 : 1);
    } catch (error) {
        logger.error({ err: error as Error, msg: '[Benchmark] Fatal error' });
        console.error('Benchmark failed:', error);
        process.exit(1);
    }
}

main();