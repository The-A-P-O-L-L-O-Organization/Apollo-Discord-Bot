import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';
import { initializeOtel, shutdownOtel } from '../../../src/observability/otel.js';
import { traceLogFields } from '../../../src/utils/logger.js';

describe('traceLogFields pino mixin', () => {
    beforeAll(() => {
        initializeOtel({ serviceName: 'apollo-test', endpoint: 'http://localhost:4318/v1/traces' });
    });

    afterAll(async () => {
        await shutdownOtel();
    });

    it('returns empty fields when no span is active', () => {
        expect(traceLogFields()).toEqual({});
    });

    it('returns trace and span ids for the active span', () => {
        const tracer = trace.getTracer('test');
        const span = tracer.startSpan('log-mixin', { root: true });
        context.with(trace.setSpan(context.active(), span), () => {
            const fields = traceLogFields();
            expect(fields['trace_id']).toBe(span.spanContext().traceId);
            expect(fields['span_id']).toBe(span.spanContext().spanId);
        });
        span.end();
    });

    it('emits trace_id and span_id on serialized log lines', () => {
        const tracer = trace.getTracer('test');
        const span = tracer.startSpan('log-output', { root: true });
        const lines: string[] = [];
        const destination = { write: (chunk: string) => { lines.push(chunk); } } as pino.DestinationStream;
        const testLogger = pino({ mixin: traceLogFields, base: undefined }, destination);

        context.with(trace.setSpan(context.active(), span), () => {
            testLogger.info('correlated message');
        });
        span.end();

        expect(lines).toHaveLength(1);
        const entry = JSON.parse(lines[0]!) as { trace_id?: string; span_id?: string; msg: string };
        expect(entry.msg).toBe('correlated message');
        expect(entry.trace_id).toBe(span.spanContext().traceId);
        expect(entry.span_id).toBe(span.spanContext().spanId);
    });

    it('omits trace fields on log lines without an active span', () => {
        const lines: string[] = [];
        const destination = { write: (chunk: string) => { lines.push(chunk); } } as pino.DestinationStream;
        const testLogger = pino({ mixin: traceLogFields, base: undefined }, destination);

        testLogger.info('uncorrelated message');

        const entry = JSON.parse(lines[0]!) as { trace_id?: string; span_id?: string };
        expect(entry.trace_id).toBeUndefined();
        expect(entry.span_id).toBeUndefined();
    });
});
