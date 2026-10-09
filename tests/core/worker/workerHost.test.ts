import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RPCMessage } from '../../../src/core/worker/rpc.js';
import type { WorkerHostOptions } from '../../../src/core/worker/workerHost.js';
import { WorkerHost } from '../../../src/core/worker/workerHost.js';

describe('WorkerHost', () => {
    let host: WorkerHost;
    let fork: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fork = vi.fn().mockReturnValue({
            send: vi.fn(),
            on: vi.fn(),
            kill: vi.fn()
        });
        host = new WorkerHost({
            fork: fork as unknown as WorkerHostOptions['fork'],
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
            execArgv: expect.arrayContaining(['--import=tsx', expect.stringMatching(/^--max-old-space-size=\d+$/)])
        });
        expect(worker).toBeTruthy();
    });

    it('should not leak secrets to the worker environment', async() => {
        process.env['OPENAI_API_KEY'] = 'secret-key';
        process.env['GITHUB_WEBHOOK_SECRET'] = 'webhook-secret';
        process.env['REDIS_PASSWORD'] = 'redis-pass';
        process.env['DATABASE_URL'] = 'postgres://user:pass@host/db';
        process.env['ALLOW_UNVERIFIED_PLUGINS'] = '1';

        const childSend = vi.fn();
        fork.mockReturnValue({ send: childSend, on: vi.fn(), kill: vi.fn() });
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });

        const forkCall = fork.mock.calls[0]!;
        const env = forkCall[2].env;
        expect(env.OPENAI_API_KEY).toBeUndefined();
        expect(env.GITHUB_WEBHOOK_SECRET).toBeUndefined();
        expect(env.REDIS_PASSWORD).toBeUndefined();
        expect(env.DATABASE_URL).toBeUndefined();
        expect(env.ALLOW_UNVERIFIED_PLUGINS).toBeUndefined();
        expect(env.PLUGIN_ID).toBe('demo');
        expect(env.PLUGIN_DIR).toBe('/data/plugins/demo');

        delete process.env['OPENAI_API_KEY'];
        delete process.env['GITHUB_WEBHOOK_SECRET'];
        delete process.env['REDIS_PASSWORD'];
        delete process.env['DATABASE_URL'];
        delete process.env['ALLOW_UNVERIFIED_PLUGINS'];
    });

    it('should set resource limits on the forked process', async() => {
        fork.mockReturnValue({ send: vi.fn(), on: vi.fn(), kill: vi.fn() });
        await host.startPlugin({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            capabilities: ['api:sendMessage'],
            manifest: { id: 'demo', capabilities: ['api:sendMessage'] }
        });
        const forkOptions = fork.mock.calls[0]![2];
        expect(forkOptions.execArgv).toBeDefined();
        expect(forkOptions.execArgv).toContain('--import=tsx');
        expect(forkOptions.execArgv.some((arg: string) => /^--max-old-space-size=\d+$/.test(arg))).toBe(true);
        expect(forkOptions.resourceLimits).toBeUndefined();
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
            host.recordCrash('demo', null, null);
        }
        expect(host.isDisabled('demo')).toBe(true);
        expect(disable).toHaveBeenCalledWith('demo');
    });

    it('should reset crash counter after a healthy window', () => {
        // Create a host with a mutable time function
        let currentTime = 1000;
        const hostWithMutableTime = new WorkerHost({
            fork: fork as unknown as WorkerHostOptions['fork'],
            log: () => {},
            now: () => currentTime,
            backoff: (attempt) => Math.min(1000 * 2 ** attempt, 60000)
        });

        // Record a crash at time 1000
        hostWithMutableTime.recordCrash('demo', null, null);
        
        // Advance time by 11 minutes (past the 10-minute healthy window)
        currentTime = 1000 + 11 * 60 * 1000;
        
        // Mark healthy - should reset crash counter
        hostWithMutableTime.markHealthy('demo');
        expect(hostWithMutableTime.getConsecutiveCrashes('demo')).toBe(0);
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
        const sent = host.send('demo', { kind: 'request', method: 'ping' } as unknown as RPCMessage);
        expect(sent).toBe(true);
        expect(childSend).toHaveBeenCalledWith({ kind: 'request', method: 'ping' });
    });

    it('should return false when sending to a non-existent worker', () => {
        expect(host.send('nonexistent', {} as unknown as RPCMessage)).toBe(false);
    });
});
