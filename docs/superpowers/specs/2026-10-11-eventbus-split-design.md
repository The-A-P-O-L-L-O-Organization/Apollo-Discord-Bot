# EventBus Split with Typed PluginBusView (C-Prepared)

- Date: 2026-10-11
- Status: Approved design, pending implementation plan
- Follows: TECHNICAL_DEBT_REPORT.md finding "EventBus.ts conflates event emission, RPC, and distributed state" (Code Quality)
- Prepares: Future C-path (manifest-declared RPC surfaces)

## Context

`src/core/EventBus.ts` (470 lines, `EventBusImpl`) implements three distinct concerns in one class:

1. **Event core** — `on`/`once`/`emit` with priority-sorted `HandlerEntry` sets, `EventFilter` matching, per-event cross-pod Redis subscriptions (`apollo:event:${event}`), and `publish` as an emit alias.
2. **RPC registry** — `provide`/`call` over a `Map<string, ApiEntry>` with duplicate-namespace rejection but no timeout, no schemas, and no structured errors.
3. **State store** — `provideState`/`getState`/`setState`/`watchState` with synchronous watchers and cross-pod sync (`apollo:state:${key}`).

It also carries subscription bookkeeping (`Subscription` records, `subscribe`/`unsubscribe`/`unsubscribeAll`/`unsubscribeAllForPlugin`/`getSubscriptions`), plugin cleanup (`removeAll`), and health metrics. `Plugin.ts:66` hands the raw bus to every plugin as `this.bus`.

Actual first-party usage is minimal: only the interlink plugin touches the bus. It emits own-namespace names (`interlink:message:ping`, `interlink:message:${envelope.type}` at `plugin.ts:351, 355`) and subscribes via `_setupEventBridge` (`plugin.ts:409`) to bare gateway-style names (`memberJoin`, `guildBanAdd` from `INTERLINK_FORWARD_EVENTS`) that carry no namespace at all. The bus itself emits `error` internally on handler failures. No first-party plugin uses `provide`/`provideState`/`watchState`; those exist for third-party plugins and are load-bearing API surface that cannot be removed.

The hand-passed `pluginId` parameter on every `on`/`once`/`provide` call is an error-prone contract: a typo silently registers under the wrong namespace and `removeAll` cleanup misses it. `subscribe()` derives the plugin ID from `filter.sourcePlugin ?? 'unknown'`, which misattributes handlers when no filter is set.

## Goals

1. Split the three concerns into focused, independently testable modules while keeping the `EventBusImpl` public API byte-identical (facade).
2. Introduce `PluginBusView`: a scoped, per-plugin API with auto-bound plugin identity, strict event-name validation, optional zod schema validation, a bounded `call` timeout, and lifecycle-safe cleanup.
3. Build `contractRegistry.ts` as the substrate for the future C-path: registrations land in a manifest-shaped structure so a later change can serialize them into `plugin-manifest.json` without touching call sites.
4. Migrate the interlink plugin to the view as the first-party demonstration.

## Non-goals (explicitly deferred to C)

- Writing event/RPC declarations into `plugin-manifest.json` or validating them at plugin load.
- Runtime deprecation warnings on raw `provide`/`call`/`provideState`.
- Removing or freezing the untyped facade APIs.
- Unifying the separate worker `host.call` RPC mechanism (`src/core/worker/workerChild.ts`, `workerHost.ts`) with the bus RPC registry.
- Changes to cross-pod channel naming or message formats.

## Design

### Module layout

```
src/core/EventBus.ts                 facade: composes the three modules, public API unchanged
src/core/eventBus/eventCore.ts       on/once/emit, priority, filters, handler storage, removeAll handlers part
src/core/eventBus/rpcRegistry.ts     provide/call, per-API metadata, timeout enforcement for views
src/core/eventBus/stateStore.ts      provideState/getState/setState/watchState, TTL, removeAll state part
src/core/eventBus/pluginBusView.ts   per-plugin scoped API handed out by Plugin.ts
src/core/eventBus/contractRegistry.ts  name/schema/owner registry in manifest-shaped form
```

### Facade contract (unchanged)

`EventBusImpl` keeps its constructor signature, every public method, and the exported `EventBusImplOptions`/`HandlerEntry` types. Internals delegate:

- `on`/`once`/`emit`/`publish`/`subscribe`/`unsubscribe`/`unsubscribeAll`/`unsubscribeAllForPlugin`/`getSubscriptions`/`removeAll` (handler portion) delegate to `eventCore`.
- `provide`/`call` delegate to `rpcRegistry`.
- `provideState`/`getState`/`setState`/`watchState` delegate to `stateStore`.
- Cross-pod wiring (`enableCrossPod`, `_handleCrossPodMessage`, channel subscribe/unsubscribe on first/last handler, own-pod skip) stays in the facade, which passes a narrow transport interface to the modules.
- `healthCheck` aggregates counters from eventCore and the facade's transport state.

Cross-pod invariants that must not change: channel names `apollo:event:${event}` and `apollo:state:${key}`, JSON message shapes (`_sourcePodId`, `_event`, `_stateKey`, `_stateValue`), subscribe-on-first-handler/unsubscribe-on-last semantics, and own-pod message skipping.

### PluginBusView API

Constructed per plugin by `Plugin.ts`; one instance per plugin, cached for the plugin lifetime.

```ts
class PluginBusView {
    on(event: string, handler: EventHandler, options?: SubscribeOptions): () => void;
    once(event: string, handler: EventHandler): () => void;
    emit(event: string, payload: unknown, options?: PublishOptions): Promise<void>;
    provide(ns: string, handler: (...args: unknown[]) => Promise<unknown>, meta?: RpcMeta): void;
    call<T = unknown>(ns: string, ...args: unknown[]): Promise<T>;
    state(key: string): ScopedState;
    dispose(): void;
}
```

