# Plugin System Overhaul — Design Spec

- Date: 2026-10-12
- Status: Approved design; implementation plan pending
- Supersedes: ADR-0004 two-path plugin trust model (new ADR to be written as part of implementation)

## 1. Goals

1. Authoring ergonomics for humans and LLMs: comprehensive documentation, an interactive scaffold wizard, minimal boilerplate, a clear lifecycle, and a small, predictable API surface that produces reliably correct plugin code.
2. Stronger security: a unified least-privilege capability model, host-only trust, and OS-level containment. Fix every discoverable security defect in the current system.
3. Minecraft-style plugin dependencies: declarative, versioned, hard and optional dependencies with topological load ordering and inter-plugin APIs.
4. Two plugin tiers, `basic` and `advanced`, differing in power: basic plugins receive a fixed preset of safe abilities; advanced plugins unlock the full capability catalog by explicit declaration.
5. Sandbox-everything execution: every plugin, first-party included, runs in a sandboxed worker child process. Plugins are authored in TypeScript and delivered as compiled JavaScript.

## 2. Non-Goals

- Plugin registry, marketplace, or public distribution channel. Installed third-party plugins are out of scope for this overhaul.
- A backward compatibility layer for the old plugin API. The seven first-party plugins are migrated to the new contract; the old core is deleted.
- Dependency groups, dependency aliases, and provides/conflicts relations. Dependencies are direct `pluginId -> semver range` declarations only.
- An in-repo adversarial plugin suite.
- WASM or vm2-style isolation alternatives.

## 3. Background

The current system has two divergent plugin paths: first-party plugins run in-process with full host access; installed third-party plugins run in sandboxed workers gated by a separate 12-string capability set. Known defects:

- Two disjoint capability systems (`PluginCapability` in `src/types/shared.ts` vs `KNOWN_CAPABILITIES` in `src/core/worker/pluginManifest.ts`).
- A fully specified `PluginContext` type exists but is never injected; plugins hard-import core singletons (roughly 270 direct imports of i18n, db, logger, config across plugins).
- `PluginLoader.load` permanently rejects, leaving built-in plugin reload broken; `PluginReloader` cannot reload built-ins.
- Three parallel command registration paths; `scripts/deploy-commands.ts` misses nested command directories (automod commands in `commands/automod/` are not registered by it).
- Capability grants are stashed in `process.env['PLUGIN_<ID>_CAPABILITIES']`; the sandbox child receives `QUEUE_HMAC_SECRET` (trust domain mixing the governing ADR explicitly forbids).
- The worker `event:register` RPC is a stub that always succeeds; several socket RPC handlers return fabricated success responses.
- Dead types and duplicate plugin type files (`src/types/plugin.ts` duplicating `src/types/shared.ts`).
- Doc drift: AGENTS.md describes a locale layout and socket path that do not match the code.

ADR-0004 documents the two-tier trust model and names "two plugin loading paths" and "coarse capabilities" as accepted negative consequences. This redesign removes both.

## 4. Architecture and Execution Model

Topology: star, host-mediated. The host owns everything privileged; every plugin lives in its own forked child process. Plugins never see the Discord client, Redis, Knex, or the filesystem. They see only their worker and an RPC channel to the host.

- One child per plugin. A crash, hang, or memory runaway in any plugin is contained by its circuit breaker (5 crashes per 10 minutes opens the breaker; 60 second cooldown) and cgroup limits. Restart backoff is per-plugin and exponential (1 s to 60 s). Host and other plugins keep running.
- Events: the child declares which Discord events it wants at load time. The host subscribes once on the shared client and dispatches serialized, zod-validated payloads over RPC. This replaces the current `event:register` stub.
- Commands: the queue path is unchanged (gateway serializes the interaction into BullMQ; the queue worker reconstructs it), then routes execution into the owning plugin's child via RPC. Command definitions are described once from the compiled entry at load and synced once at plugin enable — exactly one registration path; this fixes the deploy-script discovery gap.
- Privileged actions: when plugin code sends a message, reads config, translates, or touches storage, the call crosses the RPC boundary and the host enforces the capability grant and payload limits before executing. Enforcement lives host-side, where the child cannot tamper with it.
- Schedulers: timers live host-side because children restart. A child registers named recurring tasks via RPC; the host fires them under `withLock` and delivers ticks to the child. Registration is idempotent, so re-registration after a child restart is harmless.
- Inter-plugin calls: consumer child -> host -> provider child. Star topology through the host; no child-to-child links; every hop capability-checked; one audit point.
- RPC: msgpackr frames, zod-validated on both sides, 1 MB frame cap, per-call deadlines.

