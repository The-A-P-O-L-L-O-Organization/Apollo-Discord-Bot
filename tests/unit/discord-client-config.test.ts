import { describe, it, expect } from 'vitest'
import { createBotClient } from '../../src/index.js'

describe('Discord client configuration', () => {
  it('sets message cache lifetime to 0 via sweepers', () => {
    const client = createBotClient()
    const sweepers = client.options.sweepers
    const messageSweeper = sweepers?.messages
    expect(sweepers).toBeDefined()
    expect(messageSweeper).toBeDefined()
    if ('lifetime' in messageSweeper!) {
      expect(messageSweeper.lifetime).toBe(0)
    }
    client.destroy()
  })

  it('sets message sweep interval to 60 via sweepers', () => {
    const client = createBotClient()
    const sweepers = client.options.sweepers
    const messageSweeper = sweepers?.messages
    expect(messageSweeper).toBeDefined()
    expect(messageSweeper?.interval).toBe(60)
    client.destroy()
  })

  it('does not use default unlimited cache (lifetime should not be undefined)', () => {
    const client = createBotClient()
    const sweepers = client.options.sweepers
    const messageSweeper = sweepers?.messages
    expect(messageSweeper).toBeDefined()
    if ('lifetime' in messageSweeper!) {
      expect(messageSweeper.lifetime).not.toBeUndefined()
    }
    client.destroy()
  })
})