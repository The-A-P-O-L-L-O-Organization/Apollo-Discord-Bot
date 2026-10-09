import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import PluginManager from '../../src/core/PluginManager.js';
import EventBus from '../../src/core/EventBus.js';
import Plugin from '../../src/core/Plugin.js';
import type { TypedClient as PluginClient } from '../../src/core/Plugin.js';
import type { TypedClient as ManagerClient, PluginConstructor } from '../../src/core/PluginManager.js';
import type { WorkerInfo } from '../../src/core/worker/workerHost.js';

vi.mock('../../src/core/pluginDownloader.js', () => ({
    installPlugin: vi.fn()
}));

class PassThroughPlugin extends Plugin {
    static override id = 'passthrough';
    static override dependencies: string[] = [];
    override onLoad = vi.fn();
    override onUnload = vi.fn();
    override onEnable = vi.fn();
    override onDisable = vi.fn();
}

class DependentPlugin extends Plugin {
    static override id = 'dependent';
    static override dependencies = ['passthrough'];
    override onLoad = vi.fn();
    override onEnable = vi.fn();
    override onDisable = vi.fn();
    override onUnload = vi.fn();
}

describe('PluginManager', () => {
    let manager: PluginManager;
    let client: PluginClient & ManagerClient;
    let bus: EventBus;

    beforeEach(() => {
        client = { commands: new Map(), config: { plugins: { enabled: [], directory: './src/plugins' }, CLIENT_ID: '123' }, on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), rest: { put: vi.fn() } } as unknown as PluginClient & ManagerClient;
        bus = new EventBus();
        manager = new PluginManager(client, bus);
        manager._pluginRegistry.set('passthrough', PassThroughPlugin as unknown as PluginConstructor);
        manager._pluginRegistry.set('dependent', DependentPlugin as unknown as PluginConstructor);
    });

    it('should load and enable a plugin', async() => {
        const plugin = await manager.loadPlugin('passthrough');
        expect(plugin).toBeInstanceOf(PassThroughPlugin);
        expect((plugin as unknown as { _loaded: boolean })._loaded).toBe(true);
        expect(plugin.onLoad).toHaveBeenCalled();

        await manager.enablePlugin('passthrough');
        expect((plugin as unknown as { _enabled: boolean })._enabled).toBe(true);
        expect(plugin.onEnable).toHaveBeenCalled();
    });

    it('should disable and unload a plugin', async() => {
        const plugin = await manager.loadPlugin('passthrough');
        await manager.enablePlugin('passthrough');
        await manager.disablePlugin('passthrough');
        expect((plugin as unknown as { _enabled: boolean })._enabled).toBe(false);
        expect(plugin.onDisable).toHaveBeenCalled();
        await manager.unloadPlugin('passthrough');
        expect((plugin as unknown as { _loaded: boolean })._loaded).toBe(false);
        expect(plugin.onUnload).toHaveBeenCalled();
    });

    it('should enforce dependency ordering', async() => {
        await manager.loadPlugin('dependent');
        await expect(manager.enablePlugin('dependent')).rejects.toThrow();
        await manager.loadPlugin('passthrough');
        await manager.enablePlugin('passthrough');
        await expect(manager.enablePlugin('dependent')).resolves.toBeUndefined();
    });

    it('should return undefined for unknown plugin', () => {
        expect(manager.getPlugin('nonexistent')).toBeUndefined();
    });

    it('should list plugins', async() => {
        await manager.loadPlugin('passthrough');
        const list = manager.listPlugins();
        expect(list).toHaveLength(1);
        expect(list[0]!.id).toBe('passthrough');
    });

    it('should check if plugin is enabled', async() => {
        await manager.loadPlugin('passthrough');
        expect(manager.isEnabled('passthrough')).toBe(false);
        await manager.enablePlugin('passthrough');
        expect(manager.isEnabled('passthrough')).toBe(true);
    });

    it('should route installed plugins through the worker host', async() => {
        const startPlugin = vi.fn().mockResolvedValue({ child: { send: vi.fn() }, manifest: { id: 'demo', capabilities: ['api:sendMessage'] } });
        const sent: { correlationId: string; method: string }[] = [];
        const listeners: ((msg: unknown) => void)[] = [];
        const child = {
            send: vi.fn(),
            on: vi.fn((_event: string, listener: (msg: unknown) => void) => {
                listeners.push(listener);
            })
        };
        const send = vi.fn((_pluginId: string, msg: { correlationId: string; method: string }): boolean => {
            sent.push(msg);
            const result = msg.method === 'lifecycle:describe'
                ? { ok: true, commands: [] }
                : { ok: true };
            queueMicrotask(() => {
                for (const listener of [...listeners]) {
                    listener({ kind: 'response', correlationId: msg.correlationId, result });
                }
            });
            return true;
        });
        const getWorker = vi.fn().mockReturnValue({ child });
        const messageHandlers = new Map<string, ((msg: unknown) => void)[]>();
        const hostMock = {
            startPlugin,
            send,
            getWorker,
            isWorkerReady: vi.fn().mockReturnValue(false),
            on: vi.fn((event: string, handler: (msg: unknown) => void) => {
                messageHandlers.set(event, [...(messageHandlers.get(event) ?? []), handler]);
            }),
            off: vi.fn((event: string, handler: (msg: unknown) => void) => {
                messageHandlers.set(event, (messageHandlers.get(event) ?? []).filter(h => h !== handler));
            }),
            getGrantedCapabilities: (_m: unknown, r: unknown) => r
        };
        manager.workerHost = hostMock as unknown as PluginManager['workerHost'];
        const pending = manager.loadInstalledPlugin('demo', '/data/plugins/demo', { id: 'demo', name: 'demo', capabilities: ['api:sendMessage'] });
        await new Promise(r => setTimeout(r, 10));
        for (const handler of [...(messageHandlers.get('workerMessage') ?? [])]) {
            handler({ type: 'lifecycle:ready', pluginId: 'demo' });
        }
        await pending;
        expect(startPlugin).toHaveBeenCalledWith(expect.objectContaining({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            manifest: { id: 'demo', name: 'demo', capabilities: ['api:sendMessage'] }
        }));
        expect(manager.installedPlugins.get('demo')!.origin).toBe('installed');
        expect(manager.getPlugin('demo')?.name).toBe('demo');
        const methods = sent.map(s => s.method);
        expect(methods).toContain('lifecycle:load');
        expect(methods).toContain('lifecycle:describe');
    });

    it('enforces signature verification when installing a plugin', async () => {
        const tmpRoot = mkdtempSync(join(tmpdir(), 'apollo-manager-install-'));
        try {
            const installedDir = join(tmpRoot, 'plugins');
            const registryFile = join(tmpRoot, 'registry.json');
            writeFileSync(registryFile, JSON.stringify({ plugins: [{ description: 'Demo', downloadUrl: 'https://cdn.example.com/demo.zip', id: 'demo', name: 'Demo', version: '1.0.0' }] }));
            (manager.client.config as unknown as { plugins: Record<string, unknown> }).plugins = { enabled: [], paths: { installed: installedDir }, registryFile };
            const { installPlugin } = await import('../../src/core/pluginDownloader.js');
            const installMock = vi.mocked(installPlugin);
            installMock.mockResolvedValue({ pluginDir: join(installedDir, 'demo'), pluginId: 'demo', success: true });
            const loadSpy = vi.spyOn(manager, 'loadInstalledPlugin').mockResolvedValue({} as unknown as WorkerInfo);
            await manager.installPlugin('demo');
            const expectedDest = join(process.cwd(), installedDir, 'demo');
            expect(installMock).toHaveBeenCalledWith(
                expect.objectContaining({ downloadUrl: 'https://cdn.example.com/demo.zip', id: 'demo' }),
                expect.objectContaining({ destDir: expectedDest, verifySignature: true })
            );
            expect(loadSpy).toHaveBeenCalledWith('demo', expectedDest);
            const enabled = ((manager.client.config as unknown as { plugins: { enabled: string[] } }).plugins.enabled);
            expect(enabled).toContain('demo');
        } finally {
            rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    it('aborts install when signature verification fails', async () => {
        const tmpRoot = mkdtempSync(join(tmpdir(), 'apollo-manager-install-fail-'));
        try {
            const installedDir = join(tmpRoot, 'plugins');
            const registryFile = join(tmpRoot, 'registry.json');
            writeFileSync(registryFile, JSON.stringify({ plugins: [{ description: 'Evil', downloadUrl: 'https://cdn.example.com/evil.zip', id: 'evil', name: 'Evil', version: '1.0.0' }] }));
            (manager.client.config as unknown as { plugins: Record<string, unknown> }).plugins = { enabled: [], paths: { installed: installedDir }, registryFile };
            const { installPlugin } = await import('../../src/core/pluginDownloader.js');
            const installMock = vi.mocked(installPlugin);
            installMock.mockRejectedValueOnce(new Error('Sigstore verification failed: No valid signature found in Sigstore bundle.'));
            const loadSpy = vi.spyOn(manager, 'loadInstalledPlugin').mockResolvedValue({} as unknown as WorkerInfo);
            await expect(manager.installPlugin('evil')).rejects.toThrow(/sigstore|verification/i);
            expect(loadSpy).not.toHaveBeenCalled();
        } finally {
            rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
