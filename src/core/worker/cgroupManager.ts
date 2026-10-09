import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../../utils/logger.js';

export const CGROUP_ROOT = '/sys/fs/cgroup/apollo/workers';

export interface ResourceLimits {
    memoryMB?: number;
    cpuPercent?: number;
}

export async function setupCgroup(pluginId: string, limits: ResourceLimits): Promise<string | null> {
    if (!existsSync('/sys/fs/cgroup/cgroup.controllers')) {
        logger.debug('cgroup v2 not available, skipping resource limits');
        return null;
    }
    if (!existsSync(CGROUP_ROOT)) {
        logger.warn('Parent cgroup /sys/fs/cgroup/apollo/workers not found. Create it with delegation for resource limits.');
        return null;
    }
    const cgroupPath = join(CGROUP_ROOT, pluginId);
    try {
        mkdirSync(cgroupPath, { recursive: true });
        if (limits.memoryMB !== undefined) {
            const memoryMax = Math.floor(limits.memoryMB * 1024 * 1024);
            writeFileSync(join(cgroupPath, 'memory.max'), String(memoryMax));
        }
        if (limits.cpuPercent !== undefined) {
            const quota = Math.floor(100000 * (limits.cpuPercent / 100));
            writeFileSync(join(cgroupPath, 'cpu.max'), `${quota} 100000`);
        }
        return cgroupPath;
    } catch (err) {
        logger.warn({ err, pluginId }, 'Failed to setup cgroup, continuing without resource limits');
        try {
            rmSync(cgroupPath, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
        return null;
    }
}

export async function attachToCgroup(cgroupPath: string, pid: number): Promise<boolean> {
    try {
        writeFileSync(join(cgroupPath, 'cgroup.procs'), String(pid));
        return true;
    } catch {
        return false;
    }
}

export async function cleanupCgroup(cgroupPath: string): Promise<void> {
    try {
        if (existsSync(cgroupPath)) {
            rmSync(cgroupPath, { recursive: true, force: true });
        }
    } catch {
        // Ignore cleanup errors
    }
}
