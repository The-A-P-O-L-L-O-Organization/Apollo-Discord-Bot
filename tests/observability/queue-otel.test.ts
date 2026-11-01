import { afterEach, describe, expect, it } from 'vitest';
import { BullMQOtel } from 'bullmq-otel';
import {
    getBullMqTelemetry,
    initializeOtel,
    shutdownOtel
} from '../../src/observability/otel.js';

describe('BullMQ OpenTelemetry integration', () => {
    afterEach(async() => {
        await shutdownOtel();
    });

    it('does not create queue telemetry without an OTLP endpoint', () => {
        initializeOtel({ serviceName: 'apollo-test' });

        expect(getBullMqTelemetry()).toBeUndefined();
    });

    it('creates shared queue telemetry when tracing is enabled', () => {
        initializeOtel({
            serviceName: 'apollo-test',
            endpoint: 'http://127.0.0.1:4318/v1/traces'
        });

        expect(getBullMqTelemetry()).toBeInstanceOf(BullMQOtel);
    });
});
