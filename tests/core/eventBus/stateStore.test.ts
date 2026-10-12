import { describe, it, expect, vi } from 'vitest';
import { StateStore } from '../../../src/core/eventBus/stateStore.js';

describe('StateStore', () => {
    it('provides, gets and sets a state key', async () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        expect(store.get('interlink:counter')).toBe(0);
        await store.set('interlink:counter', 5);
        expect(store.get('interlink:counter')).toBe(5);
    });

    it('throws on duplicate key registration', () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        expect(() => store.provide('interlink:counter', 1, 'interlink')).toThrow(/State key "interlink:counter" is already registered/);
    });

    it('throws on unknown key for get/set/watch', async () => {
        const store = new StateStore();
        expect(store.get('missing')).toBeUndefined();
        await expect(store.set('missing', 1)).rejects.toThrow('Unknown state key: "missing"');
        expect(() => store.watch('missing', () => {}, 'interlink')).toThrow('Unknown state key: "missing"');
    });

    it('notifies watchers with new and old values', async () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        const seen: [unknown, unknown][] = [];
        store.watch('interlink:counter', (next, prev) => { seen.push([next, prev]); }, 'moderation');
        await store.set('interlink:counter', 7);
        expect(seen).toEqual([[7, 0]]);
    });

    it('watcher errors are logged and do not break the set', async () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        store.watch('interlink:counter', () => { throw new Error('watcher boom'); }, 'moderation');
        await store.set('interlink:counter', 3);
        expect(store.get('interlink:counter')).toBe(3);
    });

    it('expired TTL keys return undefined and disappear', async () => {
        vi.useFakeTimers();
        const store = new StateStore();
        store.provide('interlink:temp', 'v', 'interlink', 100);
        expect(store.get('interlink:temp')).toBe('v');
        vi.advanceTimersByTime(150);
        expect(store.get('interlink:temp')).toBeUndefined();
        await expect(store.set('interlink:temp', 'x')).rejects.toThrow('Unknown state key: "interlink:temp"');
    });

    it('unset TTL keys never expire', () => {
        vi.useFakeTimers();
        const store = new StateStore();
        store.provide('interlink:perm', 'v', 'interlink');
        vi.advanceTimersByTime(1_000_000);
        expect(store.get('interlink:perm')).toBe('v');
    });

    it('removeAll deletes owned keys and detaches foreign watchers', async () => {
        const store = new StateStore();
        store.provide('interlink:own', 1, 'interlink');
        store.provide('moderation:own', 2, 'moderation');
        const calls: number[] = [];
        store.watch('moderation:own', (v) => { calls.push(v as number); }, 'interlink');
        store.removeAll('interlink');
        expect(store.get('interlink:own')).toBeUndefined();
        expect(store.get('moderation:own')).toBe(2);
        await store.set('moderation:own', 9);
        expect(calls).toEqual([]);
    });
});
