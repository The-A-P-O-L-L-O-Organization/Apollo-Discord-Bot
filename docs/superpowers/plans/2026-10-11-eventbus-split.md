# EventBus Split with Typed PluginBusView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 470-line `EventBusImpl` into three focused modules behind a byte-identical facade, add a typed per-plugin `PluginBusView` with auto-bound identity and bounded RPC, and build the `ContractRegistry` substrate for future manifest-declared contracts.

**Architecture:** `src/core/EventBus.ts` remains the public facade composing `eventCore.ts` (handler storage, dispatch, event-channel transport), `rpcRegistry.ts` (provide/call with metadata and timeouts), and `stateStore.ts` (state with watchers, TTL, cross-pod sync). `PluginBusView` wraps the facade per plugin with validation and scoping; all view registrations land in `ContractRegistry` in manifest shape.

**Tech Stack:** TypeScript strict ESM, Vitest, zod v4 (^4.6.5), Node 26.

**Spec:** `docs/superpowers/specs/2026-10-11-eventbus-split-design.md`

## Global Constraints

- Relative ESM imports must include the `.js` suffix, even in `.ts` files.
- `no-explicit-any` is an error in `src/`; `noUncheckedIndexedAccess` is enabled; handle possibly-undefined indexing explicitly.
- No code comments anywhere (new or migrated). No emojis.
- 4-space indentation, single quotes, semicolles, no trailing commas, `eqeqeq`, `curly: all`.
- Unused function arguments use an underscore prefix.
- `EventBusImpl` public API must remain byte-identical: constructor signature, all methods, exported types `EventBusImplOptions` and `HandlerEntry`, default export. The four compatibility suites must pass UNCHANGED: `tests/core/EventBus.test.ts` (29 tests), `tests/core/eventBus/crossPod.test.ts` (9), `tests/unit/eventbus-unsubscribe.test.ts` (4), `tests/chaos/redis-outage.test.ts` (7).
- Cross-pod invariants: channel names `apollo:event:${event}` and `apollo:state:${key}`; JSON message fields `_sourcePodId`, `_event`, `_stateKey`, `_stateValue`; subscribe-on-first-handler/unsubscribe-on-last; own-pod message skip.
- Verification commands: `pnpm lint`, `pnpm typecheck`, `pnpm vitest run <path>`, full `pnpm test`, `pnpm manifest` (Task 8 only).
- Tests use only in-memory fakes; no Redis, no DB, no network.

## Review Focus

The five input classes the spec implies but plugin authors will hit first, each pinned by a test in its owning task:

1. A plugin subscribes under a foreign namespace (`otherPlugin:action` via a view) — expected: synchronous throw at registration naming the plugin and event. Pinned in Task 5 Step 1 (`pluginBusView.test.ts`).
2. A plugin emits outside its own namespace (no `${pluginId}:` prefix, including `error`) — expected: synchronous throw before any delivery. Pinned in Task 5 Step 1.
3. Any method call on a disposed view — expected: throw `PluginBusView for "<id>" is disposed`, idempotent dispose allowed. Pinned in Task 5 Step 1.
4. An RPC handler that never resolves — expected: `RpcTimeoutError` after the timeout with namespace and caller ID; the registration itself stays intact for later calls. Pinned in Task 5 Step 1 (fake timers).
5. A cross-pod event arrives from another pod running this same protocol — expected: unchanged channel names and message shape, view-registered handler receives it, own-pod messages skipped. Pinned in Task 7 Step 1 (`viewCrossPod.test.ts`).

---

### Task 1: Extract EventCore (handler storage, dispatch, event transport)

**Files:**
- Create: `src/core/eventBus/eventCore.ts`
- Modify: `src/core/EventBus.ts` (delegate; keep types and public API)
- Test: run existing compatibility suites (no new tests in this task)

**Interfaces:**
- Consumes: `HandlerEntry`, `EventBusImplOptions` from `EventBus.ts` (type-only imports); event types from `src/types/eventbus.js`.
- Produces: `export class EventCore` with methods `on(event, handler, pluginId, options?, subscriptionId?): () => void`, `once(event, handler, pluginId): () => void`, `emit<T>(event, payload, options?): Promise<void>`, `subscribe<T>(event, handler, options?): Promise<Subscription>`, `unsubscribe(subscription): Promise<void>`, `unsubscribeAll(event?): Promise<void>`, `unsubscribeAllForPlugin(pluginId): Promise<void>`, `getSubscriptions(event?): Promise<Subscription[]>`, `removeAll(pluginId): void`, `setCrossPod(options: { redisPub?: EventBusImplOptions['redisPub']; redisSub?: EventBusImplOptions['redisSub']; podId?: string }): void`, `handleCrossPodEvent(data: CrossPodEventMessage): void`, `healthStats(): { subscriptions: number; publishedCount: number; receivedCount: number; errorCount: number }`. Also exports `export interface CrossPodEventMessage`.

- [ ] **Step 1: Create `src/core/eventBus/eventCore.ts` with the moved code**

Move the following verbatim (or near-verbatim, renaming `this.` to module-internal state) out of `EventBusImpl`: the `_handlers` and `_subscriptions` maps, `_publishedCount`/`_receivedCount`/`_errorCount` counters, cross-pod event transport fields, `on`, `once`, `emit` (including message construction, priority sort, filter matching, error-event recursion), `subscribe`, `unsubscribe`, `unsubscribeAll`, `unsubscribeAllForPlugin`, `getSubscriptions`, the event-handling branch of `removeAll`, the `_matchesFilter` helper, and the `_event` branch of `_handleCrossPodMessage`.

```ts
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
```

- [ ] **Step 2: Rewrite `src/core/EventBus.ts` as the composing facade**

Keep the file's existing type exports (`EventBusImplOptions`, `HandlerEntry`) and the class declaration. Delete all moved members; delegate. The facade keeps: `_redisPub`, `_redisSub`, `_podId`, `_crossPodEnabled`, `_state` delegation fields (Task 3 removes state), `_apis` delegation fields (Task 2 removes rpc). At this task only the event methods are delegated.

