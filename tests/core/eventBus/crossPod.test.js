import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import EventBus from '../../../src/core/EventBus.js';

describe('Cross-pod EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('should emit and receive cross-pod events via redis mock', async () => {
    const redisMock = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    bus.enableCrossPod(redisMock, redisMock, 'pod-a');
    bus.on('test:event', (p) => {}, 'plugin-a');
    await bus.emit('test:event', { data: 1 });

    expect(redisMock.publish).toHaveBeenCalledWith(
      'apollo:event:test:event',
      expect.stringContaining('"data":1')
    );
  });

  it('should not publish events with no listeners', async () => {
    const redisMock = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    bus.enableCrossPod(redisMock, redisMock, 'pod-a');
    await bus.emit('test:event', { data: 1 });

    expect(redisMock.publish).not.toHaveBeenCalled();
  });

  it('should handle incoming redis messages', async () => {
    const results = [];

    const redisMock = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event, cb) => {
        if (event === 'message') {
          setTimeout(() => cb('apollo:event:test:event', JSON.stringify({
            _sourcePodId: 'pod-b',
            _event: 'test:event',
            payload: { msg: 'hello' }
          })), 10);
        }
      }),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    bus.enableCrossPod(redisMock, redisMock, 'pod-a');
    bus.on('test:event', (p) => results.push(p), 'plugin-a');

    await new Promise(r => setTimeout(r, 50));
    expect(results).toEqual([{ msg: 'hello' }]);
  });

  it('should propagate state changes across pods', async () => {
    const redisMock = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    bus.enableCrossPod(redisMock, redisMock, 'pod-a');
    bus.provideState('counter', 0, 'plugin-a');
    bus.setState('counter', 42);

    expect(redisMock.publish).toHaveBeenCalledWith(
      'apollo:state:counter',
      expect.stringContaining('42')
    );
  });

  it('should not double-fire events received from redis that match our source', () => {
    const results = [];

    const redisMock = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    bus.enableCrossPod(redisMock, redisMock, 'pod-a');
    bus.on('test:event', (p) => results.push(p), 'plugin-a');

    bus._handleCrossPodMessage('apollo:event:test:event', JSON.stringify({
      _sourcePodId: 'pod-a',
      _event: 'test:event',
      payload: { data: 1 }
    }));

    expect(results).toEqual([]);
  });

  it('should unsubscribe redis channel when last handler is removed', async () => {
    const redisMock = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    bus.enableCrossPod(redisMock, redisMock, 'pod-a');
    const unsub = bus.on('test:event', (p) => {}, 'plugin-a');
    unsub();

    expect(redisMock.subscribe).toHaveBeenCalledWith('apollo:event:test:event');
    expect(redisMock.unsubscribe).toHaveBeenCalledWith('apollo:event:test:event');
  });

  it('should clean up subscriptions on removeAll', async () => {
    const redisMock = {
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };

    bus.enableCrossPod(redisMock, redisMock, 'pod-a');
    bus.on('test:event', (p) => {}, 'plugin-a');
    bus.on('other:event', (p) => {}, 'plugin-a');
    bus.removeAll('plugin-a');

    expect(redisMock.unsubscribe).toHaveBeenCalledWith('apollo:event:test:event');
    expect(redisMock.unsubscribe).toHaveBeenCalledWith('apollo:event:other:event');
  });
});
