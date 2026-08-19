import { fork } from 'node:child_process';
import { logSecurityEvent } from '../../utils/securityLog.js';

const MAX_CONSECUTIVE_CRASHES = 5;
const HEALTHY_WINDOW_MS = 10 * 60 * 1000;

// Capabilities that require explicit admin approval due to high risk
const HIGH_RISK_CAPABILITIES = new Set([
    'api:sendMessage',
    'api:commandReply',
    'events:messageCreate',
    'events:messageDelete',
    'events:messageUpdate'
]);

export class WorkerHost {
    constructor({ fork: forkImpl = fork, log = console.log, now = () => Date.now(), backoff = (attempt) => Math.min(1000 * 2 ** attempt, 60000) } = {}) {
        this._fork = forkImpl;
        this._log = log;
        this._now = now;
        this._backoff = backoff;
        this._workers = new Map();
        this._crashes = new Map();
        this._disabled = new Set();
    }

    getGrantedCapabilities(manifest, requested) {
        const allowed = new Set(manifest.capabilities);
        const granted = requested.filter(cap => allowed.has(cap));
        
        // Log high-risk capability grants for audit trail
        for (const cap of granted) {
            if (HIGH_RISK_CAPABILITIES.has(cap)) {
                this._log(`[WORKER] SECURITY: Plugin granted high-risk capability: ${cap}`);
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

    async startPlugin({ pluginId, dir, capabilities, manifest }) {
        const granted = this.getGrantedCapabilities(manifest, capabilities);
        const childEntry = new URL('./workerChild.js', import.meta.url).pathname;

        // Per-plugin resource limits from manifest (with defaults)
        const resourceLimits = manifest.resourceLimits || {};
        const maxOldGenerationSizeMb = resourceLimits.maxOldGenerationSizeMb || 256;
        const maxYoungGenerationSizeMb = resourceLimits.maxYoungGenerationSizeMb || 64;
        const stackSizeMb = resourceLimits.stackSizeMb || 8;

        const env = {
            PLUGIN_ID: pluginId,
            PLUGIN_DIR: dir,
            PLUGIN_CAPABILITIES: JSON.stringify(granted),
            NODE_ENV: process.env.NODE_ENV
        };

        const child = this._fork(childEntry, [], {
            env,
            stdio: ['ignore', 'inherit', 'inherit', 'ipc'], // stdin: ignore to prevent injection
            resourceLimits: {
                maxOldGenerationSizeMb,
                maxYoungGenerationSizeMb,
                stackSizeMb
            }
        });
        child.on('exit', (code, signal) => this.recordCrash(pluginId, code, signal));
        child.on('error', (err) => this.handleWorkerError(pluginId, err));

        this._workers.set(pluginId, { child, granted, manifest });
        this._log(`[WORKER] Spawned worker for ${pluginId} (memory: ${maxOldGenerationSizeMb}MB old, ${maxYoungGenerationSizeMb}MB young, stack: ${stackSizeMb}MB)`);
        logSecurityEvent({ event: 'plugin.started', pluginId, grantedCapabilities: granted });
        return this._workers.get(pluginId);
    }

    handleWorkerError(pluginId, error) {
        this._log(`[WORKER] ERROR in ${pluginId}: ${error.message}`);
        logSecurityEvent({ event: 'plugin.error', pluginId, error: error.message });
    }

    recordCrash(pluginId, code, signal) {
        const prev = this._crashes.get(pluginId) || { count: 0, lastCrashAt: 0, healthySince: null };
        prev.count += 1;
        prev.lastCrashAt = this._now();
        this._crashes.set(pluginId, prev);

        logSecurityEvent({ event: 'plugin.crash', pluginId, reason: `consecutive=${prev.count}`, exitCode: code, signal });

        if (prev.count >= MAX_CONSECUTIVE_CRASHES) {
            this._disabled.add(pluginId);
            this._log(`[WORKER] ${pluginId} disabled after ${prev.count} consecutive crashes`);
            logSecurityEvent({ event: 'plugin.disabled', pluginId, reason: 'crash threshold reached' });
            if (this.onPluginDisabled) {
                this.onPluginDisabled(pluginId);
            }
            return;
        }

        const delay = this._backoff(prev.count - 1);
        this._log(`[WORKER] ${pluginId} crashed (${prev.count}/${MAX_CONSECUTIVE_CRASHES}); restarting in ${delay}ms`);
        if (this.onScheduleRestart) {
            this.onScheduleRestart(pluginId, delay);
        }
    }

    markHealthy(pluginId) {
        const prev = this._crashes.get(pluginId);
        if (prev) {
            const elapsed = this._now() - (prev.healthySince || prev.lastCrashAt || this._now());
            if (elapsed >= HEALTHY_WINDOW_MS || prev.count === 1) {
                this._crashes.set(pluginId, { count: 0, lastCrashAt: 0, healthySince: this._now() });
            }
        }
    }

    getConsecutiveCrashes(pluginId) {
        return (this._crashes.get(pluginId) || { count: 0 }).count;
    }

    isDisabled(pluginId) {
        return this._disabled.has(pluginId);
    }

    send(pluginId, message) {
        const worker = this._workers.get(pluginId);
        if (!worker) {
            return false;
        }
        worker.child.send(message);
        return true;
    }
}
