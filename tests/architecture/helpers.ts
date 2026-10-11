import { expect } from 'vitest';
import { createMetrics } from '../../src/utils/metrics.js';
import type { Registry } from '@prometheus-io/client';

export type MetricsBundle = ReturnType<typeof createMetrics> & { prefix: string };

export interface SnapshotValue {
    value: unknown;
    labels?: Record<string, unknown>;
    metricName?: unknown;
}

export interface SnapshotEntry {
    name: unknown;
    type?: unknown;
    values?: SnapshotValue[];
}

export type SliName =
    | 'command_latency_p99'
    | 'command_success_ratio'
    | 'gateway_availability'
    | 'queue_job_reliability'
    | 'error_rate';

export type SliComparison = 'gte' | 'lte';

export function createTestMetrics(prefix = 'test_arch_'): MetricsBundle {
    return { ...createMetrics({ prefix }), prefix };
}

export async function getMetrics(register: Registry): Promise<SnapshotEntry[]> {
    const raw = await register.getMetricsAsJSON();
    return raw as unknown as SnapshotEntry[];
}

function matchesLabels(value: SnapshotValue, match: Record<string, string>): boolean {
    const labels = value.labels ?? {};
    return Object.entries(match).every(([key, expected]) => String(labels[key]) === expected);
}

export function sumCounterValues(entries: SnapshotEntry[], metricName: string, match: Record<string, string> = {}): number {
    let total = 0;
    for (const entry of entries) {
        if (entry.name !== metricName || !Array.isArray(entry.values)) {
            continue;
        }
        for (const value of entry.values) {
            if (typeof value.value === 'number' && matchesLabels(value, match)) {
                total += value.value;
            }
        }
    }
    return total;
}

export function getHistogramBucketRatio(entries: SnapshotEntry[], baseName: string, le: number, match: Record<string, string> = {}): number {
    let bucket = 0;
    let total = 0;
    for (const entry of entries) {
        if (entry.name !== baseName || !Array.isArray(entry.values)) {
            continue;
        }
        for (const value of entry.values) {
            if (value.metricName !== `${baseName}_bucket` || typeof value.value !== 'number') {
                continue;
            }
            if (!matchesLabels(value, match)) {
                continue;
            }
            const leLabel = value.labels?.['le'];
            const leNumber =
                typeof leLabel === 'number'
                    ? leLabel
                    : leLabel === '+Inf' || leLabel === 'Inf'
                      ? Number.POSITIVE_INFINITY
                      : Number(leLabel);
            if (leNumber === Number.POSITIVE_INFINITY) {
                total += value.value;
            } else if (leNumber === le) {
                bucket += value.value;
            }
        }
    }
    if (total === 0) {
        return 0;
    }
    return bucket / total;
}

export function getGaugeValue(entries: SnapshotEntry[], metricName: string, match: Record<string, string> = {}): number {
    for (const entry of entries) {
        if (entry.name !== metricName || !Array.isArray(entry.values)) {
            continue;
        }
        for (const value of entry.values) {
            if (typeof value.value === 'number' && matchesLabels(value, match)) {
                return value.value;
            }
        }
    }
    return 0;
}

export async function getSLIValue(bundle: MetricsBundle, sliName: SliName): Promise<number> {
    const entries = await getMetrics(bundle.register);
    const prefix = bundle.prefix;
    switch (sliName) {
        case 'command_latency_p99':
            return getHistogramBucketRatio(entries, `${prefix}command_duration_seconds`, 5);
        case 'command_success_ratio': {
            const succeeded = sumCounterValues(entries, `${prefix}commands_total`, { status: 'success' });
            const failed = sumCounterValues(entries, `${prefix}commands_total`, { status: 'error' });
            if (succeeded + failed === 0) {
                return 1;
            }
            return succeeded / (succeeded + failed);
        }
        case 'gateway_availability':
            return getGaugeValue(entries, `${prefix}gateway_connected`);
        case 'queue_job_reliability': {
            const succeeded = sumCounterValues(entries, `${prefix}queue_jobs_total`, { outcome: 'success' });
            const failed = sumCounterValues(entries, `${prefix}queue_jobs_total`, { outcome: 'failed' });
            if (succeeded + failed === 0) {
                return 1;
            }
            return succeeded / (succeeded + failed);
        }
        case 'error_rate': {
            const errors = sumCounterValues(entries, `${prefix}errors_total`);
            const commands = sumCounterValues(entries, `${prefix}commands_total`);
            if (commands === 0) {
                return 0;
            }
            return errors / commands;
        }
    }
}

export async function assertSLI(
    bundle: MetricsBundle,
    sliName: SliName,
    target: number,
    window = '30d',
    comparison: SliComparison = sliName === 'error_rate' ? 'lte' : 'gte'
): Promise<number> {
    const value = await getSLIValue(bundle, sliName);
    if (comparison === 'lte') {
        expect(value).toBeLessThan(target);
    } else {
        expect(value).toBeGreaterThanOrEqual(target);
    }
    void window;
    return value;
}
