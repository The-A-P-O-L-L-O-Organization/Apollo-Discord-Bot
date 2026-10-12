import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import EventBusImpl from '../../../src/core/EventBus.js';
import { RpcTimeoutError } from '../../../src/core/eventBus/rpcRegistry.js';

function makeView(pluginId: string) {
    const bus = new EventBusImpl();
    const view = bus.createView(pluginId);
    return { bus, view };
}

describe('PluginBusView naming rules', () => {
    it('emits within the own namespace', async () => {
        const { bus, view } = makeView('interlink');
        const seen: unknown[] = [];
        bus.on('interlink:message:ping', async (m) => { seen.push(m.payload); }, 'interlink');
        await view.emit('interlink:message:ping', { a: 1 });
        expect(seen).toEqual([{ a: 1 }]);
    });

    it('rejects emit outside the own namespace, including bare and error events', async () => {
        const { view } = makeView('interlink');
        await expect(view.emit('memberJoin', {})).rejects.toThrow(/must be namespaced to "interlink"/);
        await expect(view.emit('moderation:action', {})).rejects.toThrow(/must be namespaced to "interlink"/);
        await expect(view.emit('error', new Error('x'))).rejects.toThrow(/must be namespaced to "interlink"/);
    });

    it('allows on/once for own-namespace and bare gateway names', () => {
        const { view } = makeView('interlink');
        expect(() => view.on('interlink:message:pong', async () => {})).not.toThrow();
        expect(() => view.on('memberJoin', async () => {})).not.toThrow();
    });

    it('rejects foreign-namespace subscriptions at registration', () => {
        const { view } = makeView('interlink');
        expect(() => view.on('moderation:action', async () => {})).toThrow(/foreign namespace/);
        expect(() => view.on('moderation:action', async () => {}, { priority: 1 })).toThrow(/foreign namespace/);
    });

    it('validates payloads against a registered schema before delivery', async () => {
        const bus = new EventBusImpl();
        const schema = z.object({ nonce: z.string() });
        const subscriber = bus.createView('interlink');
        const emitter = bus.createView('interlink');
        subscriber.on('interlink:message:ping', async () => {}, { schema });
        await expect(emitter.emit('interlink:message:ping', { nonce: 'abc' })).resolves.toBeUndefined();
        await expect(emitter.emit('interlink:message:ping', { nope: 1 })).rejects.toThrow(/Schema validation failed/);
    });
});

describe('PluginBusView rpc', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('namespaces provide and call automatically and applies the default timeout', async () => {
        const { view } = makeView('interlink');
        view.provide('ping', async () => 'pong');
        await expect(view.call('ping')).resolves.toBe('pong');
    });

    it('surfaces the provider timeout override', async () => {
        vi.useFakeTimers();
        const { view } = makeView('interlink');
        view.provide('hang', () => new Promise(() => {}), { timeoutMs: 100 });
        const promise = view.call('hang');
        vi.advanceTimersByTimeAsync(150);
        await expect(promise).rejects.toBeInstanceOf(RpcTimeoutError);
    });

    it('applies the default 5000ms timeout when the provider sets none', async () => {
        vi.useFakeTimers();
        const { view } = makeView('interlink');
        view.provide('hang', () => new Promise(() => {}));
        const promise = view.call('hang');
        vi.advanceTimersByTimeAsync(5100);
        await expect(promise).rejects.toMatchObject({ timeoutMs: 5000 });
    });
});

describe('PluginBusView state', () => {
    it('scopes state access to the plugin namespace', async () => {
        const { view } = makeView('interlink');
        const state = view.state('counter');
        state.provide(0);
        await state.set(4);
        expect(state.get()).toBe(4);
    });

    it('applies opt-in TTL', async () => {
        vi.useFakeTimers();
        const { view } = makeView('interlink');
        const state = view.state('temp');
        state.provide('v', 100);
        vi.advanceTimersByTime(150);
        expect(state.get()).toBeUndefined();
    });
});

describe('PluginBusView dispose', () => {
    it('removes all registrations and rejects further use, idempotently', async () => {
        const { bus, view } = makeView('interlink');
        const seen: unknown[] = [];
        view.on('memberJoin', async (m) => { seen.push(m.payload); });
        view.provide('ping', async () => 'pong');
        view.dispose();
        view.dispose();

        await bus.emit('memberJoin', { x: 1 });
        expect(seen).toEqual([]);
        await expect(view.emit('interlink:ping', {})).rejects.toThrow(/PluginBusView for "interlink" is disposed/);
        expect(() => view.on('memberJoin', async () => {})).toThrow(/disposed/);
        await expect(view.call('ping')).rejects.toThrow(/disposed/);
    });
});
