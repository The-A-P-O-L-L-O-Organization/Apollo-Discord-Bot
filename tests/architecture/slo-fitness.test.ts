import { describe, it, beforeEach, afterEach } from 'vitest';
import { createTestMetrics, assertSLI, type MetricsBundle } from './helpers.js';

describe('SLO fitness functions', () => {
    let bundle: MetricsBundle;

    function incQueueJob(queue: string, outcome: string): void {
        const counter = bundle.queueJobsTotal as unknown as {
            inc: (labels: Record<string, string>) => void;
        };
        counter.inc({ queue, outcome });
    }

    beforeEach(() => {
        bundle = createTestMetrics('test_arch_slo_');
    });

    afterEach(() => {
        bundle.register.clear();
    });

    it('command_latency_p99 <= 5s for 99% of commands (30-day rolling)', async () => {
        for (let i = 0; i < 99; i++) {
            bundle.recordCommandDuration('ping', 500);
        }
        bundle.recordCommandDuration('ping', 10000);
        await assertSLI(bundle, 'command_latency_p99', 0.99, '30d');
    });

    it('command_success_ratio >= 99% (30-day rolling)', async () => {
        for (let i = 0; i < 99; i++) {
            bundle.recordCommand('ping', 'success');
        }
        bundle.recordCommand('ping', 'error');
        await assertSLI(bundle, 'command_success_ratio', 0.99, '30d');
    });

    it('gateway_availability >= 99.5% (30-day rolling)', async () => {
        bundle.gatewayConnected.set(1);
        await assertSLI(bundle, 'gateway_availability', 0.995, '30d');
    });

    it('queue_job_reliability >= 99% (30-day rolling)', async () => {
        for (let i = 0; i < 99; i++) {
            incQueueJob('process-command', 'success');
        }
        incQueueJob('process-command', 'failed');
        await assertSLI(bundle, 'queue_job_reliability', 0.99, '30d');
    });

    it('error_rate < 1% (30-day rolling)', async () => {
        for (let i = 0; i < 1000; i++) {
            bundle.recordCommand('ping', 'success');
        }
        for (let i = 0; i < 5; i++) {
            bundle.recordError('command_execution', 'ping');
        }
        await assertSLI(bundle, 'error_rate', 0.01, '30d');
    });
});
