import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, propagation, trace } from '@opentelemetry/api';
import {
    extractTraceContext,
    initializeOtel,
    injectTraceContext,
    shutdownOtel
} from '../../src/observability/otel.js';

describe('OpenTelemetry lifecycle', () => {
    beforeAll(() => {
        delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
        delete process.env['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'];
        process.env['OTEL_TRACES_EXPORTER'] = 'none';
        initializeOtel({ serviceName: 'apollo-test' });
        initializeOtel({ serviceName: 'apollo-test-again' });
    });

    afterAll(async() => {
        await shutdownOtel();
        delete process.env['OTEL_TRACES_EXPORTER'];
    });

    it('initializes without an OTLP endpoint and remains idempotent', () => {
        expect(trace.getTracer('apollo-test')).toBeDefined();
    });

    it('preserves W3C propagation through injection and extraction', () => {
        const carrier: Record<string, string> = {};
        const spanContext = {
            traceId: 'a'.repeat(32),
            spanId: 'b'.repeat(16),
            traceFlags: 1,
            isRemote: false
        };
        context.with(trace.setSpanContext(context.active(), spanContext), () => {
            injectTraceContext(context.active(), carrier);
        });

        const extracted = extractTraceContext(carrier);
        expect(trace.getSpanContext(extracted)?.traceId).toBe(spanContext.traceId);
        expect(propagation.getBaggage(extracted)).toBeUndefined();
    });
});
