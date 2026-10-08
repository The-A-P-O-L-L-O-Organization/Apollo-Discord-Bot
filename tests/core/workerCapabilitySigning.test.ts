import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkerHost } from '../../src/core/worker/workerHost.js';
import type { WorkerHostOptions } from '../../src/core/worker/workerHost.js';
import { runChild } from '../../src/core/worker/workerChild.js';
import type { ChildHost, PluginInstance } from '../../src/core/worker/workerChild.js';
import { signCapabilities, verifyCapabilities } from '../../src/core/worker/capabilitySignature.js';

const TEST_SECRET = 'capability-signing-test-secret';
const QUEUE_SECRET = 'queue-hmac-test-secret';

function signedEnv(pluginId: string, capabilities: string[], secret: string): Record<string, string> {
    return {
        PLUGIN_ID: pluginId,
        PLUGIN_CAPABILITY_SECRET: secret,
        QUEUE_HMAC_SECRET: QUEUE_SECRET,
        PLUGIN_CAPABILITIES: JSON.stringify(signCapabilities(pluginId, capabilities, secret))
    };
}

function stubLoader(captured: { host?: ChildHost }): () => Promise<{ default: PluginInstance }> {
    return (async () => ({
        default: class StubPlugin {
            static id = 'test';
            constructor(host: ChildHost) {
                captured.host = host;
            }
        }
    })) as unknown as () => Promise<{ default: PluginInstance }>;
}

describe('worker capability signing', () => {
    afterEach(() => {
        delete process.env['PLUGIN_CAPABILITY_SECRET'];
        delete process.env['QUEUE_HMAC_SECRET'];
    });

    it('worker refuses to start when PLUGIN_CAPABILITY_SECRET is missing', async () => {
        await expect(runChild({
            pluginDir: '/tmp/test-plugin',
            env: {
                PLUGIN_ID: 'test',
                PLUGIN_CAPABILITIES: JSON.stringify(signCapabilities('test', ['api:sendMessage'], TEST_SECRET))
            }
        })).rejects.toThrow(/PLUGIN_CAPABILITY_SECRET not provided/);
    });

    it('worker refuses to start when only unsigned capabilities are provided', async () => {
        await expect(runChild({
            pluginDir: '/tmp/test-plugin',
            env: {
                PLUGIN_ID: 'test',
                PLUGIN_CAPABILITIES: JSON.stringify(['api:sendMessage'])
            }
        })).rejects.toThrow(/PLUGIN_CAPABILITY_SECRET not provided/);
    });

    it('worker starts and verifies valid signed capabilities', async () => {
        const capabilities = ['api:sendMessage', 'events:messageCreate'];
        const captured: { host?: ChildHost } = {};
        const child = await runChild({
            pluginDir: '/tmp/test-plugin',
            env: signedEnv('test', capabilities, TEST_SECRET),
            loader: stubLoader(captured)
        });
        expect(child).toBeTruthy();
        expect(captured.host?.allowedCapabilities).toEqual(new Set(capabilities));
    });

    it('worker rejects invalid signature', async () => {
        const forged = signCapabilities('test', ['api:sendMessage'], TEST_SECRET);
        const tampered = { ...forged, capabilities: ['api:sendMessage', 'api:setOwnConfig'] };
        await expect(runChild({
            pluginDir: '/tmp/test-plugin',
            env: {
                PLUGIN_ID: 'test',
                PLUGIN_CAPABILITY_SECRET: TEST_SECRET,
                PLUGIN_CAPABILITIES: JSON.stringify(tampered)
            }
        })).rejects.toThrow(/Invalid capability signature/);
    });

    it('worker rejects capabilities signed for a different plugin', async () => {
        await expect(runChild({
            pluginDir: '/tmp/test-plugin',
            env: {
                ...signedEnv('other-plugin', ['api:sendMessage'], TEST_SECRET),
                PLUGIN_ID: 'test'
            }
        })).rejects.toThrow(/Plugin ID mismatch/);
    });

    it('workerHost passes capability secrets to the child env with verifiable signature', async () => {
        process.env['PLUGIN_CAPABILITY_SECRET'] = TEST_SECRET;
        process.env['QUEUE_HMAC_SECRET'] = QUEUE_SECRET;
        const fork = vi.fn().mockReturnValue({ send: vi.fn(), on: vi.fn(), kill: vi.fn() });
        const host = new WorkerHost({
            fork: fork as unknown as WorkerHostOptions['fork'],
            log: () => undefined
        });
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });
        const env = fork.mock.calls[0]![2].env as Record<string, string>;
        expect(env['PLUGIN_CAPABILITY_SECRET']).toBe(TEST_SECRET);
        expect(env['QUEUE_HMAC_SECRET']).toBe(QUEUE_SECRET);
        const verified = verifyCapabilities(JSON.parse(env['PLUGIN_CAPABILITIES'] as string), TEST_SECRET);
        expect(verified).toEqual({ pluginId: 'demo', capabilities: ['api:sendMessage'] });
    });
});
