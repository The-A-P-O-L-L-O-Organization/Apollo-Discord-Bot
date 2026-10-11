import { describe, it, expect } from 'vitest';
import { Gauge, Registry } from '@prometheus-io/client';
import { CircuitBreaker, CircuitBreakerOpenError, CircuitState } from '../../src/utils/circuitBreaker.js';

const CHAOS_ENABLED = process.env['CHAOS_TESTS'] === '1';

describe.skipIf(!CHAOS_ENABLED)('chaos: circuit breaker', () => {
    it('opens after the failure threshold, fails fast, half-opens, and closes', async () => {
        const registry = new Registry();
        const stateGauge = new Gauge({
            name: 'apollo_circuit_breaker_state',
            help: 'Circuit breaker state for chaos validation',
            labelNames: ['breaker'],
            registers: [registry]
        });
        const breaker = new CircuitBreaker('chaos-nsfw', {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 150,
            rollingWindow: 60000,
            minimumRequests: 5
        });
        breaker.on('open', () => {
            stateGauge.set({ breaker: 'chaos-nsfw' }, 1);
        });
        breaker.on('half_open', () => {
            stateGauge.set({ breaker: 'chaos-nsfw' }, 0.5);
        });
        breaker.on('close', () => {
            stateGauge.set({ breaker: 'chaos-nsfw' }, 0);
        });

        let endpointHits = 0;
        const failingCall = async (): Promise<string> => {
            endpointHits += 1;
            throw new Error('NSFW service responded 503');
        };

        for (let attempt = 0; attempt < 4; attempt += 1) {
            await expect(breaker.execute(failingCall)).rejects.toThrow('NSFW service responded 503');
            expect(breaker.getStatus().state).toBe(CircuitState.CLOSED);
        }

        await expect(breaker.execute(failingCall)).rejects.toThrow('NSFW service responded 503');
        expect(breaker.getStatus().state).toBe(CircuitState.OPEN);
        expect(endpointHits).toBe(5);

        await expect(breaker.execute(failingCall)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
        expect(endpointHits).toBe(5);

        const openExposition = await registry.getSingleMetricAsString('apollo_circuit_breaker_state');
        expect(openExposition).toContain('apollo_circuit_breaker_state{breaker="chaos-nsfw"} 1');

        await new Promise((resolve) => {
            setTimeout(resolve, 250);
        });

        let probeHits = 0;
        const recoveringCall = async (): Promise<string> => {
            probeHits += 1;
            return 'ok';
        };
        await expect(breaker.execute(recoveringCall)).resolves.toBe('ok');
        expect(breaker.getStatus().state).toBe(CircuitState.HALF_OPEN);
        await expect(breaker.execute(recoveringCall)).resolves.toBe('ok');
        expect(breaker.getStatus().state).toBe(CircuitState.CLOSED);
        expect(probeHits).toBe(2);

        const closedExposition = await registry.getSingleMetricAsString('apollo_circuit_breaker_state');
        expect(closedExposition).toContain('apollo_circuit_breaker_state{breaker="chaos-nsfw"} 0');
    });
});
