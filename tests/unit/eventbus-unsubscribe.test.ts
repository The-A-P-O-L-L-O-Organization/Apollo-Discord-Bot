import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventBusImpl } from '../../src/core/EventBus.js'

describe('EventBus.unsubscribe', () => {
  let bus: EventBusImpl
  const handler = vi.fn()

  beforeEach(() => {
    bus = new EventBusImpl()
    vi.useFakeTimers()
  })

  it('returns subscription with unique id', async () => {
    const sub = await bus.subscribe('test.event', handler)
    expect(sub).toHaveProperty('id')
    expect(typeof sub.id).toBe('string')
    expect(sub.id.length).toBeGreaterThan(0)
  })

  it('removes specific handler when unsubscribed', async () => {
    const sub = await bus.subscribe('test.event', handler)
    await bus.publish('test.event', { data: 'test' })
    expect(handler).toHaveBeenCalledTimes(1)

    await bus.unsubscribe(sub)
    await bus.publish('test.event', { data: 'test2' })
    expect(handler).toHaveBeenCalledTimes(1) // Not called again
  })

  it('does not affect other handlers for same event', async () => {
    const handler2 = vi.fn()
    const sub1 = await bus.subscribe('test.event', handler)
    const sub2 = await bus.subscribe('test.event', handler2)

    await bus.unsubscribe(sub1)
    await bus.publish('test.event', { data: 'test' })

    expect(handler).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  it('handles unsubscribe of non-existent subscription gracefully', async () => {
    const fakeSub = { id: 'non-existent', event: 'test', filter: undefined, priority: 0, once: false, createdAt: Date.now() }
    await expect(bus.unsubscribe(fakeSub)).resolves.not.toThrow()
  })
})