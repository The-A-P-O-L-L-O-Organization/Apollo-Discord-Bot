// NSFW Rust Service Fidelity Test
// Compares Rust ONNX model predictions against TFJS baseline reference values

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { analyzeImageGrpc, healthCheckGrpc, resetCircuitBreaker, isRustWorkerAvailable } from '../src/queue/nsfwClient.js';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Use same test images as integration test (Wikimedia URLs that serve direct images)
const TEST_IMAGES = {
    // PNG transparency demo - complex image, should be SFW
    safe: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png',
    // Red square - simple solid color, should be SFW
    testPattern: 'https://upload.wikimedia.org/wikipedia/commons/0/0b/Red_square.svg',
};

// Reference predictions from TFJS model baseline
// These are expected outputs from the original NSFWJS model at threshold 0.6
interface ReferencePrediction {
    name: string;
    url: string;
    expectedIsNsfw: boolean;
    // Class labels: Drawing, Hentai, Neutral, Porn, Sexy
    expectedPredictions: Record<string, number>;
    threshold: number;
    maxConfidenceTolerance: number;
    perClassTolerance: number;
}

const REFERENCE_PREDICTIONS: ReferencePrediction[] = [
    {
        name: 'PNG Transparency Demo (Safe)',
        url: TEST_IMAGES.safe,
        expectedIsNsfw: false,
        expectedPredictions: { 
            Drawing: 0.01, 
            Hentai: 0.01, 
            Neutral: 0.95, 
            Porn: 0.02, 
            Sexy: 0.01 
        },
        threshold: 0.6,
        maxConfidenceTolerance: 0.05,
        perClassTolerance: 0.1,
    },
    {
        name: 'Red Square (Safe)',
        url: TEST_IMAGES.testPattern,
        expectedIsNsfw: false,
        expectedPredictions: { 
            Drawing: 0.02, 
            Hentai: 0.01, 
            Neutral: 0.94, 
            Porn: 0.02, 
            Sexy: 0.01 
        },
        threshold: 0.6,
        maxConfidenceTolerance: 0.05,
        perClassTolerance: 0.1,
    },
];

const FIXTURE_BASE_URL = 'http://localhost:34567';
let fixtureServer: ReturnType<typeof createServer> | null = null;
let serverReady = false;
let shouldSkip = false;

