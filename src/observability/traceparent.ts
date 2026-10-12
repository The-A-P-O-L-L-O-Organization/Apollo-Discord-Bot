import { context, trace, type SpanContext } from '@opentelemetry/api';

export const ZERO_TRACE_ID = '0'.repeat(32);
export const ZERO_SPAN_ID = '0'.repeat(16);

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/u;

export function currentTraceparent(): string | undefined {
    const spanContext = trace.getActiveSpan()?.spanContext();
    if (!spanContext || spanContext.traceId === ZERO_TRACE_ID || spanContext.spanId === ZERO_SPAN_ID) {
        return undefined;
    }
    const flags = (spanContext.traceFlags & 1) === 1 ? '01' : '00';
    return `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
}

export function parseTraceparent(value: unknown): SpanContext | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const match = TRACEPARENT_PATTERN.exec(value);
    if (!match) {
        return undefined;
    }

    const traceId = match[1];
    const spanId = match[2];
    const flags = match[3];
    if (traceId === undefined || spanId === undefined || flags === undefined) {
        return undefined;
    }

    if (traceId === ZERO_TRACE_ID || spanId === ZERO_SPAN_ID) {
        return undefined;
    }

    return {
        traceId,
        spanId,
        traceFlags: parseInt(flags, 16),
        isRemote: true
    };
}

export function runWithExtractedTrace<T>(traceparent: unknown, fn: () => Promise<T>): Promise<T> {
    const spanContext = parseTraceparent(traceparent);
    if (!spanContext) {
        return fn();
    }

    const span = trace.wrapSpanContext(spanContext);
    return context.with(trace.setSpan(context.active(), span), fn);
}
