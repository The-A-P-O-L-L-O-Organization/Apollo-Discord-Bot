import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../../src/core/EventBus.js';

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should register and emit events', async () => {
    const results = [];
    bus.on('test:event', (payload) => { results.push(payload); }, 'plugin-a');
    await bus.emit('test:event', { data: 1 });
    expect(results).toEqual([{ data: 1 }]);
  });

  it('should call multiple handlers for the same event', async () => {
    const results = [];
    bus.on('test:event', (p) => results.push('a:' + p.v), 'plugin-a');
    bus.on('test:event', (p) => results.push('b:' + p.v), 'plugin-b');
    await bus.emit('test:event', { v: 1 });
    expect(results).toEqual(['a:1', 'b:1']);
  });

  it('should not call handlers for other events', async () => {
    const results = [];
    bus.on('test:a', (p) => results.push(p), 'plugin-a');
    bus.on('test:b', (p) => results.push(p), 'plugin-a');
    await bus.emit('test:a', { v: 1 });
    expect(results).toEqual([{ v: 1 }]);
  });

  it('should support once handlers', async () => {
    let count = 0;
    bus.once('test:event', () => { count++; }, 'plugin-a');
    await bus.emit('test:event', {});
    await bus.emit('test:event', {});
    expect(count).toBe(1);
  });

  it('should remove all handlers for a pluginId', async () => {
    const results = [];
    bus.on('test:event', (p) => results.push(p), 'plugin-a');
    bus.on('test:event', (p) => results.push(p), 'plugin-b');
    bus.removeAll('plugin-a');
    await bus.emit('test:event', { v: 1 });
    expect(results).toEqual([{ v: 1 }]);
  });

  it('should return an unsubscribe function from on()', async () => {
    const results = [];
    const unsub = bus.on('test:event', (p) => results.push(p), 'plugin-a');
    unsub();
    await bus.emit('test:event', { v: 1 });
    expect(results).toEqual([]);
  });

  describe('API registry', () => {
    it('should register and call a provided API', async () => {
      bus.provide('test.hello', (name) => `Hello, ${name}!`, 'plugin-a');
      const result = await bus.call('test.hello', 'World');
      expect(result).toBe('Hello, World!');
    });

    it('should pass multiple arguments to the API function', async () => {
      bus.provide('test.add', (a, b) => a + b, 'plugin-a');
      const result = await bus.call('test.add', 3, 7);
      expect(result).toBe(10);
    });

    it('should throw on calling a non-existent namespace', async () => {
      await expect(bus.call('nope.nothere')).rejects.toThrow('Unknown API');
    });

    it('should throw on re-registering an existing namespace', () => {
      bus.provide('test.dup', () => {}, 'plugin-a');
      expect(() => bus.provide('test.dup', () => {}, 'plugin-b')).toThrow('already registered');
    });

    it('should remove all APIs for a plugin on removeAll', async () => {
      bus.provide('test.foo', () => 'foo', 'plugin-a');
      bus.removeAll('plugin-a');
      await expect(bus.call('test.foo')).rejects.toThrow('Unknown API');
    });

    it('should support async API functions', async () => {
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      bus.provide('test.async', async (x) => { await delay(5); return x * 2; }, 'plugin-a');
      const result = await bus.call('test.async', 21);
      expect(result).toBe(42);
    });

    it('should propagate errors from API functions', async () => {
      bus.provide('test.err', () => { throw new Error('oops'); }, 'plugin-a');
      await expect(bus.call('test.err')).rejects.toThrow('oops');
    });
  });
});
