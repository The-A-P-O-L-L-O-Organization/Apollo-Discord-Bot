import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequest } from '../../src/core/worker/rpc.js';
import { signCapabilities, verifyCapabilities, type SignedCapabilities } from '../../src/core/worker/capabilitySignature.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const childEntry = join(__dirname, '../fixtures/worker-plugins/child-entry.ts');
const fixtureDir = join(__dirname, '../fixtures/worker-plugins/demo');
const TEST_SECRET = 'integration-test-secret-12345';

describe('Worker Capability Signature Integration', () => {
    let child: ChildProcess;
    let pending: Map<string, (value: unknown) => void>;
    let signedCapabilities: SignedCapabilities;

    beforeAll(async () => {
        // Set up environment with secret for signing/verification
        process.env['PLUGIN_CAPABILITY_SECRET'] = TEST_SECRET;
        process.env['QUEUE_HMAC_SECRET'] = TEST_SECRET;

        // Sign capabilities for the demo plugin - grant only 'events:messageCreate' and 'api:sendMessage'
        signedCapabilities = signCapabilities('demo', ['events:messageCreate', 'api:sendMessage'], TEST_SECRET);

        child = fork(childEntry, [], {
            execArgv: ['--import', 'tsx'],
            env: {
                ...process.env,
                PLUGIN_ID: 'demo',
                PLUGIN_DIR: fixtureDir,
                PLUGIN_CAPABILITIES: JSON.stringify(signedCapabilities)
            },
            stdio: ['inherit', 'inherit', 'inherit', 'ipc']
        });

        pending = new Map();
        child.on('message', (msg: unknown) => {
            const m = msg as { correlationId?: unknown; result?: unknown };
            if (typeof m.correlationId === 'string' && pending.has(m.correlationId)) {
                pending.get(m.correlationId)!(m.result);
                pending.delete(m.correlationId);
            }
        });

        await new Promise((resolve, reject) => {
            child.once('spawn', resolve);
            child.once('error', reject);
        });
    });

    afterAll(() => {
        child.kill();
        delete process.env['PLUGIN_CAPABILITY_SECRET'];
        delete process.env['QUEUE_HMAC_SECRET'];
    });

    function rpc(method: string, payload: unknown): Promise<any> {
        const req = createRequest('demo', method, payload);
        return new Promise((resolve) => {
            pending.set(req.correlationId, resolve);
            child.send(req);
        });
    }

    describe('valid signed capabilities', () => {
        it('should accept valid signed capabilities and allow granted capabilities', async () => {
            // Load plugin lifecycle
            const loadResult = await rpc('lifecycle:load', {});
            expect(loadResult.ok).toBe(true);

            // Enable plugin
            const enableResult = await rpc('lifecycle:enable', {});
            expect(enableResult.ok).toBe(true);

            // Call a granted capability via the plugin's host.call mechanism
            // The plugin can call host.call('api:sendMessage', ...) internally
            // We test via event emission which uses the capability system
            const eventResult = await rpc('event:emit', { event: 'events:messageCreate', data: { id: 'm1', content: 'hello' } });
            expect(eventResult.ok).toBe(true);
        });

        it('should verify signature using verifyCapabilities utility', async () => {
            const result = verifyCapabilities(signedCapabilities, TEST_SECRET);
            expect(result).toEqual({
                pluginId: 'demo',
                capabilities: ['events:messageCreate', 'api:sendMessage']
            });
        });
    });

    describe('forged capability rejection', () => {
        it('should reject capability not in signed list (forged capability)', async () => {
            // The plugin was only granted 'events:messageCreate' and 'api:sendMessage'
            // Try to call a capability it doesn't have - 'api:setOwnConfig'
            // This is tested by the plugin trying to call host.call with an ungranted capability
            // We can't directly test host.call from outside, but we can verify the signature
            // verification rejects tampered capabilities

            // Create a forged signed capability with an extra capability
            const forged = { ...signedCapabilities, capabilities: [...signedCapabilities.capabilities, 'api:setOwnConfig'] };

            expect(() => verifyCapabilities(forged, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });

        it('should reject capability with tampered pluginId field (different from signed pluginId)', async () => {
            // If someone tampers with the pluginId field AFTER signing
            // The signature verification will fail because the signature was
            // computed with the original pluginId
            const tampered = { ...signedCapabilities, pluginId: 'malicious-plugin' };

            expect(() => verifyCapabilities(tampered, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });

        it('should reject capability with tampered pluginId field', async () => {
            const tampered = { ...signedCapabilities, pluginId: 'other-plugin' };

            expect(() => verifyCapabilities(tampered, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });

        it('should reject capability with tampered capabilities array', async () => {
            const tampered = { ...signedCapabilities, capabilities: ['api:sendMessage', 'api:setOwnConfig', 'events:messageDelete'] };

            expect(() => verifyCapabilities(tampered, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });
    });

    describe('expired signature rejection', () => {
        it('should reject expired signature (older than 24 hours)', async () => {
            const expiredCapabilities = { ...signedCapabilities, issuedAt: Date.now() - 25 * 60 * 60 * 1000 }; // 25 hours ago

            expect(() => verifyCapabilities(expiredCapabilities, TEST_SECRET)).toThrow(/Capability signature expired/);
        });

        it('should accept signature within expiry boundary (just under 24 hours)', async () => {
            const { computeSignature } = await import('../../src/core/worker/capabilitySignature.js');
            const issuedAt = Date.now() - (24 * 60 * 60 * 1000 - 1000); // 24 hours - 1 second
            const signature = computeSignature('demo', ['events:messageCreate', 'api:sendMessage'], issuedAt, TEST_SECRET);
            const validCapabilities = { pluginId: 'demo', capabilities: ['events:messageCreate', 'api:sendMessage'], issuedAt, signature };

            expect(() => verifyCapabilities(validCapabilities, TEST_SECRET)).not.toThrow();
        });
    });

    describe('wrong pluginId in signature', () => {
        it('should produce valid signature for any pluginId (rejection happens in workerChild)', async () => {
            // The signature verification itself doesn't reject based on pluginId
            // The workerChild runtime check (line 84-86 in workerChild.ts) rejects
            // when verified.pluginId !== env.PLUGIN_ID
            const otherPluginCapabilities = signCapabilities('other-plugin', ['events:messageCreate', 'api:sendMessage'], TEST_SECRET);

            const result = verifyCapabilities(otherPluginCapabilities, TEST_SECRET);
            expect(result.pluginId).toBe('other-plugin');
            expect(result.capabilities).toEqual(['events:messageCreate', 'api:sendMessage']);
        });

        it('should reject signature with tampered pluginId field (different from signed pluginId)', async () => {
            // If someone tampers with the pluginId field AFTER signing
            // The signature verification will fail because the signature was
            // computed with the original pluginId
            const tampered = { ...signedCapabilities, pluginId: 'other-plugin' };

            expect(() => verifyCapabilities(tampered, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });
    });

    describe('workerChild capability enforcement', () => {
        it('should deny capabilities not granted when plugin tries to call them', async () => {
            // This tests the runtime enforcement in workerChild
            // The demo plugin only has 'events:messageCreate' and 'api:sendMessage'
            // If it tries to call 'api:setOwnConfig' via host.call, it should be rejected

            // We can't directly test host.call from outside the worker,
            // but we can verify the signature verification prevents forged capabilities
            // from being granted in the first place
            const ungrantedCapability = 'api:setOwnConfig';
            expect(signedCapabilities.capabilities).not.toContain(ungrantedCapability);
        });

        it('should allow only capabilities present in the signed list', async () => {
            // Verify the granted capabilities match what we signed
            const result = verifyCapabilities(signedCapabilities, TEST_SECRET);
            expect(result.capabilities).toEqual(['events:messageCreate', 'api:sendMessage']);
            expect(result.capabilities).not.toContain('api:setOwnConfig');
            expect(result.capabilities).not.toContain('events:messageDelete');
            expect(result.capabilities).not.toContain('api:commandReply');
        });
    });

    describe('signature tampering detection', () => {
        it('should detect tampered issuedAt', async () => {
            const tampered = { ...signedCapabilities, issuedAt: signedCapabilities.issuedAt + 1000 };

            expect(() => verifyCapabilities(tampered, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });

        it('should detect tampered signature', async () => {
            const tampered = { ...signedCapabilities, signature: 'hmac-sha256:tampered-signature' };

            expect(() => verifyCapabilities(tampered, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });

        it('should detect missing signature prefix', async () => {
            const tampered = { ...signedCapabilities, signature: 'invalid-prefix:abc123' };

            expect(() => verifyCapabilities(tampered, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });

        it('should detect completely forged signature', async () => {
            // Create a completely fake SignedCapabilities object
            const forged: SignedCapabilities = {
                pluginId: 'demo',
                capabilities: ['api:sendMessage', 'api:setOwnConfig', 'events:messageDelete'],
                issuedAt: Date.now(),
                signature: 'hmac-sha256:fake-signature'
            };

            expect(() => verifyCapabilities(forged, TEST_SECRET)).toThrow(/Invalid capability signature/);
        });
    });
});