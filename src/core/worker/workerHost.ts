import { fork, type ForkOptions, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { setupCgroup, attachToCgroup, cleanupCgroup } from './cgroupManager.js';
import { logSecurityEvent } from '../../utils/securityLog.js';
import { i18n } from '../../i18n/index.js';
import { DEFAULT_LOCALE, isSupported } from '../../i18n/supportedLocales.js';
import { isOversize } from './rpc.js';
import type { RPCMessage } from './rpc.js';
import { signCapabilities } from './capabilitySignature.js';

const MAX_CRASHES = 5;
const HEALTHY_WINDOW_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;

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
        memoryMB?: number;
        cpuPercent?: number;
        maxOldGenerationSizeMb?: number;
        maxYoungGenerationSizeMb?: number;
        stackSizeMb?: number;
    };
}

export interface WorkerInfo {
    child: ChildProcess;
    granted: string[];
    manifest: WorkerManifest;
    cgroupPath: string | null;
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

    async startPlugin({ pluginId, dir, capabilities, manifest }: {
        pluginId: string;
        dir: string;
        capabilities: string[];
        manifest: WorkerManifest;
    }): Promise<WorkerInfo> {
        // Check circuit breaker before spawning
        if (this.isCircuitOpen(pluginId)) {
            this._log?.(`[WORKER] ${pluginId} spawn rejected: circuit is open`);
            throw new Error(`Circuit breaker open for ${pluginId}`);
        }

        const granted = this.getGrantedCapabilities(manifest, capabilities);
        const childEntry = new URL('./workerChild.js', import.meta.url).pathname;

        const resourceLimits = manifest.resourceLimits ?? {};
        const heapLimitMb = resourceLimits.memoryMB ?? resourceLimits.maxOldGenerationSizeMb ?? 256;

        const execArgv = ['--import=tsx', `--max-old-space-size=${heapLimitMb}`];

        let cgroupPath: string | null = null;
        try {
            cgroupPath = await setupCgroup(pluginId, {
                ...(resourceLimits.memoryMB !== undefined ? { memoryMB: resourceLimits.memoryMB } : {}),
                ...(resourceLimits.cpuPercent !== undefined ? { cpuPercent: resourceLimits.cpuPercent } : {})
            });
        } catch {
            cgroupPath = null;
        }

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
            execArgv
        });

        if (cgroupPath !== null && child.pid !== undefined) {
            const attached = await attachToCgroup(cgroupPath, child.pid);
            if (!attached) {
                this._log?.(`[WORKER] Failed to attach worker for ${pluginId} (pid ${child.pid}) to cgroup`);
            }
        }

        child.on('exit', (code, signal) => this.recordCrash(pluginId, code, signal));
        child.on('error', (err) => this.handleWorkerError(pluginId, err));
        child.on('message', (msg: unknown) => this.handleChildMessage(pluginId, msg));

        const workerInfo: WorkerInfo = { child, granted, manifest, cgroupPath };
        this._workers.set(pluginId, workerInfo);
        this._log?.(`[WORKER] Spawned worker for ${pluginId} (heap: ${heapLimitMb}MB${cgroupPath !== null ? `, cgroup: ${cgroupPath}` : ''})`);
        logSecurityEvent({ event: 'plugin.started', pluginId, grantedCapabilities: granted });
        return workerInfo;
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
        if (worker.cgroupPath !== null) {
            void cleanupCgroup(worker.cgroupPath);
        }
        return true;
    }
}

export default WorkerHost;