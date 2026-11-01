import { beforeEach, describe, expect, it, vi } from 'vitest';

const otelMocks = vi.hoisted(() => ({
    sdkInstances: [] as Array<{ options: Record<string, unknown>; start: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> }>,
    exporterInstances: [] as unknown[],
    instrumentationInstances: [] as Array<{ disable: ReturnType<typeof vi.fn> }>
}));

vi.mock('@opentelemetry/sdk-node', () => ({
    NodeSDK: class {
        public readonly options: Record<string, unknown>;
        public readonly start = vi.fn();
        public readonly shutdown = vi.fn(async() => undefined);

        public constructor(options: Record<string, unknown>) {
            this.options = options;
            otelMocks.sdkInstances.push(this);
        }
    }
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
    OTLPTraceExporter: class {
        public constructor(options: Record<string, unknown>) {
            otelMocks.exporterInstances.push(options);
        }
    }
}));

vi.mock('@opentelemetry/instrumentation-http', () => ({
    HttpInstrumentation: class {
        public readonly disable = vi.fn();

        public constructor() {
            otelMocks.instrumentationInstances.push(this);
        }
    }
}));

vi.mock('@opentelemetry/instrumentation-pg', () => ({
    PgInstrumentation: class {
        public readonly disable = vi.fn();

        public constructor() {
            otelMocks.instrumentationInstances.push(this);
        }
    }
}));

vi.mock('@opentelemetry/instrumentation-ioredis', () => ({
    IORedisInstrumentation: class {
        public readonly disable = vi.fn();

        public constructor() {
            otelMocks.instrumentationInstances.push(this);
        }
    }
}));

import { getTracer, initializeOtel, shutdownOtel } from '../../src/observability/otel.js';

describe('OpenTelemetry lifecycle', () => {
    beforeEach(async() => {
        await shutdownOtel();
        otelMocks.sdkInstances.length = 0;
        otelMocks.exporterInstances.length = 0;
        otelMocks.instrumentationInstances.length = 0;
    });

    it('initializes only once and can initialize again after shutdown', async() => {
        initializeOtel({ serviceName: 'apollo-test' });
        initializeOtel({ serviceName: 'ignored-service' });

        expect(otelMocks.sdkInstances).toHaveLength(1);
        expect(getTracer('test')).toBeDefined();

        await shutdownOtel();
        await shutdownOtel();

        initializeOtel({ serviceName: 'apollo-test-restarted' });
        expect(otelMocks.sdkInstances).toHaveLength(2);
    });

    it('does not construct an OTLP exporter without an endpoint', () => {
        initializeOtel({ serviceName: 'apollo-test' });

        expect(otelMocks.exporterInstances).toHaveLength(0);
        expect(otelMocks.sdkInstances[0]?.options['traceExporter']).toBeUndefined();
        expect(otelMocks.sdkInstances[0]?.options['logRecordProcessors']).toEqual([]);
    });

    it('configures the service resource and registers HTTP instrumentation once', () => {
        initializeOtel({ serviceName: 'apollo-test' });

        const sdkOptions = otelMocks.sdkInstances[0]?.options;
        const resource = sdkOptions?.['resource'] as { attributes?: Record<string, unknown> } | undefined;
        const instrumentations = sdkOptions?.['instrumentations'] as unknown[] | undefined;

        expect(resource?.attributes?.['service.name']).toBe('apollo-test');
        expect(instrumentations).toHaveLength(3);
        expect(otelMocks.instrumentationInstances).toHaveLength(3);
    });

    it('disables registered instrumentations during shutdown', async() => {
        initializeOtel({ serviceName: 'apollo-test' });

        const instrumentations = [...otelMocks.instrumentationInstances];
        await shutdownOtel();

        expect(instrumentations.every((instrumentation) => instrumentation.disable.mock.calls.length === 1)).toBe(true);
    });
});
