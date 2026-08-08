import { fork } from 'node:child_process';
import { logSecurityEvent } from '../../utils/securityLog.js';

const MAX_CONSECUTIVE_CRASHES = 5;
const HEALTHY_WINDOW_MS = 10 * 60 * 1000;

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
        return requested.filter(cap => allowed.has(cap));
    }

    async startPlugin({ pluginId, dir, capabilities, manifest }) {
        const granted = this.getGrantedCapabilities(manifest, capabilities);
        const childEntry = new URL('./workerChild.js', import.meta.url).pathname;

        const env = { ...process.env };
        for (const key of Object.keys(env)) {
            if (key === 'DISCORD_TOKEN' || key.startsWith('DB_')) {
                delete env[key];
            }
        }
        env.PLUGIN_ID = pluginId;
        env.PLUGIN_DIR = dir;
        env.PLUGIN_CAPABILITIES = JSON.stringify(granted);

        const child = this._fork(childEntry, [], { env, stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
        child.on('exit', () => this.recordCrash(pluginId));

        this._workers.set(pluginId, { child, granted, manifest });
        this._log(`[WORKER] Spawned worker for ${pluginId}`);
        return this._workers.get(pluginId);
    }

    recordCrash(pluginId) {
        const prev = this._crashes.get(pluginId) || { count: 0, lastCrashAt: 0, healthySince: null };
        prev.count += 1;
        prev.lastCrashAt = this._now();
        this._crashes.set(pluginId, prev);

        logSecurityEvent({ event: 'plugin.crash', pluginId, reason: `consecutive=${prev.count}` });

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
