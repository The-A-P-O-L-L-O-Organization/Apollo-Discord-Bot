import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../../src/core/EventBus.js';

describe('EventBus', () => {
    let bus;

    beforeEach(() => {
        bus = new EventBus();
    });

    it('should register and emit events', async() => {
        const results = [];
        bus.on('test:event', (payload) => { results.push(payload); }, 'plugin-a');
        await bus.emit('test:event', { data: 1 });
        expect(results).toEqual([{ data: 1 }]);
    });

    it('should call multiple handlers for the same event', async() => {
        const results = [];
        bus.on('test:event', (p) => results.push('a:' + p.v), 'plugin-a');
        bus.on('test:event', (p) => results.push('b:' + p.v), 'plugin-b');
        await bus.emit('test:event', { v: 1 });
        expect(results).toEqual(['a:1', 'b:1']);
    });

    it('should not call handlers for other events', async() => {
        const results = [];
        bus.on('test:a', (p) => results.push(p), 'plugin-a');
        bus.on('test:b', (p) => results.push(p), 'plugin-a');
        await bus.emit('test:a', { v: 1 });
        expect(results).toEqual([{ v: 1 }]);
    });

    it('should support once handlers', async() => {
        let count = 0;
        bus.once('test:event', () => { count++; }, 'plugin-a');
        await bus.emit('test:event', {});
        await bus.emit('test:event', {});
        expect(count).toBe(1);
    });

    it('should remove all handlers for a pluginId', async() => {
        const results = [];
        bus.on('test:event', (p) => results.push(p), 'plugin-a');
        bus.on('test:event', (p) => results.push(p), 'plugin-b');
        bus.removeAll('plugin-a');
        await bus.emit('test:event', { v: 1 });
        expect(results).toEqual([{ v: 1 }]);
    });

    it('should return an unsubscribe function from on()', async() => {
        const results = [];
        const unsub = bus.on('test:event', (p) => results.push(p), 'plugin-a');
        unsub();
        await bus.emit('test:event', { v: 1 });
        expect(results).toEqual([]);
    });

    describe('API registry', () => {
        it('should register and call a provided API', async() => {
            bus.provide('test.hello', (name) => `Hello, ${name}!`, 'plugin-a');
            const result = await bus.call('test.hello', 'World');
            expect(result).toBe('Hello, World!');
        });

        it('should pass multiple arguments to the API function', async() => {
            bus.provide('test.add', (a, b) => a + b, 'plugin-a');
            const result = await bus.call('test.add', 3, 7);
            expect(result).toBe(10);
        });

        it('should throw on calling a non-existent namespace', async() => {
            await expect(bus.call('nope.nothere')).rejects.toThrow('Unknown API');
        });

        it('should throw on re-registering an existing namespace', () => {
            bus.provide('test.dup', () => {}, 'plugin-a');
            expect(() => bus.provide('test.dup', () => {}, 'plugin-b')).toThrow('already registered');
        });

        it('should remove all APIs for a plugin on removeAll', async() => {
            bus.provide('test.foo', () => 'foo', 'plugin-a');
            bus.removeAll('plugin-a');
            await expect(bus.call('test.foo')).rejects.toThrow('Unknown API');
        });

        it('should support async API functions', async() => {
            const delay = (ms) => new Promise(r => setTimeout(r, ms));
            bus.provide('test.async', async(x) => { await delay(5); return x * 2; }, 'plugin-a');
            const result = await bus.call('test.async', 21);
            expect(result).toBe(42);
        });

        it('should propagate errors from API functions', async() => {
            bus.provide('test.err', () => { throw new Error('oops'); }, 'plugin-a');
            await expect(bus.call('test.err')).rejects.toThrow('oops');
        });
    });

    describe('shared reactive state', () => {
        it('should provide state with a default value', () => {
            bus.provideState('counter', 0, 'plugin-a');
            expect(bus.getState('counter')).toBe(0);
        });

        it('should update state via setState', () => {
            bus.provideState('counter', 0, 'plugin-a');
            bus.setState('counter', 42);
            expect(bus.getState('counter')).toBe(42);
        });

        it('should return undefined for non-existent state key', () => {
            expect(bus.getState('nothing')).toBeUndefined();
        });

        it('should notify watchers on state change', () => {
            const changes = [];
            bus.provideState('key', 1, 'plugin-a');
            bus.watchState('key', (newVal, oldVal) => changes.push({ newVal, oldVal }), 'plugin-b');
            bus.setState('key', 2);
            expect(changes).toEqual([{ newVal: 2, oldVal: 1 }]);
        });

        it('should notify multiple watchers', () => {
            const results = [];
            bus.provideState('key', 0, 'plugin-a');
            bus.watchState('key', (n) => results.push('b:' + n), 'plugin-b');
            bus.watchState('key', (n) => results.push('c:' + n), 'plugin-c');
            bus.setState('key', 99);
            expect(results).toContain('b:99');
            expect(results).toContain('c:99');
        });

        it('should return unsubscribe function from watchState', () => {
            const changes = [];
            bus.provideState('key', 0, 'plugin-a');
            const unsub = bus.watchState('key', (n) => changes.push(n), 'plugin-b');
            unsub();
            bus.setState('key', 1);
            expect(changes).toEqual([]);
        });

        it('should throw on re-registering an existing state key', () => {
            bus.provideState('key', 1, 'plugin-a');
            expect(() => bus.provideState('key', 2, 'plugin-b')).toThrow('already registered');
        });

        it('should clean up state keys on removeAll', () => {
            bus.provideState('key', 1, 'plugin-a');
            bus.watchState('key', () => {}, 'plugin-b');
            bus.removeAll('plugin-a');
            expect(bus.getState('key')).toBeUndefined();
        });

        it('should stop watchers when owning plugin is removed', () => {
            const changes = [];
            bus.provideState('key', 0, 'plugin-a');
            bus.watchState('key', (n) => changes.push(n), 'plugin-b');
            bus.removeAll('plugin-b');
            bus.setState('key', 2);
            expect(changes).toEqual([]);
        });
    });
});