```ts
import type {
    EventBus,
    PublishOptions,
    SubscribeOptions,
    Subscription,
    EventBusHealth,
    EventHandler
} from '../types/eventbus.js';
import { EventCore, type CrossPodEventMessage } from './eventBus/eventCore.js';
import type { EventBusImplOptions, HandlerEntry } from './EventBus.js';
```

Note: `HandlerEntry` stays defined in `EventBus.ts`; `eventCore.ts` imports it type-only (no runtime cycle). `EventBusMessage` and `EventFilter` move to `eventCore.ts` usage; the facade no longer imports them after this task (the state/rpc code that remains uses none of them).

The facade body after Task 1:

```ts
export class EventBusImpl implements EventBus {
    private _eventCore = new EventCore();
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

    emit<T = unknown>(event: string, payload: T, options?: PublishOptions): Promise<void> {
        return this._eventCore.emit(event, payload, options);
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

    removeAll(pluginId: string): void {
        this._eventCore.removeAll(pluginId);
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
}
```

The rpc (`provide`/`call`) and state (`provideState`/`getState`/`setState`/`watchState`) methods stay in the facade UNCHANGED in this task, alongside their `ApiEntry`/`StateEntry`/`StateWatcher` types and the state portion of `removeAll`. The event half of `_handleCrossPodMessage` routes through `_eventCore.handleCrossPodEvent`; the state half stays inline in `_handleCrossPodStateLegacy` until Task 3 replaces it with `_stateStore.handleCrossPodState`.

- [ ] **Step 3: Run compatibility suites**

Run: `pnpm vitest run tests/core/EventBus.test.ts tests/core/eventBus/crossPod.test.ts tests/unit/eventbus-unsubscribe.test.ts tests/chaos/redis-outage.test.ts`
Expected: 49 tests pass (29 + 9 + 4 + 7), zero failures, zero modifications to those files.

- [ ] **Step 4: Typecheck and lint changed files**

Run: `pnpm typecheck && pnpm lint`
Expected: no new errors attributable to `src/core/EventBus.ts` or `src/core/eventBus/eventCore.ts` (pre-existing repo baseline unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/core/eventBus/eventCore.ts src/core/EventBus.ts
git commit -m "refactor(core): extract EventCore from EventBus facade"
```

---

### Task 2: Extract RpcRegistry (provide/call with metadata)

**Files:**
- Create: `src/core/eventBus/rpcRegistry.ts`
- Modify: `src/core/EventBus.ts` (delegate `provide`/`call`, remove `ApiEntry`)
- Test: `tests/core/eventBus/rpcRegistry.test.ts`

**Interfaces:**
- Consumes: nothing from other new modules.
- Produces: `export class RpcTimeoutError extends Error` with `name: 'RpcTimeoutError'`, `namespace: string`, `timeoutMs: number`, `callerPluginId: string | undefined`; `export interface RpcMeta { timeoutMs?: number; description?: string }`; `export class RpcRegistry` with `provide(namespace: string, fn: (...args: unknown[]) => Promise<unknown>, pluginId: string, meta?: RpcMeta): void`, `call<T = unknown>(namespace: string, ...args: unknown[]): Promise<T>`, `callWithTimeout<T = unknown>(namespace: string, timeoutMs: number, callerPluginId: string, ...args: unknown[]): Promise<T>`, `get(namespace: string): { fn: (...args: unknown[]) => Promise<unknown>; pluginId: string; meta?: RpcMeta } | undefined`, `removeAll(pluginId: string): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RpcRegistry, RpcTimeoutError } from '../../../src/core/eventBus/rpcRegistry.js';

describe('RpcRegistry', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('provides and calls an API', async () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:ping', async () => 'pong', 'interlink');
        await expect(registry.call('interlink:ping')).resolves.toBe('pong');
    });

    it('throws on duplicate namespace registration', () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:ping', async () => 1, 'interlink');
        expect(() => registry.provide('interlink:ping', async () => 2, 'interlink')).toThrow(/API "interlink:ping" is already registered/);
    });

    it('throws on unknown namespace with the original message', async () => {
        const registry = new RpcRegistry();
        await expect(registry.call('nope:none')).rejects.toThrow('Unknown API: "nope:none"');
    });

    it('callWithTimeout rejects with RpcTimeoutError when the handler hangs', async () => {
        vi.useFakeTimers();
        const registry = new RpcRegistry();
        registry.provide('interlink:hang', () => new Promise(() => {}), 'interlink');

        const promise = registry.callWithTimeout('interlink:hang', 50, 'moderation');
        vi.advanceTimersByTimeAsync(60);
        await expect(promise).rejects.toBeInstanceOf(RpcTimeoutError);
        await expect(promise).rejects.toMatchObject({ namespace: 'interlink:hang', timeoutMs: 50, callerPluginId: 'moderation', name: 'RpcTimeoutError' });
    });

    it('callWithTimeout still resolves when the handler is fast', async () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:fast', async (v: unknown) => v, 'interlink');
        await expect(registry.callWithTimeout('interlink:fast', 5000, 'moderation', 'ok')).resolves.toBe('ok');
    });

    it('callWithTimeout leaves the registration intact after a timeout', async () => {
        vi.useFakeTimers();
        const registry = new RpcRegistry();
        let release: ((v: string) => void) | undefined;
        registry.provide('interlink:late', () => new Promise<string>((resolve) => { release = resolve; }), 'interlink');

        const promise = registry.callWithTimeout('interlink:late', 50, 'moderation');
        vi.advanceTimersByTimeAsync(60);
        await expect(promise).rejects.toBeInstanceOf(RpcTimeoutError);

        release?.('done');
        await expect(registry.call('interlink:late')).resolves.toBe('done');
    });

    it('removeAll deletes only the owning plugin APIs', () => {
        const registry = new RpcRegistry();
        registry.provide('interlink:a', async () => 1, 'interlink');
        registry.provide('moderation:b', async () => 2, 'moderation');
        registry.removeAll('interlink');
        expect(registry.get('interlink:a')).toBeUndefined();
        expect(registry.get('moderation:b')?.pluginId).toBe('moderation');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/eventBus/rpcRegistry.test.ts`
Expected: FAIL — cannot resolve `../../../src/core/eventBus/rpcRegistry.js`.

- [ ] **Step 3: Write `src/core/eventBus/rpcRegistry.ts`**

```ts
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

        const timeout = new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
                reject(new RpcTimeoutError(namespace, timeoutMs, callerPluginId));
            }, timeoutMs);
            timer.unref();
        });

        return Promise.race([entry.fn(...args) as Promise<T>, timeout]);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/eventBus/rpcRegistry.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Delegate facade rpc methods**

