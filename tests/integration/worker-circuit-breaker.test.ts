import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { WorkerHost } from '../../src/core/worker/workerHost.js';

describe('Worker Circuit Breaker', () => {
    let host: WorkerHost;
    let now: number;
    let logCalls: string[];

    beforeAll(() => {
        now = 1000000; // Fixed starting time
        logCalls = [];
        host = new WorkerHost({
            now: () => now,
            log: (msg) => logCalls.push(msg),
            fork: () => {
                // Return a mock child process that we can control
                const mockChild = {
                    on: (_event: string, _handler: (...args: unknown[]) => void) => {},
                    send: vi.fn(),
                    kill: vi.fn(),
                };
                return mockChild as unknown as ReturnType<typeof import('node:child_process').fork>;
            },
        });
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        logCalls = [];
        // Reset host state by creating new instance
        host = new WorkerHost({
            now: () => now,
            log: (msg) => logCalls.push(msg),
            fork: () => {
                const mockChild = {
                    on: (_event: string, _handler: (...args: unknown[]) => void) => {},
                    send: vi.fn(),
                    kill: vi.fn(),
                };
                return mockChild as unknown as ReturnType<typeof import('node:child_process').fork>;
            },
        });
    });

    function createWorker(pluginId: string, manifest?: { capabilities?: string[] }): Promise<{ child: { on: Function; send: Function; kill: Function } }> {
        return host.startPlugin({
            pluginId,
            dir: '/tmp/test-plugin',
            capabilities: manifest?.capabilities ?? [],
            manifest: {
                id: pluginId,
                capabilities: manifest?.capabilities ?? [],
            },
        });
    }

    function recordCrash(pluginId: string): void {
        // Simulate child process exit
        host.recordCrash(pluginId, 1, null);
    }

    function recordSuccess(pluginId: string): void {
        host.markHealthy(pluginId);
    }

    function advanceTime(ms: number): void {
        now += ms;
    }

    it('circuit opens after 5 consecutive crashes', async () => {
        const pluginId = 'crash-test-plugin';

        await createWorker(pluginId);

        // Crash 5 times
        for (let i = 1; i <= 5; i++) {
            recordCrash(pluginId);
            expect(host.getConsecutiveCrashes(pluginId)).toBe(i);
        }

        // Circuit should be open (plugin disabled)
        expect(host.isDisabled(pluginId)).toBe(true);
        expect(logCalls.some(l => l.includes('disabled after 5 consecutive crashes'))).toBe(true);
    });

    it('further spawn attempts fail fast when circuit is open', async () => {
        const pluginId = 'open-circuit-test';

        await createWorker(pluginId);

        // Crash 5 times to open circuit
        for (let i = 0; i < 5; i++) {
            recordCrash(pluginId);
        }

        // Now circuit is open - try to spawn again
        // Should fail fast by throwing an error
        await expect(createWorker(pluginId)).rejects.toThrow('Circuit breaker open');

        // Verify the circuit is still open
        expect(host.isDisabled(pluginId)).toBe(true);
    });

    it('circuit half-opens after 1 minute cooldown', async () => {
        const pluginId = 'cooldown-test';

        await createWorker(pluginId);

        // Crash 5 times to open circuit
        for (let i = 0; i < 5; i++) {
            recordCrash(pluginId);
        }

        expect(host.isDisabled(pluginId)).toBe(true);

        // Advance time by 1 minute (60 seconds) - cooldown period
        advanceTime(60 * 1000);

        // After cooldown, plugin should no longer be disabled (half-open state)
        // The next spawn attempt should be allowed
        expect(host.isDisabled(pluginId)).toBe(false);
    });

    it('circuit closes after 10 minutes healthy window', async () => {
        const pluginId = 'healthy-window-test';

        await createWorker(pluginId);

        // Crash 5 times to open circuit
        for (let i = 0; i < 5; i++) {
            recordCrash(pluginId);
        }

        expect(host.isDisabled(pluginId)).toBe(true);

        // Advance time by 1 minute to half-open
        advanceTime(60 * 1000);

        // Simulate a successful restart (half-open state)
        const newWorker = await createWorker(pluginId);
        expect(newWorker).toBeDefined();

        // Record success
        recordSuccess(pluginId);

        // Crashes should be reset to 0
        expect(host.getConsecutiveCrashes(pluginId)).toBe(0);

        // Advance time by 10 minutes (healthy window)
        advanceTime(10 * 60 * 1000);

        // Circuit should be fully closed - plugin can crash again up to 5 times
        // Simulate a crash
        recordCrash(pluginId);
        expect(host.getConsecutiveCrashes(pluginId)).toBe(1);
        expect(host.isDisabled(pluginId)).toBe(false);
    });

    it('tracks crash count and resets after healthy period', async () => {
        const pluginId = 'reset-test';

        await createWorker(pluginId);

        // Crash 3 times
        recordCrash(pluginId);
        recordCrash(pluginId);
        recordCrash(pluginId);
        expect(host.getConsecutiveCrashes(pluginId)).toBe(3);

        // Advance time by 10 minutes + 1 second (healthy window elapsed)
        advanceTime(10 * 60 * 1000 + 1000);

        // Record success - should reset crash count
        recordSuccess(pluginId);

        expect(host.getConsecutiveCrashes(pluginId)).toBe(0);
        expect(host.isDisabled(pluginId)).toBe(false);
    });

    it('does not reset crash count before healthy window elapses', async () => {
        const pluginId = 'no-reset-test';

        await createWorker(pluginId);

        // Crash 3 times
        recordCrash(pluginId);
        recordCrash(pluginId);
        recordCrash(pluginId);
        expect(host.getConsecutiveCrashes(pluginId)).toBe(3);

        // Advance time by 5 minutes (less than healthy window)
        advanceTime(5 * 60 * 1000);

        // Record success - should NOT reset crash count
        recordSuccess(pluginId);

        expect(host.getConsecutiveCrashes(pluginId)).toBe(3);
    });
});