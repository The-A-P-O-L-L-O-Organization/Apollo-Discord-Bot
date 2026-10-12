import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ component: 'eventbus' });

export interface RpcMeta {
    timeoutMs?: number;
    description?: string;
}

export interface ApiEntry {
    fn: (...args: unknown[]) => Promise<unknown>;
    pluginId: string;
    meta?: RpcMeta;
}

export class RpcTimeoutError extends Error {
    readonly namespace: string;
    readonly timeoutMs: number;
    readonly callerPluginId: string | undefined;

    constructor(namespace: string, timeoutMs: number, callerPluginId: string | undefined) {
        super(`RPC call to "${namespace}" timed out after ${timeoutMs}ms (caller: ${callerPluginId ?? 'unknown'})`);
        this.name = 'RpcTimeoutError';
        this.namespace = namespace;
        this.timeoutMs = timeoutMs;
        this.callerPluginId = callerPluginId;
    }
}

export class RpcRegistry {
    private _apis = new Map<string, ApiEntry>();

    provide(namespace: string, fn: (...args: unknown[]) => Promise<unknown>, pluginId: string, meta?: RpcMeta): void {
        if (this._apis.has(namespace)) {
            throw new Error(`API "${namespace}" is already registered`);
        }
        this._apis.set(namespace, { fn, pluginId, meta });
    }

    async call<T = unknown>(namespace: string, ...args: unknown[]): Promise<T> {
        const entry = this._apis.get(namespace);
        if (!entry) { throw new Error(`Unknown API: "${namespace}"`); }
        return entry.fn(...args) as Promise<T>;
    }

    callWithTimeout<T = unknown>(namespace: string, timeoutMs: number, callerPluginId: string, ...args: unknown[]): Promise<T> {
        const entry = this._apis.get(namespace);
        if (!entry) { return Promise.reject(new Error(`Unknown API: "${namespace}"`)); }

        let timer: NodeJS.Timeout | undefined;
        let timedOut = false;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                reject(new RpcTimeoutError(namespace, timeoutMs, callerPluginId));
            }, timeoutMs);
            timer.unref();
        });

        const provider = entry.fn(...args) as Promise<T>;
        void provider.catch((err) => {
            if (timedOut) {
                logger.warn({ err, msg: `[EventBus] RPC provider for "${namespace}" failed after timeout` });
            }
        });

        return Promise.race([provider, timeout]).finally(() => {
            if (timer) { clearTimeout(timer); }
        });
    }

    get(namespace: string): ApiEntry | undefined {
        return this._apis.get(namespace);
    }

    removeAll(pluginId: string): void {
        for (const [ns, entry] of this._apis) {
            if (entry.pluginId === pluginId) {
                this._apis.delete(ns);
            }
        }
    }
}