In `src/core/EventBus.ts`: add `private _rpcRegistry = new RpcRegistry();` (import from `./eventBus/rpcRegistry.js`), delete the private `ApiEntry` interface and `_apis` map, and replace the bodies:

```ts
provide(namespace: string, fn: (...args: unknown[]) => Promise<unknown>, pluginId: string): void {
    this._rpcRegistry.provide(namespace, fn, pluginId);
}

async call<T = unknown>(namespace: string, ...args: unknown[]): Promise<T> {
    return this._rpcRegistry.call<T>(namespace, ...args);
}
```

Replace the apis portion of `removeAll` with `this._rpcRegistry.removeAll(pluginId);`.

- [ ] **Step 6: Run compatibility suites**

Run: `pnpm vitest run tests/core/EventBus.test.ts tests/core/eventBus/crossPod.test.ts tests/unit/eventbus-unsubscribe.test.ts tests/chaos/redis-outage.test.ts tests/core/eventBus/rpcRegistry.test.ts`
Expected: all PASS (49 compat + 7 new).

- [ ] **Step 7: Commit**

```bash
git add src/core/eventBus/rpcRegistry.ts src/core/eventBus/rpcRegistry.test.ts src/core/EventBus.ts
git commit -m "refactor(core): extract RpcRegistry with timeout support from EventBus"
```

---

### Task 3: Extract StateStore (state, watchers, TTL, cross-pod sync)

**Files:**
- Create: `src/core/eventBus/stateStore.ts`
- Modify: `src/core/EventBus.ts` (delegate state methods, remove `StateEntry`/`StateWatcher`, replace state branch of `_handleCrossPodMessage`)
- Test: `tests/core/eventBus/stateStore.test.ts`

**Interfaces:**
- Consumes: `EventBusImplOptions` from `EventBus.ts` (type-only).
- Produces: `export interface CrossPodStateMessage { _sourcePodId: string; _stateKey: string; _stateValue: unknown; }`; `export class StateStore` with `provide<T>(key: string, defaultValue: T, owner: string, ttlMs?: number): void`, `get<T>(key: string): T | undefined`, `set<T>(key: string, value: T): Promise<void>`, `watch(key: string, fn: (newValue: unknown, oldValue: unknown) => void, pluginId: string): () => void`, `removeAll(pluginId: string): void`, `setCrossPod(options: { redisPub?: EventBusImplOptions['redisPub']; redisSub?: EventBusImplOptions['redisSub']; podId?: string }): void`, `handleCrossPodState(data: CrossPodStateMessage): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { StateStore } from '../../../src/core/eventBus/stateStore.js';

describe('StateStore', () => {
    it('provides, gets and sets a state key', async () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        expect(store.get('interlink:counter')).toBe(0);
        await store.set('interlink:counter', 5);
        expect(store.get('interlink:counter')).toBe(5);
    });

    it('throws on duplicate key registration', () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        expect(() => store.provide('interlink:counter', 1, 'interlink')).toThrow(/State key "interlink:counter" is already registered/);
    });

    it('throws on unknown key for get/set/watch', async () => {
        const store = new StateStore();
        expect(store.get('missing')).toBeUndefined();
        await expect(store.set('missing', 1)).rejects.toThrow('Unknown state key: "missing"');
        expect(() => store.watch('missing', () => {}, 'interlink')).toThrow('Unknown state key: "missing"');
    });

    it('notifies watchers with new and old values', async () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        const seen: [unknown, unknown][] = [];
        store.watch('interlink:counter', (next, prev) => { seen.push([next, prev]); }, 'moderation');
        await store.set('interlink:counter', 7);
        expect(seen).toEqual([[7, 0]]);
    });

    it('watcher errors are logged and do not break the set', async () => {
        const store = new StateStore();
        store.provide('interlink:counter', 0, 'interlink');
        store.watch('interlink:counter', () => { throw new Error('watcher boom'); }, 'moderation');
        await store.set('interlink:counter', 3);
        expect(store.get('interlink:counter')).toBe(3);
    });

    it('expired TTL keys return undefined and disappear', async () => {
        vi.useFakeTimers();
        const store = new StateStore();
        store.provide('interlink:temp', 'v', 'interlink', 100);
        expect(store.get('interlink:temp')).toBe('v');
        vi.advanceTimersByTime(150);
        expect(store.get('interlink:temp')).toBeUndefined();
        await expect(store.set('interlink:temp', 'x')).rejects.toThrow('Unknown state key: "interlink:temp"');
    });

    it('unset TTL keys never expire', () => {
        vi.useFakeTimers();
        const store = new StateStore();
        store.provide('interlink:perm', 'v', 'interlink');
        vi.advanceTimersByTime(1_000_000);
        expect(store.get('interlink:perm')).toBe('v');
    });

    it('removeAll deletes owned keys and detaches foreign watchers', async () => {
        const store = new StateStore();
        store.provide('interlink:own', 1, 'interlink');
        store.provide('moderation:own', 2, 'moderation');
        const calls: number[] = [];
        store.watch('moderation:own', (v) => { calls.push(v as number); }, 'interlink');
        store.removeAll('interlink');
        expect(store.get('interlink:own')).toBeUndefined();
        expect(store.get('moderation:own')).toBe(2);
        await store.set('moderation:own', 9);
        expect(calls).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/eventBus/stateStore.test.ts`
Expected: FAIL — cannot resolve `../../../src/core/eventBus/stateStore.js`.

- [ ] **Step 3: Write `src/core/eventBus/stateStore.ts`**

```ts
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
                    _sourcePodId: this._podId,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/eventBus/stateStore.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Delegate facade state methods and wire the cross-pod router**

In `src/core/EventBus.ts`: add `private _stateStore = new StateStore();` (import from `./eventBus/stateStore.js`), delete `StateEntry`/`StateWatcher` and `_state`, replace bodies:

```ts
provideState<T = unknown>(key: string, defaultValue: T, pluginId: string): void {
    this._stateStore.provide(key, defaultValue, pluginId);
}

