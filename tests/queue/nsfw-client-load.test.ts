import { describe, expect, it } from 'vitest';

describe('nsfwClient lazy proto', () => {
    it('imports without throwing at import time', async () => {
        process.env['NSFW_USE_RUST'] = 'false';
        const mod = await import('../../src/queue/nsfwClient.js');
        expect(typeof mod.analyzeImageGrpc).toBe('function');
        expect(typeof mod.healthCheckGrpc).toBe('function');
        expect(typeof mod.isRustWorkerAvailable).toBe('function');
    });
});
