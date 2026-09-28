import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { trace, context, propagation } from '@opentelemetry/api'
import { initializeOtel, getTracer, injectTraceContext, extractTraceContext, shutdownOtel } from '../../src/observability/otel.js'

describe('OpenTelemetry tracing', () => {
  beforeAll(() => {
    initializeOtel({ serviceName: 'apollo-test', endpoint: 'http://localhost:4318/v1/traces' })
  })

  afterAll(async () => {
    await shutdownOtel()
  })

  it('initializes tracer provider', () => {
    const tracer = getTracer('test')
    expect(tracer).toBeDefined()
    expect(typeof tracer.startActiveSpan).toBe('function')
  })

  it('creates spans with attributes', () => {
    const tracer = getTracer('test')
    const span = tracer.startSpan('test-operation', { 'test.attr': 'value' })
    expect(span.spanContext().traceId).toBeDefined()
    span.end()
  })

  it('injects trace context into carrier', () => {
    const carrier: Record<string, string> = {}
    const ctx = trace.setSpan(context.active(), trace.wrapSpanContext({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }))
    injectTraceContext(ctx, carrier)
    expect(carrier['traceparent']).toBeDefined()
    expect(carrier['traceparent']).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/)
  })

  it('extracts trace context from carrier', () => {
    const carrier = { traceparent: '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01' }
    const ctx = extractTraceContext(carrier)
    const spanContext = trace.getSpanContext(ctx)
    expect(spanContext?.traceId).toBe('a'.repeat(32))
    expect(spanContext?.spanId).toBe('b'.repeat(16))
  })

  it('propagates context through async boundaries', async () => {
    const tracer = getTracer('test')
    const parentSpan = tracer.startSpan('parent')
    const ctx = trace.setSpan(context.active(), parentSpan)

    await context.with(ctx, async () => {
      const childSpan = tracer.startSpan('child')
      expect(trace.getSpanContext(context.active())?.traceId).toBe(parentSpan.spanContext().traceId)
      childSpan.end()
    })
    parentSpan.end()
  })
})