getState<T = unknown>(key: string): T | undefined {
    return this._stateStore.get<T>(key);
}

setState<T = unknown>(key: string, value: T): Promise<void> {
    return this._stateStore.set(key, value);
}

watchState(key: string, fn: (newValue: unknown, oldValue: unknown) => void, pluginId: string): () => void {
    return this._stateStore.watch(key, fn, pluginId);
}
```

Replace the state portion of `removeAll` with `this._stateStore.removeAll(pluginId);`. Update `enableCrossPod` to also call `this._stateStore.setCrossPod({ redisPub: pubClient, redisSub: subClient, podId });`. Replace the `_stateKey` branch of `_handleCrossPodMessage` with `this._stateStore.handleCrossPodState(data);` (typed as `CrossPodStateMessage`), narrowing via the existing `'_stateKey' in data` check. Delete the `CrossPodStateMessage` local interface in favor of the one exported from `stateStore.ts`.

- [ ] **Step 6: Run compatibility suites plus new tests**

Run: `pnpm vitest run tests/core/EventBus.test.ts tests/core/eventBus/crossPod.test.ts tests/unit/eventbus-unsubscribe.test.ts tests/chaos/redis-outage.test.ts tests/core/eventBus/rpcRegistry.test.ts tests/core/eventBus/stateStore.test.ts`
Expected: all PASS (49 compat + 7 + 8 new). `crossPod.test.ts` covers the `_stateKey` routing path.

- [ ] **Step 7: Commit**

```bash
git add src/core/eventBus/stateStore.ts src/core/eventBus/stateStore.test.ts src/core/EventBus.ts
git commit -m "refactor(core): extract StateStore with TTL support from EventBus"
```

---

### Task 4: Build ContractRegistry (manifest-shaped substrate)

**Files:**
- Create: `src/core/eventBus/contractRegistry.ts`
- Test: `tests/core/eventBus/contractRegistry.test.ts`

**Interfaces:**
- Consumes: `import type { ZodType } from 'zod'`.
- Produces: `export type ContractKind = 'event' | 'rpc' | 'state'`; `export interface ContractEntry { pluginId: string; kind: ContractKind; name: string; schema?: ZodType; description?: string }`; `export interface ContractSnapshot { contracts: ContractEntry[] }`; `export class ContractRegistry` with `register(entry: ContractEntry): void` (throws on duplicate pluginId+kind+name), `attachSchema(kind: ContractKind, name: string, schema: ZodType): void` (throws if unknown), `get(kind: ContractKind, name: string): ContractEntry | undefined`, `snapshot(): ContractSnapshot` (sorted by pluginId, then kind, then name — deterministic for manifest serialization).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ContractRegistry } from '../../../src/core/eventBus/contractRegistry.js';

describe('ContractRegistry', () => {
    it('registers and retrieves entries', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        expect(registry.get('event', 'interlink:message:ping')?.pluginId).toBe('interlink');
        expect(registry.get('rpc', 'interlink:message:ping')).toBeUndefined();
    });

    it('throws on duplicate registration of the same contract', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        expect(() => registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' })).toThrow(/already registered/);
    });

    it('allows the same name under different kinds and plugin ids', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'x' });
        registry.register({ pluginId: 'interlink', kind: 'rpc', name: 'x' });
        registry.register({ pluginId: 'moderation', kind: 'event', name: 'x' });
        expect(registry.get('event', 'x')?.pluginId).toBe('interlink');
        expect(registry.get('rpc', 'x')?.pluginId).toBe('interlink');
    });

    it('attaches a schema to an existing entry and rejects unknown ones', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        const schema = z.object({ nonce: z.string() });
        registry.attachSchema('event', 'interlink:message:ping', schema);
        expect(registry.get('event', 'interlink:message:ping')?.schema).toBe(schema);
        expect(() => registry.attachSchema('event', 'missing', schema)).toThrow(/Unknown contract/);
    });

    it('snapshot is deterministic and manifest-shaped', () => {
        const registry = new ContractRegistry();
        registry.register({ pluginId: 'moderation', kind: 'rpc', name: 'moderation:case' });
        registry.register({ pluginId: 'interlink', kind: 'event', name: 'interlink:message:ping' });
        registry.register({ pluginId: 'interlink', kind: 'rpc', name: 'interlink:ping' });
        const snap = registry.snapshot();
        expect(snap.contracts.map((c) => `${c.pluginId}:${c.kind}:${c.name}`)).toEqual([
            'interlink:event:interlink:message:ping',
            'interlink:rpc:interlink:ping',
            'moderation:rpc:moderation:case'
        ]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/eventBus/contractRegistry.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write `src/core/eventBus/contractRegistry.ts`**

```ts
import type { ZodType } from 'zod';

export type ContractKind = 'event' | 'rpc' | 'state';

export interface ContractEntry {
    pluginId: string;
    kind: ContractKind;
    name: string;
    schema?: ZodType;
    description?: string;
}

export interface ContractSnapshot {
    contracts: ContractEntry[];
}

export class ContractRegistry {
    private _entries = new Map<string, ContractEntry>();

    private _key(pluginId: string, kind: ContractKind, name: string): string {
        return `${pluginId}:${kind}:${name}`;
    }

    register(entry: ContractEntry): void {
        const key = this._key(entry.pluginId, entry.kind, entry.name);
        if (this._entries.has(key)) {
            throw new Error(`Contract "${key}" is already registered`);
        }
        this._entries.set(key, entry);
    }

    attachSchema(kind: ContractKind, name: string, schema: ZodType): void {
        for (const [key, entry] of this._entries) {
            if (entry.kind === kind && entry.name === name) {
                entry.schema = schema;
                return;
            }
        }
        throw new Error(`Unknown contract: "${kind}:${name}"`);
    }

    get(kind: ContractKind, name: string): ContractEntry | undefined {
        for (const entry of this._entries.values()) {
            if (entry.kind === kind && entry.name === name) {
                return entry;
            }
        }
        return undefined;
    }

