import { describe, it, expect } from 'vitest';
import { parsePluginManifest, KNOWN_CAPABILITIES, normalizeCapabilities } from '../../../src/core/worker/pluginManifest.js';

describe('pluginManifest', () => {
    it('should expose known capability names', () => {
        expect(KNOWN_CAPABILITIES.size).toBeGreaterThan(0);
        expect(KNOWN_CAPABILITIES.has('api:getOwnConfig')).toBe(true);
    });

    it('should normalize a valid capabilities list', () => {
        expect(normalizeCapabilities(['events:messageCreate', 'api:sendMessage']))
            .toEqual(['events:messageCreate', 'api:sendMessage']);
    });

    it('should throw on unknown capabilities', () => {
        expect(() => normalizeCapabilities(['totally:fake'])).toThrow(/unknown capability/i);
    });

    it('should throw on non-array capabilities', () => {
        expect(() => normalizeCapabilities('not-an-array')).toThrow(/array/i);
    });

    it('should parse a manifest file', async() => {
        const m = await parsePluginManifest({ dir: '/tmp/x', readFile: async() => JSON.stringify({
            id: 'test',
            capabilities: ['api:getOwnConfig']
        }) });
        expect(m.id).toBe('test');
        expect(m.capabilities).toEqual(['api:getOwnConfig']);
    });

    it('should fail when manifest declares no capabilities', async() => {
        await expect(parsePluginManifest({ dir: '/tmp/x', readFile: async() => JSON.stringify({ id: 'test' }) }))
            .rejects.toThrow(/capabilities/i);
    });

    it('should fail when manifest has no id', async() => {
        await expect(parsePluginManifest({ dir: '/tmp/x', readFile: async() => JSON.stringify({ capabilities: ['api:getOwnConfig'] }) }))
            .rejects.toThrow(/id/i);
    });
});
