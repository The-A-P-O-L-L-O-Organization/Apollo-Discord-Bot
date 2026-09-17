import { describe, it, expect } from 'vitest';
import Plugin from '../../src/core/Plugin.js';
import type { TypedClient } from '../../src/core/Plugin.js';

class TestPlugin extends Plugin {
    static override get id() { return 'test'; }
    static override get dependencies() { return []; }
    static override get version() { return '1.0.0'; }
}

describe('Plugin base class', () => {
    it('should require a subclass to define static id', () => {
        const ConcretePlugin = Plugin as unknown as new (...args: unknown[]) => Plugin;
        expect(() => new ConcretePlugin({}, {})).toThrow();
    });

    it('should be constructable with client and manager', () => {
        const client = {} as unknown as TypedClient;
        const manager = {} as unknown as TestPlugin['manager'];
        const plugin = new TestPlugin(client, manager);
        expect(plugin.client).toBe(client);
        expect(plugin.manager).toBe(manager);
    });

    it('should start with loaded=false and enabled=false', () => {
        const plugin = new TestPlugin({} as unknown as TypedClient, {} as unknown as TestPlugin['manager']);
        expect((plugin as unknown as { _loaded: boolean })._loaded).toBe(false);
        expect((plugin as unknown as { _enabled: boolean })._enabled).toBe(false);
    });

    it('should have default lifecycle methods that resolve', async() => {
        const plugin = new TestPlugin({} as unknown as TypedClient, {} as unknown as TestPlugin['manager']);
        await expect(plugin.onLoad()).resolves.toBeUndefined();
        await expect(plugin.onUnload()).resolves.toBeUndefined();
        await expect(plugin.onEnable()).resolves.toBeUndefined();
        await expect(plugin.onDisable()).resolves.toBeUndefined();
    });

    it('should accept directory via setDirectory', () => {
        const plugin = new TestPlugin({} as unknown as TypedClient, {} as unknown as TestPlugin['manager']);
        plugin.setDirectory('/some/path');
        expect((plugin as unknown as { _dir: unknown })._dir).toBe('/some/path');
    });

    it('should return static metadata', () => {
        expect(TestPlugin.id).toBe('test');
        expect(TestPlugin.dependencies).toEqual([]);
        expect(TestPlugin.version).toBe('1.0.0');
    });
});