Accepted costs: one RPC hop (roughly 1-2 ms) per command/event delivery and serialization discipline on all payloads. Mitigations: describe command definitions once at load instead of per sync, batch event payloads where legal, keep payloads small.

## 5. Plugin Contract

### 5.1 Package Layout

Plugins are authored in TypeScript and shipped as compiled JavaScript:

```
my-plugin/
  apollo.plugin.json        manifest, single source of truth
  src/                      TypeScript source
    plugin.ts, commands/, events/
  dist/                     compiled JavaScript, what the loader executes
  locales/en-US/common.json plus de, el, es-ES, it, pl
```

The loader imports from `dist/` in production. Dev mode runs `src/` through tsx inside the child. Verification targets shipped artifacts only: SHA-256 pinning via `plugin-manifest.json`, acorn AST validation of the entry (exactly one default export, no top-level side effects), and sigstore verification for installed archives.

### 5.2 Manifest

```json
{
  "id": "ticket-automation",
  "name": "Ticket Automation",
  "version": "1.2.0",
  "api": 1,
  "type": "basic",
  "entry": "dist/plugin.js",
  "dependencies": {
    "tickets": "^1.0.0",
    "logging-kit": { "range": "^2.0.0", "optional": true }
  }
}
```

- `api` is the plugin SDK contract version. When the context API evolves, this integer bumps and the loader refuses or warns on mismatch. This is the future compatibility mechanism.
- `entry` is always compiled JavaScript. Class-static plugin metadata is removed.
- `resourceLimits` is honored for advanced plugins only.

### 5.3 Capability Catalog

One unified catalog replaces both existing systems. Two abilities need no grant and are available to every plugin regardless of tier: defining slash commands, and logging via the context. Everything else requires a capability from this table:

| Capability | Grants |
|---|---|
| `events.<EventName>` | subscription to one Discord event, per-event grants |
| `api.messages` | send, edit, reply via host |
| `api.i18n` | translation calls |
| `storage` | scoped, plugin-namespaced guild and user data |
| `scheduler` | host-side recurring task registration |
| `http` | outbound fetch with host-side SSRF guards, timeouts, size caps, audit |
| `bus` | typed publish/subscribe, own namespace by default |
| `pluginApi.expose` | publish a schema-validated API to other plugins |
| `pluginApi.require` | call other plugins' exposed APIs |
| `socketRpc` | register Unix-socket CLI RPC handlers |
| `cli` | CLI command extensions |

### 5.4 Tiers

- `type: "basic"`: auto-granted preset — commands, a fixed safe event list (messageCreate, interactionCreate, guildMemberAdd, guildMemberRemove, ready), storage, i18n, logging, own-namespace bus. A basic manifest must not declare a `capabilities` array. Advanced powers are structurally unreachable because the context does not expose them.
- `type: "advanced"`: must itemize exactly the capabilities it uses. Unknown capabilities are rejected before load. Undeclared runtime attempts are rejected host-side at the RPC boundary.
- `resourceLimits` applies to advanced plugins only.

### 5.5 Loader Validation

Fail fast with clear diagnostics: unknown type rejects; basic manifest with a capabilities array rejects; advanced manifest without capabilities rejects; unknown capability rejects; unsatisfied hard dependency refuses to enable with an error naming the missing plugin and the plugin that requires it. Never a stack trace.

