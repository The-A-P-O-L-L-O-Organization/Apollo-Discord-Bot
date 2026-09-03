import type {
    EventBus,
    EventBusMessage,
    EventSource,
    EventFilter,
    PublishOptions,
    SubscribeOptions,
    Subscription,
    EventBusHealth,
    EventHandler
} from '../types/eventbus.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger({ component: 'eventbus' });

export interface EventBusImplOptions {
    redisPub?: {
        publish: (channel: string, message: string) => Promise<number>;
    };
    redisSub?: {
        subscribe: (channel: string) => Promise<void>;
        unsubscribe: (channel: string) => Promise<void>;
        on: (event: 'message', listener: (channel: string, message: string) => void) => void;
    };
    podId?: string;
}

export interface HandlerEntry {
    handler: EventHandler;
    pluginId: string;
    filter: EventFilter | undefined;
    priority: number;
    once: boolean;
}

interface ApiEntry {
    fn: (...args: unknown[]) => Promise<unknown>;
    pluginId: string;
}

interface StateEntry<T = unknown> {
    value: T;
    watchers: Set<StateWatcher>;
    owner: string;
}

interface StateWatcher {
    fn: (newValue: unknown, oldValue: unknown) => void;
    pluginId: string;
}

// Internal cross-pod message types
interface CrossPodEventMessage extends EventBusMessage {
    _sourcePodId: string;
    _event: string;
}

interface CrossPodStateMessage extends EventBusMessage {
    _sourcePodId: string;
    _stateKey: string;
    _stateValue: unknown;
}

export class EventBusImpl implements EventBus {
    private _handlers: Map<string, Set<HandlerEntry>> = new Map();
    private _apis: Map<string, ApiEntry> = new Map();
    private _state: Map<string, StateEntry> = new Map();
    private _redisPub: EventBusImplOptions['redisPub'] = undefined;
    private _redisSub: EventBusImplOptions['redisSub'] = undefined;
    private _podId: string | undefined = undefined;
    private _crossPodEnabled = false;
    private _publishedCount = 0;
    private _receivedCount = 0;
    private _errorCount = 0;

    constructor(options: EventBusImplOptions = {}) {
        this._redisPub = options.redisPub;
        this._redisSub = options.redisSub;
        this._podId = options.podId;
    }

