import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WorkerHost } from '../../src/core/worker/workerHost.js';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';

describe('Worker cgroup resource limits', () => {
    let host: WorkerHost;

    function isCgroupV2Available(): boolean {
        try {
            return existsSync('/sys/fs/cgroup/cgroup.controllers');
        } catch {
            return false;
        }
    }

    function canCreateCgroup(): boolean {
        try {
            const testPath = '/sys/fs/cgroup/apollo/test-permission-check';
            rmSync(testPath, { recursive: true, force: true });
            mkdirSync(testPath, { recursive: true });
            rmSync(testPath, { recursive: true, force: true });
            return true;
        } catch {
            return false;
        }
    }

    beforeAll(() => {
        if (!isCgroupV2Available()) {
            console.log('Skipping: cgroup v2 not available');
            return;
        }
        if (!canCreateCgroup()) {
            console.log('Skipping: cgroup creation not permitted (requires root or container with --cgroupns=host)');
            return;
        }
        host = new WorkerHost();
    });

    afterAll(async () => {
        if (host) {
            // Cleanup any test cgroups
            const testCgroupPath = '/sys/fs/cgroup/apollo/workers/memory-test-plugin';
            if (existsSync(testCgroupPath)) {
                try {
                    rmSync(testCgroupPath, { recursive: true, force: true });
                } catch {
                    // Ignore cleanup errors
                }
            }
        }
    });

    it('creates cgroup for worker with memory limit', async () => {
        if (!isCgroupV2Available() || !canCreateCgroup()) {
            console.log('Skipping: cgroup not available or permission denied');
            return;
        }

        const pluginId = 'memory-test-plugin';
        const workerInfo = await host.startPlugin({
            pluginId,
            dir: '/tmp/test-plugin',
            capabilities: [],
            manifest: {
                id: pluginId,
                capabilities: [],
                resourceLimits: {
                    maxOldGenerationSizeMb: 50
                }
            }
        });

        const cgroupPath = `/sys/fs/cgroup/apollo/workers/${pluginId}`;
        expect(existsSync(cgroupPath)).toBe(true);

        // Check memory.max exists
        expect(existsSync(`${cgroupPath}/memory.max`)).toBe(true);

        // Cleanup
        host.terminateWorker(pluginId);
    });

    it('cleans up cgroup on worker termination', async () => {
        if (!isCgroupV2Available() || !canCreateCgroup()) {
            console.log('Skipping: cgroup not available or permission denied');
            return;
        }

        const pluginId = 'cleanup-test-plugin';
        const workerInfo = await host.startPlugin({
            pluginId,
            dir: '/tmp/test-plugin',
            capabilities: [],
            manifest: {
                id: pluginId,
                capabilities: [],
                resourceLimits: {
                    maxOldGenerationSizeMb: 50
                }
            }
        });

        const cgroupPath = `/sys/fs/cgroup/apollo/workers/${pluginId}`;
        expect(existsSync(cgroupPath)).toBe(true);

        host.terminateWorker(pluginId);

        // Cgroup should be cleaned up
        expect(existsSync(cgroupPath)).toBe(false);
    });

    it('sets cpu.max when cpu limit provided', async () => {
        if (!isCgroupV2Available() || !canCreateCgroup()) {
            console.log('Skipping: cgroup not available or permission denied');
            return;
        }

        const pluginId = 'cpu-test-plugin';
        const workerInfo = await host.startPlugin({
            pluginId,
            dir: '/tmp/test-plugin',
            capabilities: [],
            manifest: {
                id: pluginId,
                capabilities: [],
                resourceLimits: {
                    maxOldGenerationSizeMb: 100
                }
            }
        });

        const cgroupPath = `/sys/fs/cgroup/apollo/workers/${pluginId}`;
        expect(existsSync(cgroupPath)).toBe(true);
        expect(existsSync(`${cgroupPath}/cpu.max`)).toBe(true);

        host.terminateWorker(pluginId);
    });
});