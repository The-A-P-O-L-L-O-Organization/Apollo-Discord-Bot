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
import { RpcRegistry } from './eventBus/rpcRegistry.js';
import { StateStore, type CrossPodStateMessage } from './eventBus/stateStore.js';
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

export class EventBusImpl implements EventBus {
    private _eventCore = new EventCore();
    private _rpcRegistry = new RpcRegistry();
    private _stateStore = new StateStore();
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
            this._stateStore.setCrossPod({ redisPub: options.redisPub, redisSub: options.redisSub, podId: options.podId });
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
        this._rpcRegistry.provide(namespace, fn, pluginId);
    }

    async call<T = unknown>(namespace: string, ...args: unknown[]): Promise<T> {
        return this._rpcRegistry.call<T>(namespace, ...args);
    }

    provideState<T = unknown>(key: string, defaultValue: T, pluginId: string): void {
        this._stateStore.provide(key, defaultValue, pluginId);
    }

    getState<T = unknown>(key: string): T | undefined {
        return this._stateStore.get<T>(key);
    }

    async setState<T = unknown>(key: string, value: T): Promise<void> {
        return this._stateStore.set(key, value);
    }

    watchState(key: string, fn: (_newValue: unknown, _oldValue: unknown) => void, pluginId: string): () => void {
        return this._stateStore.watch(key, fn, pluginId);
    }

    removeAll(pluginId: string): void {
        this._eventCore.removeAll(pluginId);
        this._rpcRegistry.removeAll(pluginId);
        this._stateStore.removeAll(pluginId);
    }

    enableCrossPod(pubClient: EventBusImplOptions['redisPub'], subClient: EventBusImplOptions['redisSub'], podId: string): void {
        this._redisPub = pubClient;
        this._redisSub = subClient;
        this._podId = podId;
        this._crossPodEnabled = true;
        this._eventCore.setCrossPod({ redisPub: pubClient, redisSub: subClient, podId });
        this._stateStore.setCrossPod({ redisPub: pubClient, redisSub: subClient, podId });

        this._redisSub?.on('message', (channel, message) => {
            this._handleCrossPodMessage(channel, message);
        });
    }

    private _handleCrossPodMessage(channel: string, message: string): void {
        try {
            const data = JSON.parse(message) as CrossPodEventMessage | CrossPodStateMessage;
            if (data._sourcePodId === this._podId) { return; }

            if ('_event' in data) {
                this._eventCore.handleCrossPodEvent(data);
            }

            if ('_stateKey' in data) {
                this._stateStore.handleCrossPodState(data);
            }
        } catch (err) {
            logger.error({ err: err as Error, msg: '[EventBus] Error handling cross-pod message' });
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
