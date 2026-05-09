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
});
