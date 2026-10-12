import type {
    EventBusMessage,
    EventFilter,
    PublishOptions,
    SubscribeOptions,
    Subscription,
    EventHandler
} from '../../types/eventbus.js';
import type { EventBusImplOptions, HandlerEntry } from '../EventBus.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger({ component: 'eventbus' });

export interface CrossPodEventMessage extends EventBusMessage {
    _sourcePodId: string;
    _event: string;
}

export class EventCore {
    private _handlers = new Map<string, Set<HandlerEntry>>();
    private _redisPub: EventBusImplOptions['redisPub'] = undefined;
    private _redisSub: EventBusImplOptions['redisSub'] = undefined;
    private _podId: string | undefined = undefined;
    private _crossPodEnabled = false;
    private _publishedCount = 0;
    private _receivedCount = 0;
    private _errorCount = 0;
    private _subscriptions = new Map<string, HandlerEntry>();

    setCrossPod(options: { redisPub?: EventBusImplOptions['redisPub']; redisSub?: EventBusImplOptions['redisSub']; podId?: string }): void {
        this._redisPub = options.redisPub;
        this._redisSub = options.redisSub;
        this._podId = options.podId;
        this._crossPodEnabled = true;
    }

    on<T = unknown>(event: string, handler: EventHandler<T>, pluginId: string, options?: SubscribeOptions, subscriptionId?: string): () => void {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, new Set());
        }
        const entry: HandlerEntry = {
            handler: handler as EventHandler,
            pluginId,
            filter: options?.filter,
            priority: options?.priority ?? 0,
            once: options?.once ?? false,
            subscriptionId
        };
        const set = this._handlers.get(event)!;
        set.add(entry);

        if (subscriptionId) {
            this._subscriptions.set(subscriptionId, entry);
        }

        if (this._crossPodEnabled && set.size === 1) {
            this._redisSub?.subscribe(`apollo:event:${event}`).catch(err => {
                logger.error({ err, msg: `[EventBus] Failed to subscribe to ${event}` });
            });
        }

        return () => {
            if (set.has(entry)) {
                set.delete(entry);
                if (subscriptionId) {
                    this._subscriptions.delete(subscriptionId);
                }
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

        const entries = [...set].sort((a, b) => b.priority - a.priority);

        for (const entry of entries) {
            if (!this._handlers.has(event) || !this._handlers.get(event)!.has(entry)) { continue; }

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

    handleCrossPodEvent(data: CrossPodEventMessage): void {
        const set = this._handlers.get(data._event);
        if (set) {
            for (const entry of set) {
                void entry.handler(data);
            }
            this._receivedCount++;
        }
    }

    subscribe<T>(event: string, handler: EventHandler<T>, options?: SubscribeOptions): Promise<Subscription> {
        const pluginId = options?.filter?.sourcePlugin ?? 'unknown';
        const subscriptionId = crypto.randomUUID();
        this.on(event, handler, pluginId, options, subscriptionId);
        return Promise.resolve({
            id: subscriptionId,
            event,
            filter: options?.filter,
            priority: options?.priority ?? 0,
            once: options?.once ?? false,
            createdAt: Date.now()
        });
    }

    unsubscribe(subscription: Subscription): Promise<void> {
        const entry = this._subscriptions.get(subscription.id);
        if (!entry) {
            return Promise.resolve();
        }

        const set = this._handlers.get(subscription.event);
        if (set?.has(entry)) {
            set.delete(entry);
            if (this._crossPodEnabled && set.size === 0) {
                this._redisSub?.unsubscribe(`apollo:event:${subscription.event}`).catch(() => {});
            }
        }

        this._subscriptions.delete(subscription.id);
        return Promise.resolve();
    }

    unsubscribeAll(event?: string): Promise<void> {
        if (event) {
            this._handlers.delete(event);
        } else {
            this._handlers.clear();
        }
        return Promise.resolve();
    }

    unsubscribeAllForPlugin(pluginId: string): Promise<void> {
        for (const [event, set] of this._handlers) {
            for (const entry of set) {
                if (entry.pluginId === pluginId) {
                    set.delete(entry);
                    if (entry.subscriptionId) {
                        this._subscriptions.delete(entry.subscriptionId);
                    }
                }
            }
            if (this._crossPodEnabled && set.size === 0) {
                this._redisSub?.unsubscribe(`apollo:event:${event}`).catch(() => {});
            }
        }
        return Promise.resolve();
    }

    getSubscriptions(event?: string): Promise<Subscription[]> {
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
        return Promise.resolve(subscriptions);
    }

    removeAll(pluginId: string): void {
        if (this._crossPodEnabled) {
            for (const [event, set] of this._handlers) {
                for (const entry of set) {
                    if (entry.pluginId === pluginId) {
                        set.delete(entry);
                        if (entry.subscriptionId) {
                            this._subscriptions.delete(entry.subscriptionId);
                        }
                        if (set.size === 0) {
                            this._redisSub?.unsubscribe(`apollo:event:${event}`).catch(() => {});
                        }
                    }
                }
            }
        } else {
            for (const [, set] of this._handlers) {
                for (const entry of set) {
                    if (entry.pluginId === pluginId) {
                        if (entry.subscriptionId) {
                            this._subscriptions.delete(entry.subscriptionId);
                        }
                        set.delete(entry);
                    }
                }
            }
        }
    }

    healthStats(): { subscriptions: number; publishedCount: number; receivedCount: number; errorCount: number } {
        return {
            subscriptions: Array.from(this._handlers.values()).reduce((sum, set) => sum + set.size, 0),
            publishedCount: this._publishedCount,
            receivedCount: this._receivedCount,
            errorCount: this._errorCount
        };
    }

    private _matchesFilter(filter: EventFilter, message: EventBusMessage): boolean {
        if (filter.guildId && message.guildId !== filter.guildId) {return false;}
        if (filter.shardId && message.shardId !== filter.shardId) {return false;}
        if (filter.sourceType && message.source.type !== filter.sourceType) {return false;}
        if (filter.sourcePlugin && message.source.plugin !== filter.sourcePlugin) {return false;}
        if (filter.custom && !filter.custom(message)) {return false;}
        return true;
    }
}
