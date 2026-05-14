import { describe, it, expect } from 'vitest';
import Plugin from '../../src/core/Plugin.js';

class TestPlugin extends Plugin {
    static get id() { return 'test'; }
    static get dependencies() { return []; }
    static get version() { return '1.0.0'; }
}

describe('Plugin base class', () => {
    it('should require a subclass to define static id', () => {
        expect(() => new Plugin({}, {})).toThrow();
    });

    it('should be constructable with client and manager', () => {
        const client = {};
        const manager = {};
        const plugin = new TestPlugin(client, manager);
        expect(plugin.client).toBe(client);
        expect(plugin.manager).toBe(manager);
    });

    it('should start with loaded=false and enabled=false', () => {
        const plugin = new TestPlugin({}, {});
        expect(plugin._loaded).toBe(false);
        expect(plugin._enabled).toBe(false);
    });

    it('should have default lifecycle methods that resolve', async() => {
        const plugin = new TestPlugin({}, {});
        await expect(plugin.onLoad()).resolves.toBeUndefined();
        await expect(plugin.onUnload()).resolves.toBeUndefined();
        await expect(plugin.onEnable()).resolves.toBeUndefined();
        await expect(plugin.onDisable()).resolves.toBeUndefined();
    });

    it('should accept directory via setDirectory', () => {
        const plugin = new TestPlugin({}, {});
        plugin.setDirectory('/some/path');
        expect(plugin._dir).toBe('/some/path');
    });

    it('should return static metadata', () => {
        expect(TestPlugin.id).toBe('test');
        expect(TestPlugin.dependencies).toEqual([]);
        expect(TestPlugin.version).toBe('1.0.0');
    });
});