- **Auto-bound identity:** every method closes over the plugin's ID; no pluginId parameters exist on the view.
- **Event-name validation (two-tier, based on verified real usage):** `emit` through a view requires names within the plugin's own namespace (`${pluginId}:` prefix, non-empty remainder). `on`/`once` accept (a) own-namespace names and (b) bare gateway-style names containing no `:` at all (e.g. `memberJoin`, matching interlink's existing bridge). Names beginning with a different `identifier:` prefix are rejected at registration with a thrown `Error`, which prevents cross-plugin namespace squatting. The internal `error` event remains facade-only; views can subscribe to it but never emit it. Approved default: strict rejection, not warnings.
- **Schema validation hook:** `contractRegistry` may hold a zod schema per event or RPC name. `emit` validates against a registered schema before delivery; an unregistered name passes through unchanged (current semantics preserved). Approved default: schemas optional.
- **Bounded RPC:** `call` enforces a timeout (approved default: 5000 ms, overridable per call via `meta` or options) and rejects with a typed `RpcTimeoutError` on expiry. The raw facade `call` remains timeout-less for compatibility.
- **Namespaced state:** `state(key)` returns get/set/watch scoped to `${pluginId}:${key}`; TTL is opt-in per key (approved default: no expiry, preserving current behavior). Cross-pod sync behavior is unchanged.
- **Lifecycle:** `dispose()` removes every handler, API, state entry, and watcher the plugin registered through the view (and any raw-facade registrations under its ID), then releases the view. `Plugin.ts` calls it from `onDisable`/`onUnload` paths alongside the existing `removeAll`.

### contractRegistry

```ts
interface ContractEntry {
    pluginId: string;
    kind: 'event' | 'rpc' | 'state';
    name: string;
    schema?: ZodType;
    description?: string;
}
```

- Entries are keyed exactly as a future manifest would declare them (`pluginId` + `kind` + `name`). View registrations land here automatically; raw-facade registrations do not. This asymmetry is intentional: it is the migration nudge, with no runtime warnings.
- `snapshot(): ManifestContractShape` returns the registry in the structure a future `plugin-manifest.json` generator would serialize. C's generator becomes a serialization of this snapshot.
- Duplicate registration through the registry follows the facade's existing duplicate rejection semantics (throw on conflict).
- The registry is owned by the facade and shared by all views of that bus instance.

### Plugin.ts integration

- Add `this.busView` (typed `PluginBusView`) alongside the existing `this.bus` (raw facade, unchanged for third-party compatibility).
- First-party migration: interlink's two `emit` sites move to `busView` (own-namespace names pass validation unchanged). The `_setupEventBridge` subscription loop also moves to `busView` — bare gateway names are accepted by the `on` rule, preserving current behavior even though no first-party emitter currently publishes those names on the bus.
- Plugin disable/unload invokes `busView.dispose()` before the existing cleanup path.

## Error handling

- View name validation and duplicate registrations throw synchronously at registration time with messages naming the plugin, kind, and offending name.
- `RpcTimeoutError` carries the namespace, timeout value, and plugin caller ID; it never leaves a dangling handler registration.
- Schema validation failures on `emit` throw before delivery (fail-closed at the producer, matching the repo's validate-before-use rule) and are logged with the event name but never with payload contents.
- `dispose()` is idempotent; a disposed view throws on further use with a clear message.
- Cross-pod transport failures keep the facade's current behavior: log and continue, never crash the emit path.

## Testing strategy

- **Compatibility gate (must pass unchanged):** existing `tests/core/EventBus.test.ts`, `tests/core/eventBus/crossPod.test.ts`, `tests/unit/eventbus-unsubscribe.test.ts`, `tests/chaos/redis-outage.test.ts`.
- **New unit tests:** `tests/core/eventBus/eventCore.test.ts` (priority, filters, once semantics), `rpcRegistry.test.ts` (duplicate rejection, timeout, typed error), `stateStore.test.ts` (watchers, TTL opt-in, removal), `pluginBusView.test.ts` (auto-binding, two-tier name validation: own-namespace emit required, foreign-prefix rejection, bare-name subscription allowed, schema validation, timeout, dispose idempotence and post-dispose throws), `contractRegistry.test.ts` (manifest-shaped snapshot, duplicate rejection, schema attach).
- **Integration:** `tests/core/eventBus/viewCrossPod.test.ts` — view-registered handlers receive cross-pod events through the facade transport with unchanged channel names.
- **Security-relevant cases:** name-format rejection prevents namespace squatting (`otherPlugin:action` from a foreign view); schema failure must not deliver the payload; dispose removes all registrations so a disabled plugin cannot receive further events.

## Verification gates

- `pnpm lint` (exit 0), `pnpm typecheck` (zero errors in changed files), full `pnpm test` (no regressions against the 2043-passed baseline), `pnpm manifest` after first-party source changes, `pnpm lint:locales` not required (no locale strings).
- Documentation updates in the same change: root `codemap.md`, `src/core/codemap.md` (new eventBus/ directory), README inter-plugin communication section, and this spec's status.

## C-path preview (substrate only, not in this change)

1. Serialize `contractRegistry.snapshot()` into `plugin-manifest.json` during `pnpm manifest`; extend CI drift checks.
2. Validate at plugin load that declared contracts match live registrations.
3. Add runtime deprecation warnings to raw `provide`/`provideState`/`watchState`, then remove them after a versioned deprecation window.
4. Unify worker `host.call` with the bus RPC registry under the same contract enforcement.
