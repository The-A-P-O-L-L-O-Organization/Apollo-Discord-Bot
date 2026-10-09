import { fork, type ForkOptions, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { logSecurityEvent } from '../../utils/securityLog.js';
import { i18n } from '../../i18n/index.js';
import { DEFAULT_LOCALE, isSupported } from '../../i18n/supportedLocales.js';
import { isOversize } from './rpc.js';
import type { RPCMessage } from './rpc.js';
import { signCapabilities } from './capabilitySignature.js';

const MAX_CRASHES = 5;
const HEALTHY_WINDOW_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const CGROUP_BASE = '/sys/fs/cgroup/apollo/workers';

export const HIGH_RISK_CAPABILITIES = new Set([
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

export interface I18nCallPayload {
    key: string;
    locale?: unknown;
    ns?: unknown;
    vars?: Record<string, string | number | boolean>;
    count?: number;
}

export interface I18nCallResult {
    ok: boolean;
    text?: string;
    error?: string;
}

export interface CircuitState {
    crashes: number;
    lastCrashAt: number;
    state: 'closed' | 'open' | 'half-open';
    nextAttemptAt: number;
    healthySince: number | null;
}

type ForkFn = (modulePath: string, args: string[], options: ForkOptions) => ChildProcess;
type LogFn = (msg: string) => void;
type NowFn = () => number;
type BackoffFn = (attempt: number) => number;

export class WorkerHost extends EventEmitter {
    private _fork: ForkFn;
    private _log: LogFn;
    private _now: NowFn;
    private _backoff: BackoffFn;
    private _workers: Map<string, WorkerInfo>;
    private _circuits: Map<string, CircuitState>;
    private _readyPlugins: Set<string>;
    public onPluginDisabled?: (pluginId: string) => void;
    public onScheduleRestart?: (pluginId: string, delay: number) => void;

    constructor({
        fork: forkImpl = fork,
        log = () => undefined,
        now = () => Date.now(),
        backoff = (attempt) => Math.min(1000 * 2 ** attempt, 60000)
    }: WorkerHostOptions = {}) {
        super();
        this._fork = forkImpl;
        this._log = log;
        this._now = now;
        this._backoff = backoff;
        this._workers = new Map();
        this._circuits = new Map();
        this._readyPlugins = new Set();
    }

    private getCircuit(pluginId: string): CircuitState {
        const existing = this._circuits.get(pluginId);
        if (existing) {
            return existing;
        }
        const initial: CircuitState = {
            crashes: 0,
            lastCrashAt: 0,
            state: 'closed',
            nextAttemptAt: 0,
            healthySince: null
        };
        this._circuits.set(pluginId, initial);
        return initial;
    }

    private updateCircuitState(pluginId: string): void {
        const circuit = this.getCircuit(pluginId);
        const now = this._now();

        if (circuit.state === 'open' && now >= circuit.nextAttemptAt) {
            circuit.state = 'half-open';
            this._circuits.set(pluginId, circuit);
            this._log?.(`[WORKER] Circuit half-open for ${pluginId}`);
        }
    }

    isCircuitOpen(pluginId: string): boolean {
        this.updateCircuitState(pluginId);
        const circuit = this.getCircuit(pluginId);
        return circuit.state === 'open';
    }

    recordCrash(pluginId: string, code: number | null, signal: string | null): void {
        const circuit = this.getCircuit(pluginId);
        const now = this._now();

        circuit.crashes += 1;
        circuit.lastCrashAt = now;
        circuit.healthySince = null;
        this._circuits.set(pluginId, circuit);

        logSecurityEvent({ event: 'plugin.crash', pluginId, reason: `consecutive=${circuit.crashes}`, exitCode: code, signal });

        if (circuit.crashes >= MAX_CRASHES) {
            circuit.state = 'open';
            circuit.nextAttemptAt = now + COOLDOWN_MS;
            this._circuits.set(pluginId, circuit);
            this._log?.(`[WORKER] ${pluginId} disabled after ${circuit.crashes} consecutive crashes`);
            logSecurityEvent({ event: 'plugin.disabled', pluginId, reason: 'crash threshold reached' });
            if (this.onPluginDisabled) {
                this.onPluginDisabled(pluginId);
            }
            return;
        }

        const delay = this._backoff(circuit.crashes - 1);
        this._log?.(`[WORKER] ${pluginId} crashed (${circuit.crashes}/${MAX_CRASHES}); restarting in ${delay}ms`);
        if (this.onScheduleRestart) {
            this.onScheduleRestart(pluginId, delay);
        }
    }

    recordSuccess(pluginId: string): void {
        const circuit = this.getCircuit(pluginId);
        const now = this._now();

        if (circuit.state === 'half-open') {
            // In half-open, a single success closes the circuit
            circuit.state = 'closed';
            circuit.crashes = 0;
            circuit.lastCrashAt = 0;
            circuit.nextAttemptAt = 0;
            circuit.healthySince = now;
            this._circuits.set(pluginId, circuit);
            this._log?.(`[WORKER] Circuit closed for ${pluginId} after successful recovery`);
            return;
        }

        if (circuit.state === 'closed') {
            // In closed state, track healthy window
            if (circuit.crashes > 0) {
                circuit.healthySince ??= circuit.lastCrashAt || now;
                const elapsed = now - circuit.healthySince;
                if (elapsed >= HEALTHY_WINDOW_MS) {
                    // Healthy window elapsed, reset crash count
                    circuit.crashes = 0;
                    circuit.lastCrashAt = 0;
                    circuit.healthySince = now;
                    this._circuits.set(pluginId, circuit);
                    this._log?.(`[WORKER] Crash count reset for ${pluginId} after healthy window`);
                }
            }
        }
    }

    getConsecutiveCrashes(pluginId: string): number {
        return this.getCircuit(pluginId).crashes;
    }

    getCircuitState(pluginId: string): CircuitState {
        this.updateCircuitState(pluginId);
        return this.getCircuit(pluginId);
    }

    isDisabled(pluginId: string): boolean {
        this.updateCircuitState(pluginId);
        return this.getCircuit(pluginId).state === 'open';
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

    startPlugin({ pluginId, dir, capabilities, manifest }: {
        pluginId: string;
        dir: string;
        capabilities: string[];
        manifest: WorkerManifest;
    }): Promise<WorkerInfo> {
        // Check circuit breaker before spawning
        if (this.isCircuitOpen(pluginId)) {
            this._log?.(`[WORKER] ${pluginId} spawn rejected: circuit is open`);
            return Promise.reject(new Error(`Circuit breaker open for ${pluginId}`));
        }

        const granted = this.getGrantedCapabilities(manifest, capabilities);
        const childEntry = new URL('./workerChild.js', import.meta.url).pathname;

        const resourceLimits = manifest.resourceLimits ?? {};
        const maxOldGenerationSizeMb = resourceLimits.maxOldGenerationSizeMb ?? 256;
        const maxYoungGenerationSizeMb = resourceLimits.maxYoungGenerationSizeMb ?? 64;
        const stackSizeMb = resourceLimits.stackSizeMb ?? 8;

        // Create cgroup for this worker
        this.createCgroup(pluginId, resourceLimits);

        const capabilitySecret = process.env['PLUGIN_CAPABILITY_SECRET'] ?? process.env['QUEUE_HMAC_SECRET'] ?? '';
        if (!capabilitySecret) {
            this._log?.('[WORKER] WARNING: PLUGIN_CAPABILITY_SECRET or QUEUE_HMAC_SECRET not set; capability signatures will not be verified');
        }
        const signedCapabilities = signCapabilities(pluginId, granted, capabilitySecret);

        const env: Record<string, string> = {
            PLUGIN_ID: pluginId,
            PLUGIN_DIR: dir,
            PLUGIN_CAPABILITIES: JSON.stringify(signedCapabilities),
            PLUGIN_CAPABILITY_SECRET: process.env['PLUGIN_CAPABILITY_SECRET'] ?? '',
            QUEUE_HMAC_SECRET: process.env['QUEUE_HMAC_SECRET'] ?? '',
            NODE_ENV: process.env['NODE_ENV'] ?? ''
        };

        const child = this._fork(childEntry, [], {
            env,
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
            // @ts-expect-error - resourceLimits is valid at runtime for fork in Node.js but missing from ForkOptions types
            resourceLimits: {
                maxOldGenerationSizeMb,
                maxYoungGenerationSizeMb,
                stackSizeMb
            }
        });

        child.on('exit', (code, signal) => this.recordCrash(pluginId, code, signal));
        child.on('error', (err) => this.handleWorkerError(pluginId, err));
        child.on('message', (msg: unknown) => this.handleChildMessage(pluginId, msg));

        const workerInfo: WorkerInfo = { child, granted, manifest };
        this._workers.set(pluginId, workerInfo);
        this._log?.(`[WORKER] Spawned worker for ${pluginId} (memory: ${maxOldGenerationSizeMb}MB old, ${maxYoungGenerationSizeMb}MB young, stack: ${stackSizeMb}MB)`);
        logSecurityEvent({ event: 'plugin.started', pluginId, grantedCapabilities: granted });
        return Promise.resolve(workerInfo);
    }

    handleWorkerError(pluginId: string, error: Error): void {
        this._log?.(`[WORKER] ERROR in ${pluginId}: ${error.message}`);
        logSecurityEvent({ event: 'plugin.error', pluginId, error: error.message });
    }

    handleChildMessage(pluginId: string, msg: unknown): void {
        if (typeof msg === 'object' && msg !== null &&
            (msg as { type?: unknown }).type === 'lifecycle:ready' &&
            (msg as { pluginId?: unknown }).pluginId === pluginId) {
            this._readyPlugins.add(pluginId);
        }
        this.emit('workerMessage', msg);
    }

    isWorkerReady(pluginId: string): boolean {
        return this._readyPlugins.has(pluginId);
    }

    markHealthy(pluginId: string): void {
        this.recordSuccess(pluginId);
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

    async handleI18nCall(pluginId: string, payload: I18nCallPayload): Promise<I18nCallResult> {
        const worker = this._workers.get(pluginId);
        if (worker?.granted.includes('api:i18n') !== true) {
            return { ok: false, error: `Capability 'api:i18n' is not granted to plugin '${pluginId}'.` };
        }
        if (isOversize(payload)) {
            return { ok: false, error: 'Payload exceeds RPC size limit.' };
        }
        const key = typeof payload.key === 'string' ? payload.key : '';
        const ns = typeof payload.ns === 'string' && payload.ns.length > 0 ? payload.ns : 'common';
        const locale = typeof payload.locale === 'string' && isSupported(payload.locale) ? payload.locale : DEFAULT_LOCALE;
        await i18n.init();
        const t = i18n.getFixedT(locale, ns);
        const text = t(key, {
            ...(payload.vars ?? {}),
            ...(typeof payload.count === 'number' ? { count: payload.count } : {})
        });
        return { ok: true, text };
    }

    getAllWorkers(): Map<string, WorkerInfo> {
        return new Map(this._workers);
    }

    terminateWorker(pluginId: string): boolean {
        const worker = this._workers.get(pluginId);
        if (!worker) {
            return false;
        }
        worker.child.kill();
        this._workers.delete(pluginId);
        this._readyPlugins.delete(pluginId);
        this._log?.(`[WORKER] Terminated worker for ${pluginId}`);
        logSecurityEvent({ event: 'plugin.terminated', pluginId });
        this.cleanupCgroup(pluginId);
        return true;
    }

    private isCgroupV2Available(): boolean {
        return existsSync('/sys/fs/cgroup/cgroup.controllers');
    }

    private createCgroup(pluginId: string, resourceLimits: WorkerManifest['resourceLimits']): void {
        if (!this.isCgroupV2Available()) {
            this._log?.('[WORKER] cgroup v2 not available, skipping resource limits');
            return;
        }

        const cgroupPath = `${CGROUP_BASE}/${pluginId}`;
        try {
            mkdirSync(cgroupPath, { recursive: true });
        } catch (err) {
            this._log?.(`[WORKER] Failed to create cgroup for ${pluginId} (permission denied or unavailable): ${String(err)}`);
            return;
        }

        // Enable memory and cpu controllers
        try {
            writeFileSync(`${cgroupPath}/cgroup.subtree_control`, '+memory +cpu');
        } catch (err) {
            this._log?.(`[WORKER] Failed to enable cgroup controllers for ${pluginId}: ${String(err)}`);
            return;
        }

        // Set memory limit
        if (resourceLimits?.maxOldGenerationSizeMb) {
            const memoryBytes = resourceLimits.maxOldGenerationSizeMb * 1024 * 1024;
            try {
                writeFileSync(`${cgroupPath}/memory.max`, memoryBytes.toString());
            } catch (err) {
                this._log?.(`[WORKER] Failed to set memory.max for ${pluginId}: ${String(err)}`);
            }
        }

        // Set CPU limit (quota in microseconds per period)
        // CPU limit as percentage: 100% = 100000 microseconds per 100000 period
        // Using a reasonable default if not specified
        try {
            writeFileSync(`${cgroupPath}/cpu.max`, '100000 100000');
        } catch (err) {
            this._log?.(`[WORKER] Failed to set cpu.max for ${pluginId}: ${String(err)}`);
        }
    }

    private cleanupCgroup(pluginId: string): void {
        if (!this.isCgroupV2Available()) {
            return;
        }

        const cgroupPath = `${CGROUP_BASE}/${pluginId}`;
        if (!existsSync(cgroupPath)) {
            return;
        }

        // Move any remaining processes to parent cgroup
        try {
            writeFileSync(`${cgroupPath}/cgroup.procs`, '0');
        } catch {
            // Ignore errors moving processes
        }

        // Remove cgroup directory
        try {
            rmSync(cgroupPath, { recursive: true, force: true });
        } catch (err) {
            this._log?.(`[WORKER] Failed to cleanup cgroup for ${pluginId}: ${String(err)}`);
        }
    }
}

export default WorkerHost;