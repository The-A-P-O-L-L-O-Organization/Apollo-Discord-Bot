import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { validateRequest, validateResponse } from '../../src/plugins/interlink/validation.js'

const TestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  count: z.number().int().positive()
})

describe('Interlink Zod validation', () => {
  it('validates correct request payload', () => {
    const payload = { id: '550e8400-e29b-41d4-a716-446655440000', name: 'test', count: 5 }
    const result = validateRequest(TestSchema, payload)
    expect(result).toEqual(payload)
  })

  it('rejects invalid request payload (missing required field)', () => {
    const payload = { name: 'test', count: 5 } // missing id
    expect(() => validateRequest(TestSchema, payload)).toThrow()
  })

  it('rejects invalid request payload (wrong type)', () => {
    const payload = { id: 'not-uuid', name: 'test', count: 'five' }
    expect(() => validateRequest(TestSchema, payload)).toThrow()
  })

  it('validates correct response payload', () => {
    const payload = { success: true, data: { id: '550e8400-e29b-41d4-a716-446655440000', value: 42 } }
    const ResponseSchema = z.object({ success: z.boolean(), data: z.object({ id: z.string().uuid(), value: z.number() }) })
    const result = validateResponse(ResponseSchema, payload)
    expect(result).toEqual(payload)
  })

  it('rejects malformed response', () => {
    const payload = { success: 'yes', data: null }
    const ResponseSchema = z.object({ success: z.boolean(), data: z.object({ id: z.string(), value: z.number() }) })
    expect(() => validateResponse(ResponseSchema, payload)).toThrow()
  })

  it('includes path in error message for debugging', () => {
    const payload = { items: [{ id: 123 }] }
    const Schema = z.object({ items: z.array(z.object({ id: z.string() })) })
    try {
      validateRequest(Schema, payload)
    } catch (e) {
      expect(e.message).toContain('items.0.id')
    }
  })
})