import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerHost } from '../../../src/core/worker/workerHost.js';

describe('WorkerHost', () => {
    let host;
    let fork;

    beforeEach(() => {
        fork = vi.fn().mockReturnValue({
            send: vi.fn(),
            on: vi.fn(),
            kill: vi.fn()
        });
        host = new WorkerHost({
            fork,
            log: () => {},
            now: () => 1000,
            backoff: (attempt) => Math.min(1000 * 2 ** attempt, 60000)
        });
    });

    it('should spawn a worker for an installed plugin with granted capabilities', async() => {
        const worker = await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });

        expect(fork).toHaveBeenCalledWith(expect.stringContaining('workerChild.js'), [], {
            env: expect.objectContaining({ PLUGIN_ID: 'demo' }),
            stdio: expect.anything(),
            resourceLimits: expect.objectContaining({ maxOldGenerationSizeMb: expect.any(Number) })
        });
        expect(worker).toBeTruthy();
    });

    it('should not leak secrets to the worker environment', async() => {
        process.env.OPENAI_API_KEY = 'secret-key';
        process.env.GITHUB_WEBHOOK_SECRET = 'webhook-secret';
        process.env.REDIS_PASSWORD = 'redis-pass';
        process.env.DATABASE_URL = 'postgres://user:pass@host/db';
        process.env.ALLOW_UNVERIFIED_PLUGINS = '1';

        const childSend = vi.fn();
        fork.mockReturnValue({ send: childSend, on: vi.fn(), kill: vi.fn() });
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });

        const forkCall = fork.mock.calls[0];
        const env = forkCall[2].env;
        expect(env.OPENAI_API_KEY).toBeUndefined();
        expect(env.GITHUB_WEBHOOK_SECRET).toBeUndefined();
        expect(env.REDIS_PASSWORD).toBeUndefined();
        expect(env.DATABASE_URL).toBeUndefined();
        expect(env.ALLOW_UNVERIFIED_PLUGINS).toBeUndefined();
        expect(env.PLUGIN_ID).toBe('demo');
        expect(env.PLUGIN_DIR).toBe('/data/plugins/demo');

        delete process.env.OPENAI_API_KEY;
        delete process.env.GITHUB_WEBHOOK_SECRET;
        delete process.env.REDIS_PASSWORD;
        delete process.env.DATABASE_URL;
        delete process.env.ALLOW_UNVERIFIED_PLUGINS;
    });

    it('should set resource limits on the forked process', async() => {
        fork.mockReturnValue({ send: vi.fn(), on: vi.fn(), kill: vi.fn() });
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });
        const forkOptions = fork.mock.calls[0][2];
        expect(forkOptions.resourceLimits).toBeDefined();
        expect(forkOptions.resourceLimits.maxOldGenerationSizeMb).toBeGreaterThan(0);
    });

    it('should deny capabilities not granted by the manifest', () => {
        const granted = host.getGrantedCapabilities(
            { id: 'demo', capabilities: ['api:sendMessage'] },
            ['api:sendMessage', 'api:setOwnConfig']
        );
        expect(granted).toEqual(['api:sendMessage']);
    });

    it('should disable a plugin after N consecutive crashes', async() => {
        const disable = vi.fn();
        host.onPluginDisabled = disable;
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });

        for (let i = 0; i < 5; i++) {
            host.recordCrash('demo');
        }
        expect(host.isDisabled('demo')).toBe(true);
        expect(disable).toHaveBeenCalledWith('demo');
    });

    it('should reset crash counter after a healthy window', () => {
        host.now = () => 1000;
        host.recordCrash('demo');
        host.now = () => 1000 + 11 * 60 * 1000;
        host.markHealthy('demo');
        expect(host.getConsecutiveCrashes('demo')).toBe(0);
    });

    it('should send messages to a running worker', async() => {
        const childSend = vi.fn();
        fork.mockReturnValue({ send: childSend, on: vi.fn(), kill: vi.fn() });
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });
        const sent = host.send('demo', { kind: 'request', method: 'ping' });
        expect(sent).toBe(true);
        expect(childSend).toHaveBeenCalledWith({ kind: 'request', method: 'ping' });
    });

    it('should return false when sending to a non-existent worker', () => {
        expect(host.send('nonexistent', {})).toBe(false);
    });
});
