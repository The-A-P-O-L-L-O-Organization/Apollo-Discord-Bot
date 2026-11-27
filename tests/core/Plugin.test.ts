import { describe, it, expect } from 'vitest';
import Plugin from '../../src/core/Plugin.js';
import EventBusImpl from '../../src/core/EventBus.js';
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
        const manager = { bus: new EventBusImpl() } as unknown as TestPlugin['manager'];
        const plugin = new TestPlugin(client, manager);
        expect(plugin.client).toBe(client);
        expect(plugin.manager).toBe(manager);
    });

    it('should start with loaded=false and enabled=false', () => {
        const plugin = new TestPlugin({} as unknown as TypedClient, { bus: new EventBusImpl() } as unknown as TestPlugin['manager']);
        expect((plugin as unknown as { _loaded: boolean })._loaded).toBe(false);
        expect((plugin as unknown as { _enabled: boolean })._enabled).toBe(false);
    });

    it('should have default lifecycle methods that resolve', async() => {
        const plugin = new TestPlugin({} as unknown as TypedClient, { bus: new EventBusImpl() } as unknown as TestPlugin['manager']);
        await expect(plugin.onLoad()).resolves.toBeUndefined();
        await expect(plugin.onUnload()).resolves.toBeUndefined();
        await expect(plugin.onEnable()).resolves.toBeUndefined();
        await expect(plugin.onDisable()).resolves.toBeUndefined();
    });

    it('should accept directory via setDirectory', () => {
        const plugin = new TestPlugin({} as unknown as TypedClient, { bus: new EventBusImpl() } as unknown as TestPlugin['manager']);
        plugin.setDirectory('/some/path');
        expect((plugin as unknown as { _dir: unknown })._dir).toBe('/some/path');
    });

    it('should return static metadata', () => {
        expect(TestPlugin.id).toBe('test');
        expect(TestPlugin.dependencies).toEqual([]);
        expect(TestPlugin.version).toBe('1.0.0');
    });

    it('_loadEvents swallows rejected event handlers (no unhandled rejection)', async() => {
        const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const dir = mkdtempSync(join(tmpdir(), 'apollo-evt-'));
        mkdirSync(join(dir, 'events'), { recursive: true });
        writeFileSync(
            join(dir, 'events', 'x.js'),
            'export default { name: "messageCreate", once: false, execute() { return Promise.reject(new Error("boom")); } };'
        );

        const listeners = new Map<string, (...args: unknown[]) => void>();
        const client = {
            on: (name: string, fn: (...args: unknown[]) => void): void => { listeners.set(name, fn); },
            once: (): void => undefined,
            removeListener: (): void => undefined
        } as unknown as TypedClient;
        const plugin = new TestPlugin(client, { bus: new EventBusImpl() } as unknown as TestPlugin['manager']);
        plugin.setDirectory(dir);

        await plugin._loadEvents();
        const handler = listeners.get('messageCreate');
        expect(typeof handler).toBe('function');

        let unhandled = false;
        const onUnhandled = (): void => { unhandled = true; };
        process.on('unhandledRejection', onUnhandled);
        try {
            expect(() => handler?.({}, client)).not.toThrow();
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(unhandled).toBe(false);
        } finally {
            process.off('unhandledRejection', onUnhandled);
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
