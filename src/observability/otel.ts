import { trace, context, propagation, SpanStatusCode, type Span, type Context } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { NoopSpanProcessor } from '@opentelemetry/sdk-trace';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { BullMQOtel } from 'bullmq-otel';

let initialized = false;
let sdk: NodeSDK | null = null;
let bullMqTelemetry: BullMQOtel | null = null;

export interface OtelInitOptions {
    serviceName: string;
    endpoint?: string;
    headers?: Record<string, string>;
}

export function initializeOtel(options: OtelInitOptions): void {
    if (initialized) {
        return;
    }

    const contextManager = new AsyncLocalStorageContextManager();
    const resource = defaultResource().merge(resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: options.serviceName
    }));

    const exportEnabled = Boolean(options.endpoint) && process.env['NODE_ENV'] !== 'test';
    const previousExporterSetting = process.env['OTEL_TRACES_EXPORTER'];
    if (!exportEnabled) {
        process.env['OTEL_TRACES_EXPORTER'] = 'none';
    }
    try {
        sdk = new NodeSDK({
            resource,
            contextManager,
            textMapPropagator: new W3CTraceContextPropagator(),
            instrumentations: [
                new HttpInstrumentation(),
                new PgInstrumentation(),
                new IORedisInstrumentation()
            ],
            spanProcessors: exportEnabled ? undefined : [new NoopSpanProcessor()],
            ...(exportEnabled && options.endpoint
                ? {
                    traceExporter: new OTLPTraceExporter({
                    url: options.endpoint,
                    headers: options.headers
                    })
                }
                : {})
        });
        sdk.start();
    } finally {
        if (previousExporterSetting === undefined) {
            delete process.env['OTEL_TRACES_EXPORTER'];
        } else {
            process.env['OTEL_TRACES_EXPORTER'] = previousExporterSetting;
        }
    }
    if (options.endpoint) {
        bullMqTelemetry = new BullMQOtel({
            tracerName: 'apollo-bullmq',
            meterName: 'apollo-bullmq',
            enableMetrics: false
        });
    }
    initialized = true;
}

export function getBullMqTelemetry(): BullMQOtel | undefined {
    return bullMqTelemetry ?? undefined;
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
    bullMqTelemetry = null;
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