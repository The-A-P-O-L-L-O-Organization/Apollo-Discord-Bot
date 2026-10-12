import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { Plugin } from '../../src/core/Plugin.js';
import type { TypedClient as PluginClient } from '../../src/core/Plugin.js';
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
        bus.viewFor('testplugin')?.dispose();
        await bus.emit('testplugin:ping', { n: 1 });
        expect(seen).toEqual([]);
        await expect(plugin.busView.emit('testplugin:ping', { n: 1 })).rejects.toThrow(/disposed/);
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
