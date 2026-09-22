// NSFW Rust Service Fidelity Test
// Compares Rust ONNX model predictions against the TF/Keras oracle baseline.
//
// Reference values were measured with scripts/nsfw_tf_oracle.py, which
// rebuilds the NSFWJS Keras model from models/nsfwjs_tfjs (same code path
// as the ONNX conversion) and applies the EXACT NSFWJS preprocessing from
// src/core.ts infer(): uint8 decode -> float -> /255 -> bilinear resize
// with align_corners=true -> NHWC batch. The Rust server implements the
// same math (see crates/nsfw-server/src/model.rs), so agreement validates
// genuine model parity, not self-consistency.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { analyzeImageGrpc, healthCheckGrpc, resetCircuitBreaker, isRustWorkerAvailable } from '../src/queue/nsfwClient.js';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'nsfw');
const FIXTURE_BASE_URL = 'http://127.0.0.1:34567';

// Reference predictions measured with scripts/nsfw_tf_oracle.py.
// Class labels: Drawing, Hentai, Neutral, Porn, Sexy
interface ReferencePrediction {
    name: string;
    file: string;
    expectedIsNsfw: boolean;
    expectedPredictions: Record<string, number>;
    threshold: number;
    maxConfidenceTolerance: number;
    perClassTolerance: number;
}

const REFERENCE_PREDICTIONS: ReferencePrediction[] = [
    {
        name: 'Photo Collage (SFW)',
        file: 'png-transparency-demo.png',
        expectedIsNsfw: false,
        expectedPredictions: {
            Drawing: 0.6459,
            Hentai: 0.0043,
            Neutral: 0.3489,
            Porn: 0.0005,
            Sexy: 0.0004,
        },
        threshold: 0.6,
        maxConfidenceTolerance: 0.05,
        perClassTolerance: 0.1,
    },
    {
        name: 'Solid Black 300x300',
        file: 'solid-black-300.png',
        expectedIsNsfw: false,
        expectedPredictions: {
            Drawing: 0.7885,
            Hentai: 0.0262,
            Neutral: 0.1732,
            Porn: 0.0100,
            Sexy: 0.0021,
        },
        threshold: 0.6,
        maxConfidenceTolerance: 0.05,
        perClassTolerance: 0.1,
    },
    {
        name: 'Solid White 300x300',
        file: 'solid-white-300.png',
        expectedIsNsfw: false,
        expectedPredictions: {
            Drawing: 0.7653,
            Hentai: 0.0276,
            Neutral: 0.1917,
            Porn: 0.0129,
            Sexy: 0.0026,
        },
        threshold: 0.6,
        maxConfidenceTolerance: 0.05,
        perClassTolerance: 0.1,
    },
];

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg' };

let fixtureServer: Server | null = null;
let shouldSkip = false;

function fixtureUrl(file: string): string {
    return `${FIXTURE_BASE_URL}/${file}`;
}

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

        // Serve local fixtures over HTTP so the server fetches deterministic bytes.
        fixtureServer = createServer((req, res) => {
            const file = (req.url ?? '/').replace(/^\//, '');
            try {
                const data = readFileSync(join(FIXTURE_DIR, file));
                const ext = file.slice(file.lastIndexOf('.'));
                res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
                res.end(data);
            } catch {
                res.writeHead(404);
                res.end('not found');
            }
        });
        await new Promise<void>((resolve) => {
            fixtureServer?.listen(34567, '127.0.0.1', () => resolve());
        });
    });

    afterAll(async () => {
        if (fixtureServer) {
            await new Promise<void>((resolve) => {
                fixtureServer?.close(() => resolve());
            });
            fixtureServer = null;
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
                fixtureUrl('png-transparency-demo.png'),
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

    describe('Model Fidelity vs TF Oracle Baseline', () => {
        it('should match TF oracle predictions within tolerance', async () => {
            if (shouldSkip) return expect(true).toBe(true);

            for (const ref of REFERENCE_PREDICTIONS) {
                const response = await analyzeImageGrpc(
                    fixtureUrl(ref.file),
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
                    const actualConf: number = response.predictions[cls] ?? -1;
                    expect(actualConf).toBeGreaterThanOrEqual(0);
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
                    fixtureUrl(ref.file),
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
                const sum: number = Object.values(response.predictions).reduce((a: number, b: number) => a + b, 0);
                expect(sum).toBeCloseTo(1.0, 1); // Within 0.1
            }
        });
    });

    describe('Threshold Sensitivity', () => {
        it('should respect threshold parameter - lower threshold more likely NSFW', async () => {
            if (shouldSkip) return expect(true).toBe(true);

            // Test with a potentially ambiguous image
            const lowThreshold = await analyzeImageGrpc(
                fixtureUrl('png-transparency-demo.png'),
                0.3,  // Low threshold - more sensitive
                'test-guild',
                'test-user'
            );

            const highThreshold = await analyzeImageGrpc(
                fixtureUrl('png-transparency-demo.png'),
                0.9,  // High threshold - less sensitive
                'test-guild',
                'test-user'
            );

            // Lower threshold should be more likely to classify as NSFW
            // (or at least not less likely)
            if (lowThreshold.isNsfw) {
                expect(lowThreshold.isNsfw).toBe(true);
            } else {
                expect(highThreshold.isNsfw).toBe(false);
            }

            // Max confidence should be same (threshold doesn't change predictions, only classification)
            expect(Math.abs(lowThreshold.maxConfidence - highThreshold.maxConfidence)).toBeLessThan(0.01);
        });
    });
});
