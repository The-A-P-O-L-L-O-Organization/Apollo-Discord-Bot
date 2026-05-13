import { describe, it, expect, beforeEach, vi } from 'vitest';
import PluginManager from '../../src/core/PluginManager.js';
import EventBus from '../../src/core/EventBus.js';
import Plugin from '../../src/core/Plugin.js';

class PassThroughPlugin extends Plugin {
    static id = 'passthrough';
    static dependencies = [];
    onLoad = vi.fn();
    onUnload = vi.fn();
    onEnable = vi.fn();
    onDisable = vi.fn();
}

class DependentPlugin extends Plugin {
    static id = 'dependent';
    static dependencies = ['passthrough'];
    onLoad = vi.fn();
    onEnable = vi.fn();
    onDisable = vi.fn();
    onUnload = vi.fn();
}

describe('PluginManager', () => {
    let manager;
    let client;
    let bus;

    beforeEach(() => {
        client = { commands: new Map(), config: { plugins: { enabled: [], directory: './src/plugins' }, CLIENT_ID: '123' }, on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), rest: { put: vi.fn() } };
        bus = new EventBus();
        manager = new PluginManager(client, bus);
        manager._pluginRegistry.set('passthrough', PassThroughPlugin);
        manager._pluginRegistry.set('dependent', DependentPlugin);
    });

    it('should load and enable a plugin', async() => {
        const plugin = await manager.loadPlugin('passthrough');
        expect(plugin).toBeInstanceOf(PassThroughPlugin);
        expect(plugin._loaded).toBe(true);
        expect(plugin.onLoad).toHaveBeenCalled();

        await manager.enablePlugin('passthrough');
        expect(plugin._enabled).toBe(true);
        expect(plugin.onEnable).toHaveBeenCalled();
    });

    it('should disable and unload a plugin', async() => {
        const plugin = await manager.loadPlugin('passthrough');
        await manager.enablePlugin('passthrough');
        await manager.disablePlugin('passthrough');
        expect(plugin._enabled).toBe(false);
        expect(plugin.onDisable).toHaveBeenCalled();
        await manager.unloadPlugin('passthrough');
        expect(plugin._loaded).toBe(false);
        expect(plugin.onUnload).toHaveBeenCalled();
    });

    it('should enforce dependency ordering', async() => {
        await manager.loadPlugin('dependent');
        await expect(manager.enablePlugin('dependent')).rejects.toThrow();
        await manager.loadPlugin('passthrough');
        await manager.enablePlugin('passthrough');
        await expect(manager.enablePlugin('dependent')).resolves.toBeUndefined();
    });

    it('should return null for unknown plugin', () => {
        expect(manager.getPlugin('nonexistent')).toBeNull();
    });

    it('should list plugins', async() => {
        await manager.loadPlugin('passthrough');
        const list = manager.listPlugins();
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe('passthrough');
    });

    it('should check if plugin is enabled', async() => {
        await manager.loadPlugin('passthrough');
        expect(manager.isEnabled('passthrough')).toBe(false);
        await manager.enablePlugin('passthrough');
        expect(manager.isEnabled('passthrough')).toBe(true);
    });
});
