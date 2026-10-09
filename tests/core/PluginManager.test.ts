import { describe, it, expect, beforeEach, vi } from 'vitest';
import PluginManager from '../../src/core/PluginManager.js';
import EventBus from '../../src/core/EventBus.js';
import Plugin from '../../src/core/Plugin.js';
import type { TypedClient as PluginClient } from '../../src/core/Plugin.js';
import type { TypedClient as ManagerClient, PluginConstructor } from '../../src/core/PluginManager.js';

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
        const sent: { correlationId: string }[] = [];
        const listeners: ((msg: unknown) => void)[] = [];
        const child = {
            send: vi.fn(),
            on: vi.fn((_event: string, listener: (msg: unknown) => void) => {
                listeners.push(listener);
            })
        };
        const send = vi.fn((_pluginId: string, msg: { correlationId: string }): boolean => {
            sent.push(msg);
            return true;
        });
        const getWorker = vi.fn().mockReturnValue({ child });
        manager.workerHost = { startPlugin, send, getWorker, getGrantedCapabilities: (m: unknown, r: unknown) => r } as unknown as PluginManager['workerHost'];
        const pending = manager.loadInstalledPlugin('demo', '/data/plugins/demo', { id: 'demo', name: 'demo', capabilities: ['api:sendMessage'] });
        await vi.waitFor(() => {
            expect(sent.length).toBeGreaterThan(0);
        });
        const request = sent[0] as { correlationId: string };
        for (const listener of listeners) {
            listener({ kind: 'response', correlationId: request.correlationId, result: { ok: true } });
        }
        await pending;
        expect(startPlugin).toHaveBeenCalledWith(expect.objectContaining({
            pluginId: 'demo',
            dir: '/data/plugins/demo',
            manifest: { id: 'demo', name: 'demo', capabilities: ['api:sendMessage'] }
        }));
        expect(manager.installedPlugins.get('demo')!.origin).toBe('installed');
        expect(manager.getPlugin('demo')?.name).toBe('demo');
    });
});
