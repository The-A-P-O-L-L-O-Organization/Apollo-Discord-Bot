// i18next v26 compatibility tests
import { describe, it, expect, beforeAll } from 'vitest'
import { I18nService } from '../../src/i18n/I18nService.js'

describe('i18next v26 compatibility', () => {
  let i18n: I18nService

  beforeAll(async () => {
    i18n = new I18nService()
    await i18n.init()
  })

  it('t() function works with v26 signature', () => {
    const result = i18n.t('ok', { lng: 'en-US' })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('t() with interpolation works', () => {
    const result = i18n.t('discord.generic', { lng: 'en-US', vars: { code: '50001', message: 'Missing Access' } })
    expect(result).toContain('50001')
    expect(result).toContain('Missing Access')
  })

  it('getFixedT() returns bound function', () => {
    const t = i18n.getFixedT('en-US', 'common')
    const result = t('ok')
    expect(typeof result).toBe('string')
  })

  it('handles pluralization', () => {
    const result1 = i18n.t('items', { lng: 'en-US', count: 1 })
    const result2 = i18n.t('items', { lng: 'en-US', count: 5 })
    expect(result1).not.toBe(result2)
  })
})