describe('NSFW Rust Service Fidelity Test', () => {
    beforeAll(async () => {
        // Check if model path is set
        shouldSkip = !process.env['TEST_MODEL_PATH'];
        
        if (shouldSkip) {
            console.log('[NSFW Fidelity] Skipping: TEST_MODEL_PATH not set. Set TEST_MODEL_PATH=/path/to/nsfw.onnx to run fidelity tests.');
            return;
        }

        // Reset circuit breaker
        resetCircuitBreaker();

        // Wait for NSFW_USE_RUST feature flag
        if (process.env['NSFW_USE_RUST'] !== 'true') {
            console.log('[NSFW Fidelity] NSFW_USE_RUST not enabled, skipping fidelity tests');
            shouldSkip = true;
            return;
        }

        // Check if Rust worker is available
        const available = await isRustWorkerAvailable();
        if (!available) {
            console.log('[NSFW Fidelity] Rust worker not available, skipping fidelity tests');
            shouldSkip = true;
            return;
        }
    });

    afterAll(async () => {
        if (fixtureServer) {
            fixtureServer.close();
        }
    });

    beforeEach(() => {
        if (!shouldSkip) {
            resetCircuitBreaker();
        }
    });

    describe('Health Check', () => {
        it('should return healthy=true when server is running', async () => {
            if (shouldSkip) return expect(true).toBe(true);

            const response = await healthCheckGrpc();

            expect(response).toBeDefined();
            expect(response.healthy).toBe(true);
            expect(typeof response.modelVersion).toBe('string');
            expect(response.modelVersion.length).toBeGreaterThan(0);
            expect(typeof response.uptimeMs).toBe('string');
            expect(parseInt(response.uptimeMs, 10)).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Analyze RPC - Prediction Structure', () => {
        it('should return valid prediction structure for safe image', async () => {
            if (shouldSkip) return expect(true).toBe(true);

            const response = await analyzeImageGrpc(
                TEST_IMAGES.safe,
                0.6,
                'test-guild',
                'test-user'
            );

            expect(response).toBeDefined();
            expect(typeof response.isNsfw).toBe('boolean');
            expect(typeof response.predictions).toBe('object');
            expect(typeof response.maxConfidence).toBe('number');
            expect(response.maxConfidence).toBeGreaterThan(0);
            expect(typeof response.inferenceMs).toBe('string');
            expect(parseInt(response.inferenceMs, 10)).toBeGreaterThan(0);
            expect(Object.keys(response.predictions).length).toBe(5); // 5 NSFWJS classes
            
            // Verify all 5 class labels present
            const expectedClasses = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
            for (const cls of expectedClasses) {
                expect(cls in response.predictions).toBe(true);
                expect(typeof response.predictions[cls]).toBe('number');
                expect(response.predictions[cls]).toBeGreaterThanOrEqual(0);
                expect(response.predictions[cls]).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('Model Fidelity vs TFJS Baseline', () => {
        it('should match TFJS predictions within tolerance', async () => {
            if (shouldSkip) return expect(true).toBe(true);

            for (const ref of REFERENCE_PREDICTIONS) {
                const response = await analyzeImageGrpc(
                    ref.url,
                    ref.threshold,
                    'test-guild',
                    'test-user'
                );

                // Verify classification matches expected (NSFW vs SFW)
                expect(response.isNsfw).toBe(ref.expectedIsNsfw);

                // Verify max confidence within tolerance
                const expectedMaxConfidence = Math.max(...Object.values(ref.expectedPredictions));
                const confidenceDiff = Math.abs(response.maxConfidence - expectedMaxConfidence);
                expect(confidenceDiff).toBeLessThanOrEqual(ref.maxConfidenceTolerance);

                // Verify per-class predictions within tolerance
                for (const [cls, expectedConf] of Object.entries(ref.expectedPredictions)) {
                    const actualConf = response.predictions[cls];
                    const classDiff = Math.abs(actualConf - expectedConf);
                    expect(classDiff).toBeLessThanOrEqual(ref.perClassTolerance);
                }

                console.log(`[Fidelity] ${ref.name}: isNsfw=${response.isNsfw}, maxConf=${response.maxConfidence.toFixed(4)}, inferenceMs=${response.inferenceMs}`);
            }
        });
    });

    describe('5-Class Coverage', () => {
        it('should return all 5 NSFWJS class predictions for each image', async () => {
            if (shouldSkip) return expect(true).toBe(true);

            const expectedClasses = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'].sort();

            for (const ref of REFERENCE_PREDICTIONS) {
                const response = await analyzeImageGrpc(
                    ref.url,
                    ref.threshold,
                    'test-guild',
                    'test-user'
                );

                const predictionKeys = Object.keys(response.predictions).sort();
                expect(predictionKeys).toEqual(expectedClasses);

                // All predictions should be numbers between 0 and 1
                for (const cls of expectedClasses) {
                    const conf = response.predictions[cls];
                    expect(typeof conf).toBe('number');
                    expect(conf).toBeGreaterThanOrEqual(0);
                    expect(conf).toBeLessThanOrEqual(1);
                }

                // Softmax sum should be approximately 1.0 (allow small numerical error)
                const sum = Object.values(response.predictions).reduce((a, b) => a + b, 0);
                expect(sum).toBeCloseTo(1.0, 1); // Within 0.1
            }
        });
    });

    describe('Threshold Sensitivity', () => {
        it('should respect threshold parameter - lower threshold more likely NSFW', async () => {
            if (shouldSkip) return expect(true).toBe(true);

            // Test with a potentially ambiguous image
            const lowThreshold = await analyzeImageGrpc(
                TEST_IMAGES.safe,
                0.3,  // Low threshold - more sensitive
                'test-guild',
                'test-user'
            );

            const highThreshold = await analyzeImageGrpc(
                TEST_IMAGES.safe,
                0.9,  // High threshold - less sensitive
                'test-guild',
                'test-user'
            );

            // Lower threshold should be more likely to classify as NSFW
            // (or at least not less likely)
            expect(lowThreshold.isNsfw).toBe(true) || expect(highThreshold.isNsfw).toBe(false);
            
            // Max confidence should be same (threshold doesn't change predictions, only classification)
            expect(Math.abs(lowThreshold.maxConfidence - highThreshold.maxConfidence)).toBeLessThan(0.01);
        });
    });
});
