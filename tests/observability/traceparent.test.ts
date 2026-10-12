import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { trace, context } from '@opentelemetry/api';
import { currentTraceparent, parseTraceparent, runWithExtractedTrace, ZERO_TRACE_ID, ZERO_SPAN_ID } from '../../src/observability/traceparent.js';
import { initializeOtel, shutdownOtel } from '../../src/observability/otel.js';

describe('parseTraceparent', () => {
    it('parses a valid W3C traceparent into a remote SpanContext', () => {
        const traceId = 'a'.repeat(32);
        const spanId = 'b'.repeat(16);
        const parsed = parseTraceparent(`00-${traceId}-${spanId}-01`);

        expect(parsed).toBeDefined();
        expect(parsed?.traceId).toBe(traceId);
        expect(parsed?.spanId).toBe(spanId);
        expect(parsed?.traceFlags).toBe(1);
        expect(parsed?.isRemote).toBe(true);
    });

    it('maps sampled flag 00 to unsampled trace flags', () => {
        const parsed = parseTraceparent(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-00`);
        expect(parsed?.traceFlags).toBe(0);
    });

    it('rejects non-string values', () => {
        expect(parseTraceparent(undefined)).toBeUndefined();
        expect(parseTraceparent(null)).toBeUndefined();
        expect(parseTraceparent(42)).toBeUndefined();
        expect(parseTraceparent({})).toBeUndefined();
    });

    it('rejects malformed strings', () => {
        expect(parseTraceparent('')).toBeUndefined();
        expect(parseTraceparent('not-a-traceparent')).toBeUndefined();
        expect(parseTraceparent('00-abc-def-01')).toBeUndefined();
        expect(parseTraceparent(`01-${'a'.repeat(32)}-${'b'.repeat(16)}-01`)).toBeUndefined();
        expect(parseTraceparent(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-zz`)).toBeUndefined();
        expect(parseTraceparent(`00-${'A'.repeat(32)}-${'b'.repeat(16)}-01`)).toBeUndefined();
    });

    it('rejects all-zero trace or span ids', () => {
        expect(parseTraceparent(`00-${ZERO_TRACE_ID}-${'b'.repeat(16)}-01`)).toBeUndefined();
        expect(parseTraceparent(`00-${'a'.repeat(32)}-${ZERO_SPAN_ID}-01`)).toBeUndefined();
    });
});

describe('runWithExtractedTrace', () => {
    beforeAll(() => {
        initializeOtel({ serviceName: 'apollo-test', endpoint: 'http://localhost:4318/v1/traces' });
    });

    afterAll(async () => {
        await shutdownOtel();
    });

    it('executes the callback unchanged when traceparent is invalid', async () => {
        const result = await runWithExtractedTrace('garbage', async () => 'value');
        expect(result).toBe('value');
        expect(trace.getActiveSpan()).toBeUndefined();
    });

    it('executes the callback unchanged when no trace context exists', async () => {
        const result = await runWithExtractedTrace(undefined, async () => 7);
        expect(result).toBe(7);
    });

    it('activates the remote parent span inside the callback', async () => {
        const traceId = 'c'.repeat(32);
        const spanId = 'd'.repeat(16);

        await runWithExtractedTrace(`00-${traceId}-${spanId}-01`, async () => {
            const spanContext = trace.getActiveSpan()?.spanContext();
            expect(spanContext?.traceId).toBe(traceId);
            expect(spanContext?.spanId).toBe(spanId);
            expect(trace.getSpanContext(context.active())?.isRemote).toBe(true);
        });

        expect(trace.getActiveSpan()).toBeUndefined();
    });

    it('propagates the extracted context across await boundaries', async () => {
        const traceId = 'e'.repeat(32);

        await runWithExtractedTrace(`00-${traceId}-${'f'.repeat(16)}-01`, async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            expect(trace.getActiveSpan()?.spanContext().traceId).toBe(traceId);
        });
    });
});

describe('currentTraceparent', () => {
    it('returns undefined when no span is active', () => {
        expect(currentTraceparent()).toBeUndefined();
    });

    it('formats an active span as a W3C traceparent header', () => {
        const tracer = trace.getTracer('test');
        const span = tracer.startSpan('test-operation', { root: true });
        return context.with(trace.setSpan(context.active(), span), () => {
            const traceparent = currentTraceparent();
            expect(traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[0-9a-f]{2}$/);
            expect(traceparent).toBe(`00-${span.spanContext().traceId}-${span.spanContext().spanId}-01`);
            span.end();
        });
    });

    it('round-trips through parseTraceparent', () => {
        const tracer = trace.getTracer('test');
        const span = tracer.startSpan('roundtrip', { root: true });
        return context.with(trace.setSpan(context.active(), span), () => {
            const parsed = parseTraceparent(currentTraceparent());
            expect(parsed?.traceId).toBe(span.spanContext().traceId);
            expect(parsed?.spanId).toBe(span.spanContext().spanId);
            span.end();
        });
    });
});