## 6. Authoring API

The surface an LLM or developer writes against. Two rules: no boilerplate (no class inheritance, no lifecycle wiring, no registration calls) and no hidden state (every handler receives its context explicitly as an argument).

```ts
import { definePlugin, command, s } from 'apollo-plugin-sdk';

export default definePlugin({
    commands: [
        command('ping', {
            descriptionKey: 'ping.description',
            execute: async (interaction, ctx) => {
                await ctx.messages.reply(interaction, { content: 'pong' });
            },
        }),
    ],
    events: {
        guildMemberAdd: async (member, ctx) => {
            await ctx.storage.setGuild('welcome', { greetedAt: Date.now() });
        },
    },
    scheduler: {
        cleanup: { every: '1h', run: async (ctx) => {
            await ctx.storage.setGuild('cleanup', { lastRun: Date.now() });
        } },
    },
});
```

Everything is a plain object literal: a pure expression, satisfying the AST validator, and the shape LLMs produce most reliably. The `scheduler` block in this example requires the advanced tier; a basic plugin's definition simply omits it.

### 6.1 Context Services

| Service | Tier | Behavior |
|---|---|---|
| `ctx.logger` | always | child-safe pino child logger tagged with plugin id |
| `ctx.storage` | basic preset | `getGuild/setGuild/getUser/setUser`, typed, auto-namespaced under plugin id, host-enforced |
| `ctx.i18n` | basic preset | `t(key, params, locale?)` scoped to the plugin namespace automatically |
| `ctx.messages` | `api.messages` | `send`, `reply`, `edit`; host executes against the real client |
| `ctx.bus` | `bus` | typed publish/subscribe with zod schemas, own namespace enforced |
| `ctx.scheduler` | advanced | named, idempotent recurring tasks; timers host-side |
| `ctx.http` | advanced | `fetch` with host-side SSRF guards, timeouts, size caps |
| `ctx.plugins` | advanced | `requirePlugin(id)` version-checked via manifest deps; `expose(name, api)` |
| `ctx.socketRpc` / `ctx.cli` | advanced | CLI socket handlers / CLI command specs |
| `ctx.meta` | always | own id, version, tier, granted capabilities |

### 6.2 Reliability Discipline

- Every RPC payload is zod-validated on both sides with schemas shipped in the SDK; a malformed call fails at the boundary with a precise error.
- Handler exceptions never escape: the SDK converts them into safe error codes and user-safe summaries host-side. Stack traces, paths, and secrets cannot cross the boundary.
- `ctx.storage` returns typed, schema-validated JSON. No raw Knex, no raw SQL, anywhere.
- Wrong-tier access is impossible three ways: the TypeScript type omits the service, the manifest validator rejects mismatches at load, and the host re-checks at the boundary.

## 7. Dependencies and Inter-Plugin APIs

### 7.1 Declaration

Manifest dependencies: hard deps as `{ "pluginId": "^1.2.0" }`, optional deps as `{ "range": "...", "optional": true }`. Semver ranges only; no `latest`, no git URLs. Ranges resolve against the provider's actual manifest version at load.

### 7.2 Exposure and Consumption

Providers publish named, schema-validated APIs at load. Input and output schemas are mandatory because calls cross at least one process boundary. `expose` requires `pluginApi.expose` (advanced tier).

```ts
expose: {
    tickets: {
        input: s.object({ action: s.enum(['create', 'close']), channelId: s.string() }),
        output: s.object({ ticketId: s.string() }),
        handle: async (req, ctx) => {
            const record = await ctx.storage.getGuild('tickets', req.channelId);
            return { ticketId: record.id };
        },
    },
},
```

`ctx.plugins.requirePlugin(id)` validates on every call: the dependency was declared in the consumer's manifest, the provider is enabled, and the running provider version satisfies the declared range. Undeclared access is rejected. Unsatisfied optional dependencies return `null` and the consumer degrades.

