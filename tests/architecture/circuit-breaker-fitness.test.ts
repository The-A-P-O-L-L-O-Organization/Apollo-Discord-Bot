import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Gauge, Registry } from '@prometheus-io/client';
import {
    CircuitBreakerRegistry,
    CircuitBreakerOpenError,
    CircuitState,
    type CircuitBreaker
} from '../../src/utils/circuitBreaker.js';

function stateToGauge(state: string): number {
    if (state === CircuitState.OPEN) {
        return 2;
    }
    if (state === CircuitState.HALF_OPEN) {
        return 1;
    }
    return 0;
}

async function failFiveTimes(breaker: CircuitBreaker): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await expect(
            breaker.execute(async () => {
                throw new Error('downstream fail');
            })
        ).rejects.toThrow('downstream fail');
    }
}

describe('Circuit breaker fitness functions', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('circuit opens after 5 consecutive failures and fails fast', async () => {
        const registry = new CircuitBreakerRegistry();
        const breaker = registry.get('arch-fitness-open', {
            failureThreshold: 5,
            minimumRequests: 5,
            successThreshold: 1,
            timeout: 30000,
            rollingWindow: 60000
        });

        await failFiveTimes(breaker);
        expect(breaker.state).toBe(CircuitState.OPEN);

        let executed = false;
        await expect(
            breaker.execute(async () => {
                executed = true;
                return 'ok';
            })
        ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
        expect(executed).toBe(false);
    });

    it('half-open probe is allowed after timeout and success closes the circuit', async () => {
        const registry = new CircuitBreakerRegistry();
        const breaker = registry.get('arch-fitness-half-open', {
            failureThreshold: 5,
            minimumRequests: 5,
            successThreshold: 1,
            timeout: 30000,
            rollingWindow: 60000
        });

        await failFiveTimes(breaker);
        expect(breaker.state).toBe(CircuitState.OPEN);

        await vi.advanceTimersByTimeAsync(30001);
        const result = await breaker.execute(async () => 'recovered');
        expect(result).toBe('recovered');
        expect(breaker.state).toBe(CircuitState.CLOSED);
    });

    it('circuit breaker state is exposed as a gauge (test-local equivalent of apollo_circuit_breaker_state)', async () => {
        const register = new Registry();
        const stateGauge = new Gauge({
            name: 'test_arch_circuit_breaker_state',
            help: 'Circuit breaker state as a number (0=closed, 1=half_open, 2=open)',
            labelNames: ['service'],
            registers: [register]
        });

        const registry = new CircuitBreakerRegistry();
        const breaker = registry.get('arch-fitness-gauge', {
            failureThreshold: 5,
            minimumRequests: 5,
            successThreshold: 1,
            timeout: 30000,
            rollingWindow: 60000
        });
        stateGauge.set({ service: 'arch-fitness-gauge' }, stateToGauge(breaker.state));

        await failFiveTimes(breaker);
        stateGauge.set({ service: 'arch-fitness-gauge' }, stateToGauge(breaker.state));

        const snapshots = (await register.getMetricsAsJSON()) as unknown as {
            name: string;
            values: { value: number; labels: Record<string, string> }[];
        }[];
        const entry = snapshots.find((metric) => metric.name === 'test_arch_circuit_breaker_state');
        const gaugeValue = entry?.values.find((value) => value.labels['service'] === 'arch-fitness-gauge');
        expect(gaugeValue?.value).toBe(2);
    });
});
