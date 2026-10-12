import { describe, it, expect, vi, afterEach } from 'vitest';
import { RpcRegistry, RpcTimeoutError } from '../../../src/core/eventBus/rpcRegistry.js';

describe('RpcRegistry', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('provides and calls an API', async () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:ping', async () => 'pong', 'interlink');
        await expect(registry.call('interlink:ping')).resolves.toBe('pong');
    });

    it('throws on duplicate namespace registration', () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:ping', async () => 1, 'interlink');
        expect(() => registry.provide('interlink:ping', async () => 2, 'interlink')).toThrow(/API "interlink:ping" is already registered/);
    });

    it('throws on unknown namespace with the original message', async () => {
        const registry = new RpcRegistry();
        await expect(registry.call('nope:none')).rejects.toThrow('Unknown API: "nope:none"');
    });

    it('callWithTimeout rejects with RpcTimeoutError when the handler hangs', async () => {
        vi.useFakeTimers();
        const registry = new RpcRegistry();
        registry.provide('interlink:hang', () => new Promise(() => {}), 'interlink');

        const promise = registry.callWithTimeout('interlink:hang', 50, 'moderation');
        vi.advanceTimersByTimeAsync(60);
        await expect(promise).rejects.toBeInstanceOf(RpcTimeoutError);
        await expect(promise).rejects.toMatchObject({ namespace: 'interlink:hang', timeoutMs: 50, callerPluginId: 'moderation', name: 'RpcTimeoutError' });
    });

    it('callWithTimeout still resolves when the handler is fast', async () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:fast', async (v: unknown) => v, 'interlink');
        await expect(registry.callWithTimeout('interlink:fast', 5000, 'moderation', 'ok')).resolves.toBe('ok');
    });

    it('callWithTimeout leaves the registration intact after a timeout', async () => {
        vi.useFakeTimers();
        const registry = new RpcRegistry();
        let release: ((v: string) => void) | undefined;
        registry.provide('interlink:late', () => new Promise<string>((resolve) => { release = resolve; }), 'interlink');

        const promise = registry.callWithTimeout('interlink:late', 50, 'moderation');
        vi.advanceTimersByTimeAsync(60);
        await expect(promise).rejects.toBeInstanceOf(RpcTimeoutError);

        release?.('done');
        const pending = registry.call('interlink:late');
        release?.('done');
        await expect(pending).resolves.toBe('done');
    });

    it('removeAll deletes only the owning plugin APIs', () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:a', async () => 1, 'interlink');
        registry.provide('moderation:b', async () => 2, 'moderation');
        registry.removeAll('interlink');
        expect(registry.get('interlink:a')).toBeUndefined();
        expect(registry.get('moderation:b')?.pluginId).toBe('moderation');
    });
});