### 7.3 Resolution and Ordering

1. Reject cycles with a named-path error (`a -> b -> c -> a`).
2. Reject unsatisfied hard dependencies at enable time, naming the missing or disabled plugin and its requirer.
3. Load and enable in topological order, enabling independent plugins in parallel waves; disable and unload in exact reverse.
4. Optional dependencies are skipped without error.

### 7.4 Runtime Churn

When a provider is disabled or crashes while consumers are live, calls fail with a typed `PluginUnavailableError`, never a raw RPC error. Consumers that must react subscribe to core lifecycle bus events `core.pluginEnabled` and `core.pluginDisabled`, published by the host on every tier transition.

## 8. Developer Tooling

### 8.1 Scaffold Wizard

`pnpm apollo plugin new` opens an interactive wizard built on `@clack/prompts` with `picocolors` (the same stack shadcn/ui uses):

1. Intro banner with plugin system name and version.
2. Text prompt for plugin name with live slug validation.
3. Select prompt for tier (basic/advanced), each option with a one-line description of what it unlocks.
4. Advanced only: multiselect for capabilities and a second multiselect listing installed plugins to prefill dependencies.
5. Spinner through generation.
6. Generated file tree, colored checkmarks, and next steps (dev command, locale file locations, authoring guide link).

All wizard answers have flag equivalents (`--tier`, `--capabilities`, `--deps`, `--yes`); when stdin is not a TTY the wizard bypasses to flag mode. One generator underneath; the wizard is presentation only. Generated output compiles, lints, and passes tests on first run.

### 8.2 SDK Package

`src/plugins/sdk/` (built to `dist/plugins/sdk/`) is the only import a plugin needs: `definePlugin`, `command`, schema builders, context types, and RPC frame schemas. Versioned via the manifest `api` field. Types are precise enough that editor autocompletion serves as the tutorial.

### 8.3 Build

Plugin TypeScript compiles with the repo's `pnpm build` (tsc, ESM, `.js` import suffixes) to `dist/plugins/<name>/`. `pnpm manifest` regenerates integrity hashes over compiled artifacts, manifests, and locales. Dev mode keeps tsx inside workers so iteration needs no rebuild.

### 8.4 Documentation

One canonical authoring guide at `docs/plugins/authoring.md`, written for humans and LLMs: manifest schema reference, full context API with signatures, tier and capability tables, dependency declaration rules, lifecycle semantics, error-handling conventions, and two complete worked examples (one basic, one advanced) mirroring scaffold output. README, INSTALLATION, CONTRIBUTING, AGENTS, and codemaps update as part of the work. A new ADR supersedes ADR-0004.

## 9. Security Model

### 9.1 Trust Boundary

The child process is untrusted by construction; the host is the only authority. The child verifies nothing and holds no secrets: it receives `PLUGIN_ID`, `PLUGIN_DIR`, and runtime mode only. IPC is same-uid and kernel-mediated; all verification is host-side. This removes the current design's inversion where the child holds a shared HMAC secret to verify the host, which is why `QUEUE_HMAC_SECRET` leaks into sandbox children today.

### 9.2 Containment

- No secrets in child environment, ever. Capabilities are not stored in `process.env`; the host keeps an in-memory capability index as the single enforcement source.
- Children spawn with Node's permission model (`--permission`) restricting filesystem access, `child_process`, `worker_threads`, and native addons, plus cgroup v2 attach for memory and CPU. A plugin that escapes the context API hits a kernel-level wall, not just an API-shaped one.
- Host-side enforcement on every RPC call: capability check, payload schema, size cap, rate limit. Discord-facing sends are rate-limited per plugin via a token bucket so no plugin can flood.
- Every RPC has a deadline; a blocked event loop or infinite loop gets the worker killed and the circuit breaker opened.
- Containment is structural rather than enumerated: the design assumes attacks the designers did not anticipate, so unanticipated attempts hit walls that exist independently of any threat list.

