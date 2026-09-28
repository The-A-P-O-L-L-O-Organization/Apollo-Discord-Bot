import { trace, context, propagation, SpanStatusCode, type Span, type Context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

let initialized = false;

export interface OtelInitOptions {
    serviceName: string;
    endpoint: string;
    headers?: Record<string, string>;
}

export function initializeOtel(options: OtelInitOptions): void {
    if (initialized) {
        return;
    }

    // Enable async context propagation
    const contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);

    const resource = resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: options.serviceName
    });

    const provider = new NodeTracerProvider({
        resource,
        spanProcessors: [
            new BatchSpanProcessor(new OTLPTraceExporter({
                url: options.endpoint,
                headers: options.headers
            }))
        ]
    });

    provider.register({
        propagator: new W3CTraceContextPropagator()
    });

    registerInstrumentations({
        instrumentations: [
            new HttpInstrumentation(),
            new ExpressInstrumentation(),
            new GrpcInstrumentation()
        ],
        tracerProvider: provider
    });

    trace.setGlobalTracerProvider(provider);
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
    const provider = trace.getTracerProvider();
    if (provider && typeof (provider as unknown as { shutdown?: () => Promise<void> }).shutdown === 'function') {
        await (provider as unknown as { shutdown: () => Promise<void> }).shutdown();
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