    on<T = unknown>(event: string, handler: EventHandler<T>, pluginId: string, options?: SubscribeOptions): () => void {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, new Set());
        }
        const entry: HandlerEntry = {
            handler: handler as EventHandler,
            pluginId,
            filter: options?.filter,
            priority: options?.priority ?? 0,
            once: options?.once ?? false
        };
        const set = this._handlers.get(event)!;
        set.add(entry);

        if (this._crossPodEnabled && set.size === 1) {
            this._redisSub?.subscribe(`apollo:event:${event}`).catch(err => {
                logger.error({ err, msg: `[EventBus] Failed to subscribe to ${event}` });
            });
        }

        return () => {
            if (set.has(entry)) {
                set.delete(entry);
                if (this._crossPodEnabled && set.size === 0) {
                    this._redisSub?.unsubscribe(`apollo:event:${event}`).catch(() => {});
                }
            }
        };
    }

    once<T = unknown>(event: string, handler: EventHandler<T>, pluginId: string): () => void {
        const wrapped: EventHandler<T> = async (payload) => {
            try {
                await handler(payload);
            } finally {
                const set = this._handlers.get(event);
                if (set) {
                    for (const entry of set) {
                        if (entry.handler === wrapped) {
                            set.delete(entry);
                            break;
                        }
                    }
                }
            }
        };
        return this.on(event, wrapped, pluginId, { once: true });
    }

    async emit<T = unknown>(event: string, payload: T, options?: PublishOptions): Promise<void> {
        const set = this._handlers.get(event);
        if (!set) { return; }

        const message: EventBusMessage<T> = {
            event,
            payload,
            source: {
                botId: this._podId ?? 'local',
                processId: process.pid,
                type: 'gateway'
            },
            timestamp: Date.now(),
            correlationId: options?.correlationId,
            guildId: options?.guildId,
            shardId: options?.shardId
        };

        // Sort handlers by priority (highest first)
        const entries = [...set].sort((a, b) => b.priority - a.priority);

        for (const entry of entries) {
            if (!this._handlers.has(event) || !this._handlers.get(event)!.has(entry)) { continue; }

            // Apply filter if present
            if (entry.filter && !this._matchesFilter(entry.filter, message)) {
                continue;
            }

            try {
                await entry.handler(message);
            } catch (err) {
                this._errorCount++;
                logger.error({ err, msg: `[EventBus] Error in handler for "${event}"` });
                try {
                    await this.emit('error', err, { persistent: false });
                } catch (e) {
                    logger.error({ err: e, msg: '[EventBus] Error while emitting error event' });
                }
            }
        }

        if (this._crossPodEnabled && set.size > 0) {
            try {
                await this._redisPub?.publish(`apollo:event:${event}`, JSON.stringify(message));
                this._publishedCount++;
            } catch (err) {
                logger.error({ err, msg: '[EventBus] Failed to publish cross-pod event' });
            }
        }
    }

    provide(namespace: string, fn: (...args: unknown[]) => Promise<unknown>, pluginId: string): void {
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

    watchState(key: string, fn: (newValue: unknown, oldValue: unknown) => void, pluginId: string): () => void {
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

    removeAll(pluginId: string): void {
        if (this._crossPodEnabled) {
            for (const [event, set] of this._handlers) {
                for (const entry of set) {
                    if (entry.pluginId === pluginId) {
                        set.delete(entry);
                        if (set.size === 0) {
                            this._redisSub?.unsubscribe(`apollo:event:${event}`).catch(() => {});
                        }
                    }
                }
            }
        } else {
            for (const [, set] of this._handlers) {
                for (const entry of set) {
                    if (entry.pluginId === pluginId) { set.delete(entry); }
                }
            }
        }
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

        this._redisSub?.on('message', (channel, message) => {
            this._handleCrossPodMessage(channel, message);
        });
    }

    private _matchesFilter(filter: EventFilter, message: EventBusMessage): boolean {
        if (filter.guildId && message.guildId !== filter.guildId) return false;
        if (filter.shardId && message.shardId !== filter.shardId) return false;
        if (filter.sourceType && message.source.type !== filter.sourceType) return false;
        if (filter.sourcePlugin && message.source.plugin !== filter.sourcePlugin) return false;
        if (filter.custom && !filter.custom(message)) return false;
        return true;
    }

    private _handleCrossPodMessage(channel: string, message: string): void {
        try {
            const data = JSON.parse(message) as CrossPodEventMessage | CrossPodStateMessage;
            if (data._sourcePodId === this._podId) { return; }

            if ('_event' in data) {
                const set = this._handlers.get(data._event);
                if (set) {
                    for (const entry of set) {
                        entry.handler(data);
                    }
                    this._receivedCount++;
                }
            }

            if ('_stateKey' in data) {
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
        } catch (err) {
            logger.error({ err: err as Error, msg: '[EventBus] Error handling cross-pod message' });
        }
    }

    async healthCheck(): Promise<EventBusHealth> {
        return {
            healthy: true,
            redisConnected: !!this._redisPub && !!this._redisSub,
            subscriptions: Array.from(this._handlers.values()).reduce((sum, set) => sum + set.size, 0),
            publishedCount: this._publishedCount,
            receivedCount: this._receivedCount,
            errorCount: this._errorCount,
            latency: 0
        };
    }

    async publish<T>(event: string, payload: T, options?: PublishOptions): Promise<void> {
        return this.emit(event, payload, options);
    }

    async subscribe<T>(event: string, handler: EventHandler<T>, options?: SubscribeOptions): Promise<Subscription> {
        const pluginId = options?.filter?.sourcePlugin ?? 'unknown';
        this.on(event, handler, pluginId, options);
        return {
            id: crypto.randomUUID(),
            event,
            filter: options?.filter,
            priority: options?.priority ?? 0,
            once: options?.once ?? false,
            createdAt: Date.now()
        };
    }

    async unsubscribe(subscription: Subscription): Promise<void> {
        // Note: We can't easily find the exact entry without storing subscription ID
        // This is a limitation - in practice we'd need to track subscriptions differently
    }

    async unsubscribeAll(event?: string): Promise<void> {
        if (event) {
            this._handlers.delete(event);
        } else {
            this._handlers.clear();
        }
    }

    async getSubscriptions(event?: string): Promise<Subscription[]> {
        const subscriptions: Subscription[] = [];
        const eventsToCheck = event ? [event] : Array.from(this._handlers.keys());
        for (const e of eventsToCheck) {
            const set = this._handlers.get(e);
            if (set) {
                for (const entry of set) {
                    subscriptions.push({
                        id: crypto.randomUUID(),
                        event: e,
                        filter: entry.filter,
                        priority: entry.priority,
                        once: entry.once,
                        createdAt: Date.now()
                    });
                }
            }
        }
        return subscriptions;
    }
}

export default EventBusImpl;