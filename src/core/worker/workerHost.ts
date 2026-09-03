import { fork, type ForkOptions, type ChildProcess } from 'node:child_process';
// @ts-ignore - securityLog.js not migrated yet
import { logSecurityEvent } from '../../utils/securityLog.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { RPCMessage } from './rpc.js';

const MAX_CONSECUTIVE_CRASHES = 5;
const HEALTHY_WINDOW_MS = 10 * 60 * 1000;

const HIGH_RISK_CAPABILITIES = new Set([
    'api:sendMessage',
    'api:commandReply',
    'events:messageCreate',
    'events:messageDelete',
    'events:messageUpdate'
]);

export interface WorkerManifest {
    id: string;
    capabilities: string[];
    resourceLimits?: {
        maxOldGenerationSizeMb?: number;
        maxYoungGenerationSizeMb?: number;
        stackSizeMb?: number;
    };
}

export interface WorkerInfo {
    child: ChildProcess;
    granted: string[];
    manifest: WorkerManifest;
}

export interface WorkerHostOptions {
    fork?: (modulePath: string, args: string[], options: ForkOptions) => ChildProcess;
    log?: (msg: string) => void;
    now?: () => number;
    backoff?: (attempt: number) => number;
}

type ForkFn = (modulePath: string, args: string[], options: ForkOptions) => ChildProcess;
type LogFn = (msg: string) => void;
type NowFn = () => number;
type BackoffFn = (attempt: number) => number;

export class WorkerHost {
    private _fork: ForkFn;
    private _log: LogFn;
    private _now: NowFn;
    private _backoff: BackoffFn;
    private _workers: Map<string, WorkerInfo>;
    private _crashes: Map<string, { count: number; lastCrashAt: number; healthySince: number | null }>;
    private _disabled: Set<string>;
    public onPluginDisabled?: (pluginId: string) => void;
    public onScheduleRestart?: (pluginId: string, delay: number) => void;

    constructor({
        fork: forkImpl = fork,
        log = console.log,
        now = () => Date.now(),
        backoff = (attempt) => Math.min(1000 * 2 ** attempt, 60000)
    }: WorkerHostOptions = {}) {
        this._fork = forkImpl;
        this._log = log;
        this._now = now;
        this._backoff = backoff;
        this._workers = new Map();
        this._crashes = new Map();
        this._disabled = new Set();
    }

    getGrantedCapabilities(manifest: WorkerManifest, requested: string[]): string[] {
        const allowed = new Set(manifest.capabilities);
        const granted = requested.filter(cap => allowed.has(cap));

        for (const cap of granted) {
            if (HIGH_RISK_CAPABILITIES.has(cap)) {
                this._log?.(`[WORKER] SECURITY: Plugin granted high-risk capability: ${cap}`);
                logSecurityEvent({
                    event: 'plugin.capability.granted',
                    pluginId: manifest.id,
                    capability: cap,
                    riskLevel: 'high'
                });
            }
        }

        return granted;
    }

    async startPlugin({ pluginId, dir, capabilities, manifest }: {
        pluginId: string;
        dir: string;
        capabilities: string[];
        manifest: WorkerManifest;
    }): Promise<WorkerInfo> {
        const granted = this.getGrantedCapabilities(manifest, capabilities);
        const childEntry = new URL('./workerChild.js', import.meta.url).pathname;

        const resourceLimits = manifest.resourceLimits || {};
        const maxOldGenerationSizeMb = resourceLimits.maxOldGenerationSizeMb ?? 256;
        const maxYoungGenerationSizeMb = resourceLimits.maxYoungGenerationSizeMb ?? 64;
        const stackSizeMb = resourceLimits.stackSizeMb ?? 8;

        const env: Record<string, string> = {
            PLUGIN_ID: pluginId,
            PLUGIN_DIR: dir,
            PLUGIN_CAPABILITIES: JSON.stringify(granted),
            NODE_ENV: process.env['NODE_ENV'] ?? ''
        };

        const child = this._fork!(childEntry, [], {
            env,
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
            // @ts-ignore - resourceLimits is valid for fork in Node.js
            resourceLimits: {
                maxOldGenerationSizeMb,
                maxYoungGenerationSizeMb,
                stackSizeMb
            }
        });

        child.on('exit', (code, signal) => this.recordCrash(pluginId, code, signal));
        child.on('error', (err) => this.handleWorkerError(pluginId, err));

        const workerInfo: WorkerInfo = { child, granted, manifest };
        this._workers.set(pluginId, workerInfo);
        this._log?.(`[WORKER] Spawned worker for ${pluginId} (memory: ${maxOldGenerationSizeMb}MB old, ${maxYoungGenerationSizeMb}MB young, stack: ${stackSizeMb}MB)`);
        logSecurityEvent({ event: 'plugin.started', pluginId, grantedCapabilities: granted });
        return workerInfo;
    }

    handleWorkerError(pluginId: string, error: Error): void {
        this._log?.(`[WORKER] ERROR in ${pluginId}: ${error.message}`);
        logSecurityEvent({ event: 'plugin.error', pluginId, error: error.message });
    }

    recordCrash(pluginId: string, code: number | null, signal: string | null): void {
        const prev = this._crashes.get(pluginId) || { count: 0, lastCrashAt: 0, healthySince: null };
        prev.count += 1;
        prev.lastCrashAt = this._now();
        this._crashes.set(pluginId, prev);

        logSecurityEvent({ event: 'plugin.crash', pluginId, reason: `consecutive=${prev.count}`, exitCode: code, signal });

        if (prev.count >= MAX_CONSECUTIVE_CRASHES) {
            this._disabled.add(pluginId);
            this._log?.(`[WORKER] ${pluginId} disabled after ${prev.count} consecutive crashes`);
            logSecurityEvent({ event: 'plugin.disabled', pluginId, reason: 'crash threshold reached' });
            if (this.onPluginDisabled) {
                this.onPluginDisabled(pluginId);
            }
            return;
        }

        const delay = this._backoff!(prev.count - 1);
        this._log?.(`[WORKER] ${pluginId} crashed (${prev.count}/${MAX_CONSECUTIVE_CRASHES}); restarting in ${delay}ms`);
        if (this.onScheduleRestart) {
            this.onScheduleRestart(pluginId, delay);
        }
    }

    markHealthy(pluginId: string): void {
        const prev = this._crashes.get(pluginId);
        if (prev) {
            const elapsed = this._now() - (prev.healthySince ?? prev.lastCrashAt ?? this._now());
            if (elapsed >= HEALTHY_WINDOW_MS || prev.count === 1) {
                this._crashes.set(pluginId, { count: 0, lastCrashAt: 0, healthySince: this._now() });
            }
        }
    }

    getConsecutiveCrashes(pluginId: string): number {
        return (this._crashes.get(pluginId) || { count: 0 }).count;
    }

    isDisabled(pluginId: string): boolean {
        return this._disabled.has(pluginId);
    }

    send(pluginId: string, message: RPCMessage): boolean {
        const worker = this._workers.get(pluginId);
        if (!worker) {
            return false;
        }
        worker.child.send(message);
        return true;
    }

    getWorker(pluginId: string): WorkerInfo | undefined {
        return this._workers.get(pluginId);
    }

    getAllWorkers(): Map<string, WorkerInfo> {
        return new Map(this._workers);
    }
}

export default WorkerHost;