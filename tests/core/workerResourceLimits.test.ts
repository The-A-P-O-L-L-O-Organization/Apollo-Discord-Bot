import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { WorkerHostOptions } from '../../src/core/worker/workerHost.js';
import { WorkerHost } from '../../src/core/worker/workerHost.js';
import { signCapabilities } from '../../src/core/worker/capabilitySignature.js';
import { runChild } from '../../src/core/worker/workerChild.js';
import type { RPCMessage } from '../../src/core/worker/rpc.js';
import type * as CgroupManager from '../../src/core/worker/cgroupManager.js';
import { setupCgroup, attachToCgroup, cleanupCgroup } from '../../src/core/worker/cgroupManager.js';

vi.mock('../../src/core/worker/cgroupManager.js', async (importOriginal) => {
    const actual = await importOriginal<typeof CgroupManager>();
    return {
        ...actual,
        setupCgroup: vi.fn(async () => null),
        attachToCgroup: vi.fn(async () => true),
        cleanupCgroup: vi.fn(async () => undefined)
    };
});

const mockedSetupCgroup = vi.mocked(setupCgroup);
const mockedAttachToCgroup = vi.mocked(attachToCgroup);
const mockedCleanupCgroup = vi.mocked(cleanupCgroup);

function createForkMock(pid: number | undefined = 1234): ReturnType<typeof vi.fn> {
    return vi.fn().mockReturnValue({
        pid,
        send: vi.fn(),
        on: vi.fn(),
        kill: vi.fn()
    });
}

function createHost(fork: ReturnType<typeof vi.fn>): WorkerHost {
    return new WorkerHost({
        fork: fork as unknown as WorkerHostOptions['fork'],
        log: () => undefined,
        now: () => 1000,
        backoff: (attempt) => Math.min(1000 * 2 ** attempt, 60000)
    });
}