    snapshot(): ContractSnapshot {
        const contracts = [...this._entries.values()].sort((a, b) => {
            const keyA = this._key(a.pluginId, a.kind, a.name);
            const keyB = this._key(b.pluginId, b.kind, b.name);
            return keyA.localeCompare(keyB);
        });
        return { contracts };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/core/eventBus/contractRegistry.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/eventBus/contractRegistry.ts src/core/eventBus/contractRegistry.test.ts
git commit -m "feat(core): add manifest-shaped ContractRegistry for plugin contracts"
```

---

### Task 5: Build PluginBusView (auto-bound, validated, bounded)

**Files:**
- Create: `src/core/eventBus/pluginBusView.ts`
- Modify: `src/core/EventBus.ts` (add `_contractRegistry`, `createView`, view-registration routing)
- Test: `tests/core/eventBus/pluginBusView.test.ts`

**Interfaces:**
- Consumes: `EventBusImpl` (type-only), `RpcRegistry`/`RpcMeta`/`RpcTimeoutError`, `ContractRegistry`, `ContractKind`.
- Produces: `export class PluginBusView` with:
  - `on(event: string, handler: EventHandler, options?: SubscribeOptions & { schema?: ZodType }): () => void`
  - `once(event: string, handler: EventHandler): () => void`
  - `emit<T>(event: string, payload: T, options?: PublishOptions): Promise<void>`
  - `provide(ns: string, handler: (...args: unknown[]) => Promise<unknown>, meta?: RpcMeta): void`
  - `call<T = unknown>(ns: string, ...args: unknown[]): Promise<T>` (default timeout 5000 ms; `meta.timeoutMs` of the provider overrides when set)
  - `state(key: string): { get<T>(): T | undefined; set<T>(value: T): Promise<void>; watch(fn: (next: unknown, prev: unknown) => void): () => void; provide<T>(defaultValue: T, ttlMs?: number): void }`
  - `dispose(): void` (idempotent)
  - Validation rules: `emit` requires `${pluginId}:` prefix; `on`/`once` accept own-prefix or bare names without `:`; any other `identifier:` name throws synchronously. Disposed views throw on every method.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import EventBusImpl from '../../../src/core/EventBus.js';
import { RpcTimeoutError } from '../../../src/core/eventBus/rpcRegistry.js';

function makeView(pluginId: string) {
    const bus = new EventBusImpl();
    const view = bus.createView(pluginId);
    return { bus, view };
}

describe('PluginBusView naming rules', () => {
    it('emits within the own namespace', async () => {
        const { bus, view } = makeView('interlink');
        const seen: unknown[] = [];
        bus.on('interlink:message:ping', async (m) => { seen.push(m.payload); }, 'interlink');
        await view.emit('interlink:message:ping', { a: 1 });
        expect(seen).toEqual([{ a: 1 }]);
    });

    it('rejects emit outside the own namespace, including bare and error events', async () => {
        const { view } = makeView('interlink');
        await expect(view.emit('memberJoin', {})).rejects.toThrow(/must be namespaced to "interlink"/);
        await expect(view.emit('moderation:action', {})).rejects.toThrow(/must be namespaced to "interlink"/);
        await expect(view.emit('error', new Error('x'))).rejects.toThrow(/must be namespaced to "interlink"/);
    });

    it('allows on/once for own-namespace and bare gateway names', () => {
        const { view } = makeView('interlink');
        expect(() => view.on('interlink:message:pong', async () => {})).not.toThrow();
        expect(() => view.on('memberJoin', async () => {})).not.toThrow();
    });

    it('rejects foreign-namespace subscriptions at registration', () => {
        const { view } = makeView('interlink');
        expect(() => view.on('moderation:action', async () => {})).toThrow(/foreign namespace/);
        expect(() => view.on('moderation:action', async () => {}, { priority: 1 })).toThrow(/foreign namespace/);
    });

    it('validates payloads against a registered schema before delivery', async () => {
        const bus = new EventBusImpl();
        const schema = z.object({ nonce: z.string() });
        const subscriber = bus.createView('interlink');
        const emitter = bus.createView('interlink');
        subscriber.on('interlink:message:ping', async () => {}, { schema });
        await expect(emitter.emit('interlink:message:ping', { nonce: 'abc' })).resolves.toBeUndefined();
        await expect(emitter.emit('interlink:message:ping', { nope: 1 })).rejects.toThrow(/Schema validation failed/);
    });
});

describe('PluginBusView rpc', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('namespaces provide and call automatically and applies the default timeout', async () => {
        const { view } = makeView('interlink');
        view.provide('ping', async () => 'pong');
        await expect(view.call('ping')).resolves.toBe('pong');
    });

    it('surfaces the provider timeout override', async () => {
        vi.useFakeTimers();
        const { view } = makeView('interlink');
        view.provide('hang', () => new Promise(() => {}), { timeoutMs: 100 });
        const promise = view.call('hang');
        vi.advanceTimersByTimeAsync(150);
        await expect(promise).rejects.toBeInstanceOf(RpcTimeoutError);
    });

    it('applies the default 5000ms timeout when the provider sets none', async () => {
        vi.useFakeTimers();
        const { view } = makeView('interlink');
        view.provide('hang', () => new Promise(() => {}));
        const promise = view.call('hang');
        vi.advanceTimersByTimeAsync(5100);
        await expect(promise).rejects.toMatchObject({ timeoutMs: 5000 });
    });
});

describe('PluginBusView state', () => {
    it('scopes state access to the plugin namespace', async () => {
        const { view } = makeView('interlink');
        const state = view.state('counter');
        state.provide(0);
        await state.set(4);
        expect(state.get()).toBe(4);
    });

    it('applies opt-in TTL', async () => {
        vi.useFakeTimers();
        const { view } = makeView('interlink');
        const state = view.state('temp');
        state.provide('v', 100);
        vi.advanceTimersByTime(150);
        expect(state.get()).toBeUndefined();
    });
});

describe('PluginBusView dispose', () => {
    it('removes all registrations and rejects further use, idempotently', async () => {
        const { bus, view } = makeView('interlink');
        const seen: unknown[] = [];
        view.on('memberJoin', async (m) => { seen.push(m.payload); });
        view.provide('ping', async () => 'pong');
        view.dispose();
        view.dispose();

        await bus.emit('memberJoin', { x: 1 });
        expect(seen).toEqual([]);
        await expect(view.emit('interlink:ping', {})).rejects.toThrow(/PluginBusView for "interlink" is disposed/);
        expect(() => view.on('memberJoin', async () => {})).toThrow(/disposed/);
        await expect(view.call('ping')).rejects.toThrow(/disposed/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/eventBus/pluginBusView.test.ts`
Expected: FAIL — `bus.createView` does not exist.

- [ ] **Step 3: Write `src/core/eventBus/pluginBusView.ts`**

```ts
import type { ZodType } from 'zod';
import type { EventBusMessage, EventHandler, PublishOptions, SubscribeOptions } from '../../types/eventbus.js';
import type { EventBusImpl } from '../EventBus.js';
import type { RpcMeta } from './rpcRegistry.js';
import type { ContractRegistry } from './contractRegistry.js';

export const DEFAULT_RPC_TIMEOUT_MS = 5000;

export class PluginBusView {
    private _bus: EventBusImpl;
    private _pluginId: string;
    private _contracts: ContractRegistry;
    private _disposed = false;

    constructor(bus: EventBusImpl, pluginId: string, contracts: ContractRegistry) {
        this._bus = bus;
        this._pluginId = pluginId;
        this._contracts = contracts;
    }

    get pluginId(): string {
        return this._pluginId;
    }

    private _assertNotDisposed(): void {
        if (this._disposed) {
            throw new Error(`PluginBusView for "${this._pluginId}" is disposed`);
        }
    }

    private _isOwnNamespace(event: string): boolean {
        return event.startsWith(`${this._pluginId}:`) && event.length > this._pluginId.length + 1;
    }

    private _assertRegistrableEvent(event: string): void {
        if (this._isOwnNamespace(event) || !event.includes(':')) {
            return;
        }
        throw new Error(`Plugin "${this._pluginId}" cannot subscribe to foreign namespace event "${event}"`);
    }

    private _assertEmittableEvent(event: string): void {
        if (!this._isOwnNamespace(event)) {
            throw new Error(`Event "${event}" must be namespaced to "${this._pluginId}:..."`);
        }
    }

    on(event: string, handler: EventHandler, options?: SubscribeOptions & { schema?: ZodType }): () => void {
        this._assertNotDisposed();
        this._assertRegistrableEvent(event);
        this._contracts.register({ pluginId: this._pluginId, kind: 'event', name: event, schema: options?.schema });
        return this._bus.on(event, handler, this._pluginId, options);
    }

    once(event: string, handler: EventHandler): () => void {
        this._assertNotDisposed();
        this._assertRegistrableEvent(event);
        this._contracts.register({ pluginId: this._pluginId, kind: 'event', name: event });
        return this._bus.once(event, handler, this._pluginId);
    }

    async emit<T = unknown>(event: string, payload: T, options?: PublishOptions): Promise<void> {
        this._assertNotDisposed();
        this._assertEmittableEvent(event);
        const contract = this._contracts.get('event', event);
        if (contract?.schema) {
            const result = contract.schema.safeParse(payload);
            if (!result.success) {
                throw new Error(`Schema validation failed for event "${event}"`);
            }
        }
        await this._bus.emit(event, payload, options);
    }

    provide(ns: string, handler: (...args: unknown[]) => Promise<unknown>, meta?: RpcMeta): void {
        this._assertNotDisposed();
        const namespace = `${this._pluginId}:${ns}`;
        this._contracts.register({ pluginId: this._pluginId, kind: 'rpc', name: namespace, description: meta?.description });
        this._bus.provide(namespace, handler, this._pluginId);
    }

    async call<T = unknown>(ns: string, ...args: unknown[]): Promise<T> {
        this._assertNotDisposed();
        const namespace = `${this._pluginId}:${ns}`;
        const entry = this._bus.rpcEntryFor(namespace);
        const timeoutMs = entry?.meta?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
        return this._bus.callWithTimeout<T>(namespace, timeoutMs, this._pluginId, ...args);
    }

    state(key: string): {
        get<T>(): T | undefined;
        set<T>(value: T): Promise<void>;
        watch(fn: (next: unknown, prev: unknown) => void): () => void;
        provide<T>(defaultValue: T, ttlMs?: number): void;
    } {
        this._assertNotDisposed();
        const fullKey = `${this._pluginId}:${key}`;
        this._contracts.register({ pluginId: this._pluginId, kind: 'state', name: fullKey });
        return {
            get: <T>() => this._bus.getState<T>(fullKey),
            set: async <T>(value: T) => { await this._bus.setState(fullKey, value); },
            watch: (fn: (next: unknown, prev: unknown) => void) => this._bus.watchState(fullKey, fn, this._pluginId),
            provide: <T>(defaultValue: T, ttlMs?: number) => this._bus.provideStateWithTtl(fullKey, defaultValue, this._pluginId, ttlMs)
        };
    }

    dispose(): void {
        if (this._disposed) { return; }
        this._disposed = true;
        this._bus.removeAll(this._pluginId);
    }
}
```

- [ ] **Step 4: Add facade support methods**

In `src/core/EventBus.ts`:

```ts
private _contractRegistry = new ContractRegistry();

createView(pluginId: string): PluginBusView {
    return new PluginBusView(this, pluginId, this._contractRegistry);
}

rpcEntryFor(namespace: string): { fn: (...args: unknown[]) => Promise<unknown>; pluginId: string; meta?: RpcMeta } | undefined {
    return this._rpcRegistry.get(namespace);
}

callWithTimeout<T = unknown>(namespace: string, timeoutMs: number, callerPluginId: string, ...args: unknown[]): Promise<T> {
    return this._rpcRegistry.callWithTimeout<T>(namespace, timeoutMs, callerPluginId, ...args);
}

provideStateWithTtl<T = unknown>(key: string, defaultValue: T, pluginId: string, ttlMs?: number): void {
    this._stateStore.provide(key, defaultValue, pluginId, ttlMs);
}
```

Import `ContractRegistry` and `PluginBusView` at the top (value imports) and `RpcMeta` as a type. `pluginBusView.ts` imports `EventBusImpl` type-only, so there is no runtime import cycle.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/core/eventBus/pluginBusView.test.ts`
Expected: 12 tests PASS (naming 5, rpc 3, state 2, dispose 1, plus schema test counted in naming).

- [ ] **Step 6: Run compatibility suites**

Run: `pnpm vitest run tests/core/EventBus.test.ts tests/core/eventBus/crossPod.test.ts tests/unit/eventbus-unsubscribe.test.ts tests/chaos/redis-outage.test.ts`
Expected: 49 tests PASS unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/core/eventBus/pluginBusView.ts src/core/eventBus/pluginBusView.test.ts src/core/EventBus.ts
git commit -m "feat(core): add typed PluginBusView with scoped identity and bounded RPC"
```

---

### Task 6: Wire views into plugin lifecycle

**Files:**
- Modify: `src/core/Plugin.ts` (add `busView` property, construct in constructor)
- Modify: `src/core/PluginManager.ts:259` and `:285` (dispose the view alongside `removeAll`)
- Test: `tests/core/pluginBusViewLifecycle.test.ts`

**Interfaces:**
- Consumes: `EventBusImpl.createView(pluginId)` from Task 5; `PluginBusView.dispose()`.
- Produces: `Plugin.busView: PluginBusView` (public, available to all plugins); `PluginManager` disposes views on the two removal paths.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Plugin } from '../src/core/Plugin.js';
import EventBusImpl from '../src/core/EventBus.js';
import type { TypedClient } from '../src/core/Plugin.js';

class TestPlugin extends Plugin {
    static get id(): string { return 'testplugin'; }
}

function makePlugin(): { plugin: TestPlugin; bus: EventBusImpl } {
    const bus = new EventBusImpl();
    const manager = { bus, registerSocketHandler: () => {} };
    const plugin = new TestPlugin({} as unknown as TypedClient, manager as never);
    return { plugin, bus };
}

describe('Plugin busView lifecycle', () => {
    it('exposes a view bound to the plugin id', () => {
        const { plugin } = makePlugin();
        expect(plugin.busView.pluginId).toBe('testplugin');
    });

    it('routes view registrations through the shared bus', async () => {
        const { plugin, bus } = makePlugin();
        const seen: unknown[] = [];
        plugin.busView.on('testplugin:ping', async (m) => { seen.push(m.payload); });
        await bus.emit('testplugin:ping', { n: 1 });
        expect(seen).toEqual([{ n: 1 }]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/pluginBusViewLifecycle.test.ts`
Expected: FAIL — `busView` does not exist on `Plugin`.

- [ ] **Step 3: Implement in `src/core/Plugin.ts`**

Add to imports: `import { PluginBusView } from './eventBus/pluginBusView.js';`

Add property and constructor assignment (after `this.bus = manager.bus;` at line 66):

```ts
public busView: PluginBusView;
```

```ts
this.busView = manager.bus.createView(this.name);
```

Note: `this.name` is assigned from `PluginClass.id` in the constructor; place the `createView` call AFTER that assignment block so `this.name` is populated.

- [ ] **Step 4: Dispose views in `PluginManager.ts`**

Read `src/core/PluginManager.ts` around lines 250-290 to see both `this.bus.removeAll(id)` call sites (259 and 285). At each site, immediately before the `removeAll` line, add:

```ts
this.bus.viewFor(id)?.dispose();
```

and add to `EventBus.ts` (this REPLACES the uncached `createView` added in Task 5 — Task 5's version creates a new view on every call; from Task 6 on, views are cached per plugin so `viewFor` can find the plugin's view for disposal):

```ts
private _views = new Map<string, PluginBusView>();

createView(pluginId: string): PluginBusView {
    const existing = this._views.get(pluginId);
    if (existing) { return existing; }
    const view = new PluginBusView(this, pluginId, this._contractRegistry);
    this._views.set(pluginId, view);
    return view;
}

viewFor(pluginId: string): PluginBusView | undefined {
    return this._views.get(pluginId);
}
```

`dispose()` already calls `this._bus.removeAll(this._pluginId)`, so the adjacent `removeAll` becomes redundant but harmless (both are idempotent); keep it for path robustness.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/core/pluginBusViewLifecycle.test.ts tests/core/PluginManager.test.ts tests/core/plugin-manager-entry.test.ts`
Expected: lifecycle tests PASS; PluginManager suites show no regressions (pre-existing pass count unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/core/Plugin.ts src/core/PluginManager.ts src/core/EventBus.ts tests/core/pluginBusViewLifecycle.test.ts
git commit -m "feat(core): expose PluginBusView to plugins with lifecycle disposal"
```

---

### Task 7: Migrate interlink to the view + cross-pod integration test

**Files:**
- Modify: `src/plugins/interlink/plugin.ts` (2 emit sites at lines 351/355, bridge loop at 409)
- Test: `tests/core/eventBus/viewCrossPod.test.ts`

**Interfaces:**
- Consumes: `Plugin.busView` from Task 6; view `on`/`emit` from Task 5.
- Produces: interlink uses only `busView` for bus interaction; raw `this.bus` remains available but unused in this plugin.

- [ ] **Step 1: Write the failing integration test**

```ts
import { describe, it, expect } from 'vitest';
import EventBusImpl from '../../../src/core/EventBus.js';

describe('PluginBusView cross-pod delivery', () => {
    it('routes gateway-pod view emits to worker-pod view handlers over unchanged channels', async () => {
        const published: { channel: string; message: string }[] = [];
        let workerDispatch: ((channel: string, message: string) => void) | undefined;

        const gateway = new EventBusImpl();
        gateway.enableCrossPod(
            { publish: async (channel, message) => { published.push({ channel, message }); return 1; } },
            { subscribe: async () => {}, unsubscribe: async () => {}, on: () => {} },
            'pod-gateway'
        );

        const worker = new EventBusImpl();
        worker.enableCrossPod(
            { publish: async () => 1 },
            {
                subscribe: async () => {},
                unsubscribe: async () => {},
                on: (_e, listener) => { workerDispatch = listener; }
            },
            'pod-worker'
        );

        const workerView = worker.createView('interlink');
        const delivered: unknown[] = [];
        workerView.on('interlink:message:ping', async (m) => { delivered.push(m.payload); });

        const gatewayView = gateway.createView('interlink');
        gateway.on('interlink:message:ping', async () => {}, 'interlink');
        await gatewayView.emit('interlink:message:ping', { nonce: 'n1' });

        expect(published).toHaveLength(1);
        expect(published[0]?.channel).toBe('apollo:event:interlink:message:ping');

        const payload = JSON.parse(published[0]!.message) as Record<string, unknown>;
        expect(payload['_sourcePodId']).toBe('pod-gateway');
        expect(payload['_event']).toBe('interlink:message:ping');

        expect(workerDispatch).toBeDefined();
        workerDispatch!(published[0]!.channel, published[0]!.message);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(delivered).toEqual([{ nonce: 'n1' }]);
    });

    it('skips messages originating from its own pod', async () => {
        const delivered: unknown[] = [];
        const bus = new EventBusImpl();
        let listener: ((channel: string, message: string) => void) | undefined;
        bus.enableCrossPod(
            { publish: async () => 1 },
            { subscribe: async () => {}, unsubscribe: async () => {}, on: (_e, l) => { listener = l; } },
            'pod-a'
        );
        const view = bus.createView('interlink');
        view.on('interlink:message:ping', async (m) => { delivered.push(m.payload); });

        await view.emit('interlink:message:ping', { nonce: 'self' });
        expect(listener).toBeDefined();
        listener!('apollo:event:interlink:message:ping', JSON.stringify({
            _sourcePodId: 'pod-a',
            _event: 'interlink:message:ping',
            event: 'interlink:message:ping',
            payload: { nonce: 'self' },
            source: { botId: 'pod-a', processId: 1, type: 'gateway' },
            timestamp: Date.now()
        }));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(delivered).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it passes against the current implementation**

The behavior already exists (Task 1 preserved it); this test pins it for the migration. Note the first test registers a local raw handler on the gateway before emitting because cross-pod publish only fires when the emitting pod has at least one local handler for the event (`set.size > 0` in `emit`).

Run: `pnpm vitest run tests/core/eventBus/viewCrossPod.test.ts`
Expected: 2 tests PASS. If they fail, STOP — the facade regressed and Tasks 1-6 must be re-examined before migrating interlink.

- [ ] **Step 3: Migrate `src/plugins/interlink/plugin.ts`**

Replace line 351:

```ts
await this.bus.emit('interlink:message:ping', envelope);
```

with:

```ts
await this.busView.emit('interlink:message:ping', envelope);
```

Replace line 355:

```ts
await this.bus.emit(`interlink:message:${envelope.type}`, envelope);
```

with:

```ts
await this.busView.emit(`interlink:message:${envelope.type}`, envelope);
```

Replace lines 409-431 (`_setupEventBridge` loop): change `const unsub = this.bus.on(eventName, async (payload: unknown) => {` to `const unsub = this.busView.on(eventName, async (payload: unknown) => {` and delete the trailing `'interlink'` argument (line 431: `}, 'interlink');` becomes `});`).

- [ ] **Step 4: Run interlink tests and the compat suites**

Run: `pnpm vitest run tests/plugins/interlink tests/core/EventBus.test.ts tests/core/eventBus/crossPod.test.ts tests/unit/eventbus-unsubscribe.test.ts tests/chaos/redis-outage.test.ts tests/core/eventBus/viewCrossPod.test.ts`
Expected: all PASS, zero failures. If the interlink test directory differs, locate it with `glob tests/**/interlink*` and run those files.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/interlink/plugin.ts tests/core/eventBus/viewCrossPod.test.ts
git commit -m "refactor(interlink): migrate bus usage to typed PluginBusView"
```

---

### Task 8: Docs, codemaps, manifest, full verification

**Files:**
- Modify: `codemap.md` (root), `src/core/codemap.md`, `README.md` (inter-plugin communication section)
- Modify: `docs/superpowers/specs/2026-10-11-eventbus-split-design.md` (status line)
- Regenerate: `plugin-manifest.json` (interlink source changed in Task 7)

**Interfaces:**
- Consumes: completed Tasks 1-7.
- Produces: synchronized documentation and a clean verification baseline.

- [ ] **Step 1: Update `src/core/codemap.md`**

Add the `eventBus/` directory with one row per new file (`eventCore.ts`, `rpcRegistry.ts`, `stateStore.ts`, `contractRegistry.ts`, `pluginBusView.ts`) in the Responsibility section; describe the facade-delegates-modules design in the Design section; describe view registration flow and dispose wiring in the Flow section; note `Plugin.busView` and `EventBusImpl.createView/viewFor/rpcEntryFor/callWithTimeout/provideStateWithTtl` in the Integration section. Follow the existing codemap template used by this directory.

- [ ] **Step 2: Update root `codemap.md`**

Update the EventBus entry to describe the facade plus five-module layout and the plugin-facing view.

- [ ] **Step 3: Update `README.md`**

In the inter-plugin communication / plugin development section, add the `busView` API summary: auto-bound plugin identity, own-namespace emit enforcement, foreign-namespace subscription rejection, default 5s RPC timeout, opt-in TTL state, and lifecycle-safe dispose. Keep the raw `bus` documented as the compatibility surface for third-party plugins.

- [ ] **Step 4: Update spec status**

Change the spec status line to `Status: Implemented (see docs/superpowers/plans/2026-10-11-eventbus-split.md)`.

- [ ] **Step 5: Regenerate the manifest**

Run: `pnpm manifest`
Expected: manifest regenerates; interlink source hash changes. Review the diff to confirm ONLY interlink-related hashes moved (plus any timestamp fields the format includes). Do not hand-edit hashes.

- [ ] **Step 6: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: lint exit 0 (warnings allowed only if they match the existing repo baseline); typecheck zero errors in changed files; full suite zero failures against the 2056-test baseline (189 files passed, 6 skipped) plus the new suites (7 + 8 + 5 + 12 + 2 + lifecycle tests).

- [ ] **Step 7: Commit**

```bash
git add codemap.md src/core/codemap.md README.md docs/superpowers/specs/2026-10-11-eventbus-split-design.md plugin-manifest.json
git commit -m "docs: update codemaps and README for EventBus decomposition; regenerate manifest"
```