### 9.3 Carried-Forward Hygiene

HTTPS-only and SSRF-guarded downloads (private-range blocking, redirect caps, zip-bomb guard, symlink rejection), SHA-256 manifest pinning, sigstore verification, and AST validation of compiled entries remain in force. `ALLOW_UNVERIFIED_PLUGINS` stays dev-only, enforced by architecture fitness tests.

### 9.4 Deletions

Dead `PluginLoader`; the never-injected plugin context types in `src/types/shared.ts`; the stub `event:register`; env-as-state capability storage; class-static plugin metadata; the two-path loading model.

## 10. Testing and Migration

### 10.1 Test Strategy

- New core tests: manifest schema validation (tier, capability, dependency rules), dependency resolution (ordering, waves, cycle and missing-dependency diagnostics), capability enforcement at the host RPC boundary (grant, payload cap, rate limit), worker lifecycle (load then enable; disable then unload; restart backoff), sandbox spawn flags, SDK contract tests (`definePlugin` shape, schema builders, context typing).
- Architecture fitness functions in `tests/architecture/` encode the invariants permanently: no plugin file imports core singletons directly (import scan); plugins import only from the SDK; every plugin has a valid manifest; basic manifests declare no capabilities; enforcement code exists on every host RPC dispatch path.
- Existing per-plugin command tests survive largely intact: command handlers become pure functions receiving `(interaction, ctx)`, so tests keep their Discord mocks and inject a context stub. Test files migrate plugin by plugin alongside rewrites.

### 10.2 Migration

Build beside, migrate across, delete behind. The old core keeps running untouched while the new one lands, so the bot works at every commit.

1. Phase 0 — New core: SDK, manifest schema and validation, unified capability catalog, sandboxed worker execution (permission model, host-side enforcement), new loader with dependency resolution, scaffold wizard, authoring docs.
2. Phase 1 — Pilot: migrate `integrations` (smallest, 304 LOC) end to end to surface API gaps with minimal blast radius.
3. Phase 2 — Sweep: migrate the remaining six in the order admin, automod, tickets, utility, interlink, with moderation last at 8.9k LOC. Each plugin: `definePlugin` rewrite, commands and events take `ctx`, storage and i18n move behind context. Tier assignment is expected to be advanced for automod, interlink, integrations (schedulers, http, host services) and for admin, moderation, tickets, utility where schedulers or socket RPC are used.
4. Phase 3 — Delete: old `Plugin` and `PluginManager` paths, `PluginLoader`, dead types in `src/types/shared.ts`, env-as-state capability storage, the two-path loading model. One command-registration path remains.
5. Phase 4 — Documentation debt: new ADR superseding ADR-0004, README/INSTALLATION/CONTRIBUTING/AGENTS/codemap updates, `pnpm manifest` regeneration, full verification pass.

### 10.3 Hard Compatibility Rules

- No data loss: `ctx.storage` reads and writes the same underlying guild and user JSON documents that `src/utils/db.ts` uses today, namespaced per plugin id, so migrated plugins keep their data with zero conversion.
- No regression windows: old and new plugins never mix in one boot; a plugin is either fully migrated or fully on the old path; every phase ends with lint, typecheck, tests, and manifest green.

## 11. Success Criteria

- All seven first-party plugins run on the new contract; the old core is fully deleted.
- One command-registration path; one loading path; one capability catalog.
- Every plugin executes in a sandboxed worker with host-side capability enforcement; no secrets reach child processes.
- Plugin dependencies (hard and optional, versioned) resolve, order, and fail with named diagnostics; inter-plugin APIs are schema-validated end to end.
- The scaffold wizard produces a working, lint-clean, tested plugin on first run in both tiers.
- The authoring guide, scaffold output, and SDK types agree with each other and with the implementation.
- Lint, typecheck, tests, locale lint, and manifest verification pass; architecture fitness tests enforce the new invariants in CI.
