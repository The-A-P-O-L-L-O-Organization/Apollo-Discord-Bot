import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = process.env;

beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
});

afterEach(() => {
    process.env = originalEnv;
});

describe('capabilitySignature', () => {
    describe('signCapabilities', () => {
        it('should sign capabilities and return a signed object with signature, issuedAt, and pluginId', async () => {
            process.env['PLUGIN_CAPABILITY_SECRET'] = 'test-secret-123';

            const { signCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage', 'events:messageCreate'], 'test-secret-123');

            expect(signed).toHaveProperty('pluginId', 'test-plugin');
            expect(signed).toHaveProperty('capabilities');
            expect(signed).toHaveProperty('issuedAt');
            expect(signed).toHaveProperty('signature');
            expect(Array.isArray(signed.capabilities)).toBe(true);
            expect(signed.capabilities).toEqual(['api:sendMessage', 'events:messageCreate']);
            expect(typeof signed.issuedAt).toBe('number');
            expect(typeof signed.signature).toBe('string');
            expect(signed.signature.length).toBeGreaterThan(0);
        });

        it('should produce different signatures for different capability sets', async () => {
            process.env['PLUGIN_CAPABILITY_SECRET'] = 'test-secret-123';

            const { signCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed1 = signCapabilities('test-plugin', ['api:sendMessage'], 'test-secret-123');
            const signed2 = signCapabilities('test-plugin', ['api:sendMessage', 'events:messageCreate'], 'test-secret-123');

            expect(signed1.signature).not.toBe(signed2.signature);
        });

        it('should produce different signatures for different plugin IDs', async () => {
            process.env['PLUGIN_CAPABILITY_SECRET'] = 'test-secret-123';

            const { signCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed1 = signCapabilities('plugin-a', ['api:sendMessage'], 'test-secret-123');
            const signed2 = signCapabilities('plugin-b', ['api:sendMessage'], 'test-secret-123');

            expect(signed1.signature).not.toBe(signed2.signature);
        });

        it('should produce different signatures for different secrets', async () => {
            const { signCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed1 = signCapabilities('test-plugin', ['api:sendMessage'], 'secret-1');
            const signed2 = signCapabilities('test-plugin', ['api:sendMessage'], 'secret-2');

            expect(signed1.signature).not.toBe(signed2.signature);
        });
    });

    describe('verifyCapabilities', () => {
        it('should verify a valid signed capabilities object', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage', 'events:messageCreate'], 'test-secret-123');
            const result = verifyCapabilities(signed, 'test-secret-123');

            expect(result).toEqual({
                pluginId: 'test-plugin',
                capabilities: ['api:sendMessage', 'events:messageCreate']
            });
        });

        it('should throw when signature is invalid', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage'], 'test-secret-123');
            signed.signature = 'invalid-signature';

            expect(() => verifyCapabilities(signed, 'test-secret-123')).toThrow(/Invalid capability signature/);
        });

        it('should throw when secret does not match', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage'], 'test-secret-123');

            expect(() => verifyCapabilities(signed, 'different-secret')).toThrow(/Invalid capability signature/);
        });

        it('should throw when pluginId is tampered', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage'], 'test-secret-123');
            signed.pluginId = 'tampered-plugin';

            expect(() => verifyCapabilities(signed, 'test-secret-123')).toThrow(/Invalid capability signature/);
        });

        it('should throw when capabilities are tampered', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage'], 'test-secret-123');
            signed.capabilities = ['api:sendMessage', 'api:setOwnConfig'];

            expect(() => verifyCapabilities(signed, 'test-secret-123')).toThrow(/Invalid capability signature/);
        });

        it('should throw when issuedAt is tampered', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage'], 'test-secret-123');
            signed.issuedAt = signed.issuedAt + 1000;

            expect(() => verifyCapabilities(signed, 'test-secret-123')).toThrow(/Invalid capability signature/);
        });

        it('should throw when signature is expired (older than 24 hours)', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            const signed = signCapabilities('test-plugin', ['api:sendMessage'], 'test-secret-123');
            signed.issuedAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago

            expect(() => verifyCapabilities(signed, 'test-secret-123')).toThrow(/Capability signature expired/);
        });

        it('should accept signature with issuedAt close to but within expiry boundary', async () => {
            const { signCapabilities, verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            // Create a signed object with issuedAt set to just under 24 hours ago
            // We need to create it manually since signCapabilities uses current time
            const secret = 'test-secret-123';
            const pluginId = 'test-plugin';
            const capabilities = ['api:sendMessage'];
            const issuedAt = Date.now() - (24 * 60 * 60 * 1000 - 1000); // 24 hours - 1 second

            const { computeSignature } = await import('../../src/core/worker/capabilitySignature.js');
            const signature = computeSignature(pluginId, capabilities, issuedAt, secret);

            const signed = { pluginId, capabilities, issuedAt, signature };
            expect(() => verifyCapabilities(signed, secret)).not.toThrow();
        });

        it('should throw when signed object is missing required fields', async () => {
            const { verifyCapabilities } = await import('../../src/core/worker/capabilitySignature.js');

            expect(() => verifyCapabilities({} as any, 'test-secret-123')).toThrow(/Invalid signed capabilities object/);
            expect(() => verifyCapabilities({ pluginId: 'test' } as any, 'test-secret-123')).toThrow(/Invalid signed capabilities object/);
            expect(() => verifyCapabilities({ pluginId: 'test', capabilities: [] } as any, 'test-secret-123')).toThrow(/Invalid signed capabilities object/);
            expect(() => verifyCapabilities({ pluginId: 'test', capabilities: [], issuedAt: Date.now() } as any, 'test-secret-123')).toThrow(/Invalid signed capabilities object/);
        });
    });
});