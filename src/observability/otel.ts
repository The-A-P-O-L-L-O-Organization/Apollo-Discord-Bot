import { trace, context, propagation, SpanStatusCode, type Span, type Context } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

let initialized = false;
let sdk: NodeSDK | null = null;

export interface OtelInitOptions {
    serviceName: string;
    endpoint?: string;
    headers?: Record<string, string>;
}

export function initializeOtel(options: OtelInitOptions): void {
    if (initialized) {
        return;
    }

    const contextManager = new AsyncHooksContextManager();
    const resource = resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: options.serviceName
    });

    sdk = new NodeSDK({
        resource,
        contextManager,
        textMapPropagator: new W3CTraceContextPropagator(),
        instrumentations: [new HttpInstrumentation()],
        ...(options.endpoint ? {
            traceExporter: new OTLPTraceExporter({
                url: options.endpoint,
                headers: options.headers
            })
        } : {})
    });
    sdk.start();
    initialized = true;
}

export function getTracer(name: string) {
    return trace.getTracer(name);
}

export function injectTraceContext(ctx: Context, carrier: Record<string, string>): void {
    propagation.inject(ctx, carrier);
}

export function extractTraceContext(carrier: Record<string, string>): Context {
    return propagation.extract(context.active(), carrier);
}

export async function shutdownOtel(): Promise<void> {
    if (sdk) {
        await sdk.shutdown();
        sdk = null;
    }
    initialized = false;
}

export function createSpan(name: string, attributes?: Record<string, string | number | boolean>) {
    const tracer = getTracer('interlink');
    return tracer.startSpan(name, { attributes });
}

export function endSpan(span: Span, error?: Error): void {
    if (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
    span.end();
}