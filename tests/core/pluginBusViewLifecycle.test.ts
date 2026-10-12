import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { Plugin } from '../../src/core/Plugin.js';
import type { TypedClient as PluginClient } from '../../src/core/Plugin.js';
import PluginManager from '../../src/core/PluginManager.js';
import type { TypedClient as ManagerClient, PluginConstructor } from '../../src/core/PluginManager.js';
import EventBusImpl from '../../src/core/EventBus.js';
import { RpcRegistry } from '../../src/core/eventBus/rpcRegistry.js';

class TestPlugin extends Plugin {
    static override get id(): string { return 'testplugin'; }
}

function makePlugin(): { plugin: TestPlugin; bus: EventBusImpl } {
    const bus = new EventBusImpl();
    const manager = { bus, registerSocketHandler: () => {} };
    const plugin = new TestPlugin({} as unknown as PluginClient, manager as never);
    return { plugin, bus };
}

describe('Plugin busView lifecycle', () => {
    it('exposes a view bound to the plugin id', () => {
        const { plugin } = makePlugin();
        expect(plugin.busView.pluginId).toBe('testplugin');
    });

    it('routes view registrations through the shared bus', async () => {
        const { plugin, bus } = makePlugin();
        const seen: unknown[] = [];
        plugin.busView.on('testplugin:ping', async (m) => { seen.push(m.payload); });
        await bus.emit('testplugin:ping', { n: 1 });
        expect(seen).toEqual([{ n: 1 }]);
    });

    it('caches views per plugin id and exposes them via viewFor', () => {
        const bus = new EventBusImpl();
        const first = bus.createView('testplugin');
        expect(bus.createView('testplugin')).toBe(first);
        expect(bus.viewFor('testplugin')).toBe(first);
        expect(bus.viewFor('unknown')).toBeUndefined();
    });

    it('disposes the cached view via viewFor', async () => {
        const { plugin, bus } = makePlugin();
        const seen: unknown[] = [];
        plugin.busView.on('testplugin:ping', async (m) => { seen.push(m.payload); });
        const disposed = bus.viewFor('testplugin');
        disposed?.dispose();
        await bus.emit('testplugin:ping', { n: 1 });
        expect(seen).toEqual([]);
        await expect(disposed!.emit('testplugin:ping', { n: 1 })).rejects.toThrow(/disposed/);
        expect(plugin.busView.isDisposed).toBe(false);
        expect(plugin.busView).not.toBe(disposed);
    });

    it('state accessors throw the disposed error after dispose', async () => {
        const bus = new EventBusImpl();
        const view = bus.createView('plugina');
        const state = view.state('counter');
        state.provide(0);
        view.dispose();
        expect(() => state.get()).toThrow(/disposed/);
        await expect(state.set(1)).rejects.toThrow(/disposed/);
        expect(() => state.watch(() => {})).toThrow(/disposed/);
        expect(() => state.provide(2)).toThrow(/disposed/);
    });

    it('repeated state() access for the same key does not throw duplicate-contract', () => {
        const bus = new EventBusImpl();
        const view = bus.createView('pluginb');
        view.state('counter').provide(0);
        expect(() => view.state('counter')).not.toThrow();
    });

    it('callWithTimeout leaves no unhandled rejection when the provider rejects late', async () => {
        const registry = new RpcRegistry();
        let rejectLate!: (err: Error) => void;
        registry.provide('slow', () => new Promise<unknown>((_resolve, reject) => { rejectLate = reject; }), 'pluginc');
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
        process.on('unhandledRejection', onUnhandled);
        try {
            await expect(registry.callWithTimeout('slow', 20, 'caller')).rejects.toThrow(/timed out/);
            rejectLate(new Error('late failure'));
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });

    it('on() strips the schema key before delegating to the bus', () => {
        const bus = new EventBusImpl();
        const view = bus.createView('plugind');
        const spy = vi.spyOn(bus, 'on');
        try {
            view.on('plugind:evt', async () => {}, { schema: z.string() });
            const options = spy.mock.calls[0]?.[3] as { schema?: unknown } | undefined;
            expect(options === undefined || !('schema' in options)).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });
});

const received: unknown[] = [];

class LifecyclePlugin extends Plugin {
    static override get id(): string { return 'lifecyclea'; }
    override async onEnable(): Promise<void> {
        this.busView.on('lifecyclea:ping', async (m) => { received.push(m.payload); });
    }
}

function makeManager(pluginClass: PluginConstructor): { manager: PluginManager; bus: EventBusImpl } {
    const client = { commands: new Map(), config: { plugins: { enabled: [], directory: './src/plugins' } }, on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), rest: { put: vi.fn() } } as unknown as PluginClient & ManagerClient;
    const bus = new EventBusImpl();
    const manager = new PluginManager(client, bus);
    manager._pluginRegistry.set(pluginClass.id, pluginClass);
    return { manager, bus };
}

describe('PluginBusView manager lifecycle', () => {
    it('enabled plugin subscribes in onEnable and receives emits', async () => {
        received.length = 0;
        const { manager, bus } = makeManager(LifecyclePlugin as unknown as PluginConstructor);
        await manager.loadPlugin('lifecyclea');
        await manager.enablePlugin('lifecyclea');
        await bus.emit('lifecyclea:ping', { n: 1 });
        expect(received).toEqual([{ n: 1 }]);
    });

    it('disable disposes the view and removes handlers', async () => {
        received.length = 0;
        const { manager, bus } = makeManager(LifecyclePlugin as unknown as PluginConstructor);
        await manager.loadPlugin('lifecyclea');
        await manager.enablePlugin('lifecyclea');
        const view = bus.viewFor('lifecyclea');
        await manager.disablePlugin('lifecyclea');
        expect(view?.isDisposed).toBe(true);
        await bus.emit('lifecyclea:ping', { n: 2 });
        expect(received).toEqual([]);
    });

    it('re-enable yields a live view and re-subscribing works', async () => {
        received.length = 0;
        const { manager, bus } = makeManager(LifecyclePlugin as unknown as PluginConstructor);
        const plugin = await manager.loadPlugin('lifecyclea');
        await manager.enablePlugin('lifecyclea');
        await manager.disablePlugin('lifecyclea');
        await manager.enablePlugin('lifecyclea');
        const view = (plugin as unknown as LifecyclePlugin).busView;
        expect(view.isDisposed).toBe(false);
        await bus.emit('lifecyclea:ping', { n: 3 });
        expect(received).toEqual([{ n: 3 }]);
    });

    it('repeated on once and state registration does not throw duplicate-contract', async () => {
        received.length = 0;
        const { manager, bus } = makeManager(LifecyclePlugin as unknown as PluginConstructor);
        const plugin = await manager.loadPlugin('lifecyclea');
        await manager.enablePlugin('lifecyclea');
        const view = (plugin as unknown as LifecyclePlugin).busView;
        expect(() => {
            view.on('lifecyclea:ping', async (m) => { received.push(m.payload); });
            view.once('lifecyclea:pong', async () => {});
            view.once('lifecyclea:pong', async () => {});
            view.state('counter').provide(0);
            view.state('counter').get();
        }).not.toThrow();
        await bus.emit('lifecyclea:ping', { n: 4 });
        expect(received).toContainEqual({ n: 4 });
    });
});