describe('worker resource limits', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedSetupCgroup.mockResolvedValue(null);
        mockedAttachToCgroup.mockResolvedValue(true);
        mockedCleanupCgroup.mockResolvedValue(undefined);
    });

    it('applies V8 heap limit via execArgv', async () => {
        const cgroupPath = '/sys/fs/cgroup/apollo/workers/resource-test';
        mockedSetupCgroup.mockResolvedValue(cgroupPath);
        const fork = createForkMock(1234);
        const host = createHost(fork);

        const workerInfo = await host.startPlugin({
            pluginId: 'resource-test',
            dir: '/data/plugins/resource-test',
            capabilities: ['api:sendMessage'],
            manifest: {
                id: 'resource-test',
                capabilities: ['api:sendMessage'],
                resourceLimits: { memoryMB: 50, cpuPercent: 10 }
            }
        });

        const forkOptions = fork.mock.calls[0]![2];
        expect(forkOptions.execArgv).toContain('--import=tsx');
        expect(forkOptions.execArgv).toContain('--max-old-space-size=50');
        expect(forkOptions.resourceLimits).toBeUndefined();
        expect(mockedSetupCgroup).toHaveBeenCalledWith('resource-test', { memoryMB: 50, cpuPercent: 10 });
        expect(mockedAttachToCgroup).toHaveBeenCalledWith(cgroupPath, 1234);
        expect(workerInfo.cgroupPath).toBe(cgroupPath);
    });

    it('honors the legacy maxOldGenerationSizeMb limit', async () => {
        const fork = createForkMock();
        const host = createHost(fork);

        await host.startPlugin({
            pluginId: 'legacy-test',
            dir: '/data/plugins/legacy-test',
            capabilities: [],
            manifest: {
                id: 'legacy-test',
                capabilities: [],
                resourceLimits: { maxOldGenerationSizeMb: 128 }
            }
        });

        const forkOptions = fork.mock.calls[0]![2];
        expect(forkOptions.execArgv).toContain('--max-old-space-size=128');
        expect(forkOptions.resourceLimits).toBeUndefined();
    });

    it('applies a default heap limit when no resource limits are configured', async () => {
        const fork = createForkMock();
        const host = createHost(fork);

        await host.startPlugin({
            pluginId: 'default-test',
            dir: '/data/plugins/default-test',
            capabilities: [],
            manifest: { id: 'default-test', capabilities: [] }
        });

        const forkOptions = fork.mock.calls[0]![2];
        expect(forkOptions.execArgv.some((arg: string) => /^--max-old-space-size=\d+$/.test(arg))).toBe(true);
        expect(forkOptions.resourceLimits).toBeUndefined();
    });

    it('skips cgroup attachment when setup returns null', async () => {
        mockedSetupCgroup.mockResolvedValue(null);
        const fork = createForkMock(5678);
        const host = createHost(fork);

        const workerInfo = await host.startPlugin({
            pluginId: 'no-cgroup-test',
            dir: '/data/plugins/no-cgroup-test',
            capabilities: [],
            manifest: { id: 'no-cgroup-test', capabilities: [] }
        });

        expect(mockedAttachToCgroup).not.toHaveBeenCalled();
        expect(workerInfo.cgroupPath).toBeNull();

        expect(host.terminateWorker('no-cgroup-test')).toBe(true);
        expect(mockedCleanupCgroup).not.toHaveBeenCalled();
    });

    it('skips cgroup attachment when the worker has no pid', async () => {
        mockedSetupCgroup.mockResolvedValue('/sys/fs/cgroup/apollo/workers/nopid-test');
        const fork = vi.fn().mockReturnValue({
            send: vi.fn(),
            on: vi.fn(),
            kill: vi.fn()
        });
        const host = createHost(fork);

        await host.startPlugin({
            pluginId: 'nopid-test',
            dir: '/data/plugins/nopid-test',
            capabilities: [],
            manifest: { id: 'nopid-test', capabilities: [] }
        });

        expect(mockedAttachToCgroup).not.toHaveBeenCalled();
    });

    it('cleans up the cgroup on worker termination', async () => {
        const cgroupPath = '/sys/fs/cgroup/apollo/workers/cleanup-test';
        mockedSetupCgroup.mockResolvedValue(cgroupPath);
        const fork = createForkMock(9999);
        const host = createHost(fork);

        await host.startPlugin({
            pluginId: 'cleanup-test',
            dir: '/data/plugins/cleanup-test',
            capabilities: [],
            manifest: { id: 'cleanup-test', capabilities: [] }
        });

        expect(host.terminateWorker('cleanup-test')).toBe(true);
        expect(mockedCleanupCgroup).toHaveBeenCalledWith(cgroupPath);
    });

    it('worker child reports execArgv for resource limit verification', async () => {
        const pluginId = 'execargv-test';
        const secret = 'test-secret';
        const signed = signCapabilities(pluginId, [], secret);
        const sent: unknown[] = [];
        const processLike = {
            send: (msg: unknown): void => {
                sent.push(msg);
            },
            on: (_event: string, _listener: (msg: unknown) => void): void => undefined
        };
        class FakePlugin {
            static id = 'execargv-test';
            async onLoad(): Promise<void> {}
            async onEnable(): Promise<void> {}
        }

        const child = await runChild({
            pluginDir: '/data/plugins/execargv-test',
            env: {
                PLUGIN_ID: pluginId,
                PLUGIN_CAPABILITIES: JSON.stringify(signed),
                PLUGIN_CAPABILITY_SECRET: secret
            },
            processLike,
            loader: async () => ({ default: FakePlugin as unknown as import('../../src/core/worker/workerChild.js').PluginInstance })
        });

        await child.handleMessage({ type: 'debug:execArgv', requestId: 1 } as unknown as RPCMessage);

        expect(sent).toHaveLength(2);
        const response = sent[1] as { type: string; requestId: number; data: { execArgv: string[] } };
        expect(response.type).toBe('rpc:response');
        expect(response.requestId).toBe(1);
        expect(response.data.execArgv).toEqual(process.execArgv);
    });

    it('attaches a pid to cgroup.procs and removes the cgroup on cleanup', async () => {
        const actual = await vi.importActual<typeof CgroupManager>('../../src/core/worker/cgroupManager.js');
        const dir = mkdtempSync(join(tmpdir(), 'apollo-cgroup-test-'));
        try {
            writeFileSync(join(dir, 'cgroup.procs'), '');
            await expect(actual.attachToCgroup(dir, 4242)).resolves.toBe(true);
            expect(readFileSync(join(dir, 'cgroup.procs'), 'utf-8')).toBe('4242');

            await expect(actual.attachToCgroup(join(dir, 'missing'), 4242)).resolves.toBe(false);

            await actual.cleanupCgroup(dir);
            expect(existsSync(dir)).toBe(false);

            await expect(actual.cleanupCgroup(join(tmpdir(), 'apollo-cgroup-definitely-missing'))).resolves.toBeUndefined();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('returns null from setupCgroup when cgroup delegation is unavailable', async () => {
        const actual = await vi.importActual<typeof CgroupManager>('../../src/core/worker/cgroupManager.js');
        if (existsSync('/sys/fs/cgroup/cgroup.controllers') && existsSync('/sys/fs/cgroup/apollo/workers')) {
            return;
        }
        await expect(actual.setupCgroup('probe-test', { memoryMB: 50, cpuPercent: 10 })).resolves.toBeNull();
    });
});
