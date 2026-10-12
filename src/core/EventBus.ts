import type {
    EventBus,
    EventFilter,
    PublishOptions,
    SubscribeOptions,
    Subscription,
    EventBusHealth,
    EventHandler
} from '../types/eventbus.js';
import { EventCore, type CrossPodEventMessage } from './eventBus/eventCore.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'eventbus' });

export interface EventBusImplOptions {
    redisPub?: {
        publish: (_channel: string, _message: string) => Promise<number>;
    };
    redisSub?: {
        subscribe: (_channel: string) => Promise<void>;
        unsubscribe: (_channel: string) => Promise<void>;
        on: (_event: 'message', _listener: (_channel: string, _message: string) => void) => void;
    };
    podId?: string;
}

export interface HandlerEntry {
    handler: EventHandler;
    pluginId: string;
    filter: EventFilter | undefined;
    priority: number;
    once: boolean;
    subscriptionId?: string;
}

interface ApiEntry {
    fn: (..._args: unknown[]) => Promise<unknown>;
    pluginId: string;
}

interface StateEntry<T = unknown> {
    value: T;
    watchers: Set<StateWatcher>;
    owner: string;
}

interface StateWatcher {
    fn: (_newValue: unknown, _oldValue: unknown) => void;
    pluginId: string;
}

export class EventBusImpl implements EventBus {
    private _eventCore = new EventCore();
    private _apis = new Map<string, ApiEntry>();
    private _state = new Map<string, StateEntry>();
    private _redisPub: EventBusImplOptions['redisPub'] = undefined;
    private _redisSub: EventBusImplOptions['redisSub'] = undefined;
    private _podId: string | undefined = undefined;
    private _crossPodEnabled = false;

    constructor(options: EventBusImplOptions = {}) {
        this._redisPub = options.redisPub;
        this._redisSub = options.redisSub;
        this._podId = options.podId;
        if (options.redisPub || options.redisSub) {
            this._eventCore.setCrossPod({ redisPub: options.redisPub, redisSub: options.redisSub, podId: options.podId });
        }
    }

    on<T = unknown>(event: string, handler: EventHandler<T>, pluginId: string, options?: SubscribeOptions, subscriptionId?: string): () => void {
        return this._eventCore.on(event, handler, pluginId, options, subscriptionId);
    }

    once<T = unknown>(event: string, handler: EventHandler<T>, pluginId: string): () => void {
        return this._eventCore.once(event, handler, pluginId);
    }

    async emit<T = unknown>(event: string, payload: T, options?: PublishOptions): Promise<void> {
        return this._eventCore.emit(event, payload, options);
    }

    provide(namespace: string, fn: (..._args: unknown[]) => Promise<unknown>, pluginId: string): void {
        if (this._apis.has(namespace)) {
            throw new Error(`API "${namespace}" is already registered`);
        }
        this._apis.set(namespace, { fn, pluginId });
    }

    async call<T = unknown>(namespace: string, ...args: unknown[]): Promise<T> {
        const entry = this._apis.get(namespace);
        if (!entry) { throw new Error(`Unknown API: "${namespace}"`); }
        return entry.fn(...args) as Promise<T>;
    }

    provideState<T = unknown>(key: string, defaultValue: T, pluginId: string): void {
        if (this._state.has(key)) {
            throw new Error(`State key "${key}" is already registered`);
        }
        this._state.set(key, { value: defaultValue, watchers: new Set(), owner: pluginId });
    }

    getState<T = unknown>(key: string): T | undefined {
        const entry = this._state.get(key);
        return entry?.value as T | undefined;
    }

    async setState<T = unknown>(key: string, value: T): Promise<void> {
        const entry = this._state.get(key);
        if (!entry) { throw new Error(`Unknown state key: "${key}"`); }
        const oldValue = entry.value;
        entry.value = value;
        for (const w of entry.watchers) {
            try {
                w.fn(value, oldValue);
            } catch (err) {
                logger.error({ err, msg: `[EventBus] Error in state watcher for "${key}"` });
                try {
                    await this.emit('error', err, { persistent: false });
                } catch (e) {
                    logger.error({ err: e, msg: '[EventBus] Error while emitting error event' });
                }
            }
        }

        if (this._crossPodEnabled) {
            try {
                await this._redisPub?.publish(`apollo:state:${key}`, JSON.stringify({
                    _sourcePodId: this._podId,
                    _stateKey: key,
                    _stateValue: value
                }));
            } catch (err) {
                logger.error({ err, msg: '[EventBus] Failed to publish cross-pod state' });
            }
        }
    }

    watchState(key: string, fn: (_newValue: unknown, _oldValue: unknown) => void, pluginId: string): () => void {
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
                this._redisSub?.unsubscribe(`apollo:state:${key}`).catch(() => {
                    // ignore unsubscribe errors
                });
            }
        };
    }

    removeAll(pluginId: string): void {
        this._eventCore.removeAll(pluginId);
        for (const [ns, entry] of this._apis) {
            if (entry.pluginId === pluginId) {
                this._apis.delete(ns);
            }
        }
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

    enableCrossPod(pubClient: EventBusImplOptions['redisPub'], subClient: EventBusImplOptions['redisSub'], podId: string): void {
        this._redisPub = pubClient;
        this._redisSub = subClient;
        this._podId = podId;
        this._crossPodEnabled = true;
        this._eventCore.setCrossPod({ redisPub: pubClient, redisSub: subClient, podId });

        this._redisSub?.on('message', (channel, message) => {
            this._handleCrossPodMessage(channel, message);
        });
    }

    private _handleCrossPodMessage(channel: string, message: string): void {
        try {
            const data = JSON.parse(message) as CrossPodEventMessage | { _sourcePodId: string; _stateKey: string; _stateValue: unknown };
            if (data._sourcePodId === this._podId) { return; }

            if ('_event' in data) {
                this._eventCore.handleCrossPodEvent(data);
            }

            if ('_stateKey' in data) {
                this._handleCrossPodStateLegacy(data);
            }
        } catch (err) {
            logger.error({ err: err as Error, msg: '[EventBus] Error handling cross-pod message' });
        }
    }

    private _handleCrossPodStateLegacy(data: { _stateKey: string; _stateValue: unknown }): void {
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

    healthCheck(): Promise<EventBusHealth> {
        const stats = this._eventCore.healthStats();
        return Promise.resolve({
            healthy: true,
            redisConnected: !!this._redisPub && !!this._redisSub,
            subscriptions: stats.subscriptions,
            publishedCount: stats.publishedCount,
            receivedCount: stats.receivedCount,
            errorCount: stats.errorCount,
            latency: 0
        });
    }

    publish<T>(event: string, payload: T, options?: PublishOptions): Promise<void> {
        return this._eventCore.emit(event, payload, options);
    }

    subscribe<T>(event: string, handler: EventHandler<T>, options?: SubscribeOptions): Promise<Subscription> {
        return this._eventCore.subscribe(event, handler, options);
    }

    unsubscribe(subscription: Subscription): Promise<void> {
        return this._eventCore.unsubscribe(subscription);
    }

    unsubscribeAll(event?: string): Promise<void> {
        return this._eventCore.unsubscribeAll(event);
    }

    unsubscribeAllForPlugin(pluginId: string): Promise<void> {
        return this._eventCore.unsubscribeAllForPlugin(pluginId);
    }

    getSubscriptions(event?: string): Promise<Subscription[]> {
        return this._eventCore.getSubscriptions(event);
    }
}

export default EventBusImpl;
