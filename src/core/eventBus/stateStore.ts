import type { EventBusImplOptions } from '../EventBus.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ component: 'eventbus' });

export interface CrossPodStateMessage {
    _sourcePodId: string;
    _stateKey: string;
    _stateValue: unknown;
}

interface StateEntry<T = unknown> {
    value: T;
    watchers: Set<StateWatcher>;
    owner: string;
    expiresAt?: number;
}

interface StateWatcher {
    fn: (newValue: unknown, oldValue: unknown) => void;
    pluginId: string;
}

export class StateStore {
    private _state = new Map<string, StateEntry>();
    private _redisPub: EventBusImplOptions['redisPub'] = undefined;
    private _redisSub: EventBusImplOptions['redisSub'] = undefined;
    private _podId: string | undefined = undefined;
    private _crossPodEnabled = false;

    setCrossPod(options: { redisPub?: EventBusImplOptions['redisPub']; redisSub?: EventBusImplOptions['redisSub']; podId?: string }): void {
        this._redisPub = options.redisPub;
        this._redisSub = options.redisSub;
        this._podId = options.podId;
        this._crossPodEnabled = true;
    }

    private _isExpired(entry: StateEntry): boolean {
        return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
    }

    private _expireIfDue(key: string): void {
        const entry = this._state.get(key);
        if (entry && this._isExpired(entry)) {
            this._state.delete(key);
        }
    }

    provide<T = unknown>(key: string, defaultValue: T, owner: string, ttlMs?: number): void {
        if (this._state.has(key)) {
            throw new Error(`State key "${key}" is already registered`);
        }
        this._state.set(key, {
            value: defaultValue,
            watchers: new Set(),
            owner,
            expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : undefined
        });
    }

    get<T = unknown>(key: string): T | undefined {
        this._expireIfDue(key);
        const entry = this._state.get(key);
        return entry?.value as T | undefined;
    }

    async set<T = unknown>(key: string, value: T): Promise<void> {
        this._expireIfDue(key);
        const entry = this._state.get(key);
        if (!entry) { throw new Error(`Unknown state key: "${key}"`); }
        const oldValue = entry.value;
        entry.value = value;
        for (const w of entry.watchers) {
            try {
                w.fn(value, oldValue);
            } catch (err) {
                logger.error({ err, msg: `[EventBus] Error in state watcher for "${key}"` });
            }
        }

        if (this._crossPodEnabled) {
            try {
                await this._redisPub?.publish(`apollo:state:${key}`, JSON.stringify({
                    _sourcePodId: this._podId ?? 'local',
                    _stateKey: key,
                    _stateValue: value
                }));
            } catch (err) {
                logger.error({ err, msg: '[EventBus] Failed to publish cross-pod state' });
            }
        }
    }

    watch(key: string, fn: (newValue: unknown, oldValue: unknown) => void, pluginId: string): () => void {
        this._expireIfDue(key);
        const entry = this._state.get(key);
        if (!entry) { throw new Error(`Unknown state key: "${key}"`); }
        const watcher: StateWatcher = { fn, pluginId };
        const wasEmpty = entry.watchers.size === 0;
        entry.watchers.add(watcher);

        if (this._crossPodEnabled && wasEmpty) {
            this._redisSub?.subscribe(`apollo:state:${key}`).catch(err => {
                logger.error({ err, msg: `[EventBus] Failed to subscribe to state ${key}` });
            });
        }

        return () => {
            entry.watchers.delete(watcher);
            if (this._crossPodEnabled && entry.watchers.size === 0) {
                this._redisSub?.unsubscribe(`apollo:state:${key}`).catch(() => {});
            }
        };
    }

    handleCrossPodState(data: CrossPodStateMessage): void {
        const entry = this._state.get(data._stateKey);
        if (entry && data._stateValue !== entry.value) {
            const oldValue = entry.value;
            entry.value = data._stateValue;
            for (const w of entry.watchers) {
                try {
                    w.fn(data._stateValue, oldValue);
                } catch (err) {
                    logger.error({ err: err as Error, msg: `[EventBus] Error in cross-pod state watcher for "${data._stateKey}"` });
                }
            }
        }
    }

    removeAll(pluginId: string): void {
        for (const [key, entry] of this._state) {
            if (entry.owner === pluginId) {
                this._state.delete(key);
            } else {
                for (const w of entry.watchers) {
                    if (w.pluginId === pluginId) { entry.watchers.delete(w); }
                }
            }
        }
    }
}
