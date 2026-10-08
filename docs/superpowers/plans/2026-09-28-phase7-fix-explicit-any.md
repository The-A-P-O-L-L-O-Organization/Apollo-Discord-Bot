# Phase 7: Fix Explicit `any` Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all 159 `@typescript-eslint/no-explicit-any` errors across the codebase by replacing `any` with proper types, while maintaining test coverage and not introducing regressions.

**Architecture:** Systematic file-by-file fix approach. Each file's `any` usages are replaced with proper interfaces, generics, or `unknown` with type guards. Priority order: core infrastructure → plugins → utilities. Tests verify no behavioral changes.

**Tech Stack:** TypeScript 5.6+, ESLint with `@typescript-eslint/no-explicit-any: error` for `src/**/*.ts`, Vitest for tests.

**Spec:** Based on lint output from `pnpm lint` showing 159 explicit `any` errors across 12 source files.

---

## Global Constraints

- Node.js ≥26.0.0 (`.nvmrc`, `package.json#engines.node`, Dockerfiles)
- pnpm only (workspaces, native builds via `pnpm-workspace.yaml#allowedBuilds`)
- ESM only (`"type": "module"`), `import`/`export` syntax
- 4-space indent, single quotes, semicolons, no trailing commas
- No emojis in source or docs
- No code comments unless explicitly requested
- Tests in `tests/**/*.test.ts`, setup in `tests/setup.ts`
- Run `pnpm lint` and `pnpm test` before committing

---

## Review Focus

| # | Input / Condition | Expected Behavior |
|---|-------------------|-------------------|
| 1 | Plugin context objects (`db`, `queue`, `rpc`, `scheduler`) passed as `any` | Type-safe interfaces used; no `any` in public APIs |
| 2 | Dynamic plugin imports (`import()` returning `any`) | Proper module type signatures with `PluginClass` interface |
| 3 | Knex query builders typed as `any` in `db/adapter.ts` | Generic `Knex.QueryBuilder` types with proper return types |
| 4 | EventBus handler entries stored with `any` filter functions | Typed `EventFilter` interface used consistently |
| 5 | Worker capability signatures verified with `any` arrays | `SignedCapabilities` interface enforced at boundaries |

---

## File Map (from lint output)

| File | Explicit `any` Errors | Primary Issue |
|------|----------------------|---------------|
| `src/core/PluginManager.ts` | 24 | Delegation to sub-modules using `any` |
| `src/core/PluginLoader.ts` | 8 | Dynamic import return types, manifest parsing |
| `src/core/PluginEnabler.ts` | 6 | Worker host/client typing |
| `src/core/PluginDisabler.ts` | 4 | Worker termination, EventBus calls |
| `src/core/Plugin.ts` | 2 | Command/event module dynamic imports |
| `src/core/PluginRegistry.ts` | 3 | Registry storage typing |
| `src/db/adapter.ts` | 2 | Knex query builder `any` chains |
| `src/core/worker/workerChild.ts` | 2 | Capability signature verification |
| `src/core/worker/workerHost.ts` | 0 (other errors) | — |
| `src/gateway/fencing.ts` | 0 (other errors) | — |
| `src/cli/socket-server.ts` | 0 (other errors) | — |

---

### Task 1: Fix `src/db/adapter.ts` — Knex Query Builder Types

**Files:**
- Modify: `src/db/adapter.ts:1-90`
- Test: `tests/unit/db-adapter.test.ts` (existing, verify passes)

**Interfaces:**
- Consumes: `Knex` from `knex`, `ApolloConfig` from `../types/shared.js`
- Produces: Typed `getGuildData`, `setGuildData`, `getUserData`, `setUserData`, `getAllGuildData`, `getAllUserData`

- [ ] **Step 1: Write failing test for typed query builders**

```typescript
// tests/unit/db-adapter.test.ts (add to existing)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGuildData, setGuildData } from '../../src/db/adapter.js';

describe('db/adapter - typed queries', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getGuildData returns typed GuildData or null', async () => {
    // Mock knex to return typed data
    const result = await getGuildData('123456789');
    expect(result).toBeNull(); // or typed object
  });

  it('setGuildData accepts partial GuildData', async () => {
    await expect(setGuildData('123456789', { prefix: '!' })).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails (or passes with current any)**

Run: `pnpm test tests/unit/db-adapter.test.ts -v`
Expected: Current implementation uses `any` but tests may pass — verify types in IDE

- [ ] **Step 3: Fix `adapter.ts` — replace `any` with Knex generics**

```typescript
// src/db/adapter.ts
import Knex from 'knex';
import type { Knex } from 'knex';

// Replace line 18: const db: any = ...
const db: Knex = knex(config);

// Replace line 25-28: query builder chains with proper types
const row = await db('guild_data')
  .select('data')
  .where('guild_id', guildId)
  .first<{ data: string }>(); // <-- add generic

// Replace line 40-43: insert with proper typing
await db('guild_data')
  .insert({ guild_id: guildId, data: JSON.stringify(data) })
  .onConflict('guild_id')
  .merge({ data: JSON.stringify(data) });

// Update return types of all functions:
export async function getGuildData(guildId: string): Promise<GuildData | null>
export async function setGuildData(guildId: string, data: Partial<GuildData>): Promise<void>
export async function getUserData(userId: string): Promise<UserData | null>
export async function setUserData(userId: string, data: Partial<UserData>): Promise<void>
export async function getAllGuildData(): Promise<Array<{ guildId: string; data: GuildData }>>
export async function getAllUserData(): Promise<Array<{ userId: string; data: UserData }>>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/db-adapter.test.ts -v`
Run: `pnpm lint src/db/adapter.ts`
Expected: 0 `no-explicit-any` errors in adapter.ts

- [ ] **Step 5: Commit**

```bash
git add src/db/adapter.ts tests/unit/db-adapter.test.ts
git commit -m "fix(types): replace any with Knex generics in db/adapter.ts"
```

---

### Task 2: Fix `src/core/Plugin.ts` — Dynamic Import Return Types

**Files:**
- Modify: `src/core/Plugin.ts:165-171`
- Test: `tests/unit/plugin-base.test.ts` (new)

**Interfaces:**
- Consumes: `PluginCommand`, `PluginEvent` from `../types/shared.js`
- Produces: Typed `loadCommands()`, `loadEvents()` return values

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/plugin-base.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Plugin } from '../../src/core/Plugin.js';

describe('Plugin base class - typed dynamic imports', () => {
  it('loadCommands returns PluginCommand[]', async () => {
    // Mock import.meta.resolve or use test plugin
    const plugin = new (class extends Plugin {
      static id = 'test';
      static version = '1.0.0';
    })({} as any);
    // Test would need actual plugin dir — skip or use integration test
  });
});
```

- [ ] **Step 2: Fix `Plugin.ts` — add proper return types to dynamic imports**

```typescript
// src/core/Plugin.ts lines 165-171
// Before:
const commands = (await import(path)).default as any;
const events = (await import(path)).default as any;

// After:
import type { PluginCommand, PluginEvent } from '../types/shared.js';

// In loadCommands():
const commandModule = await import(commandPath) as { default: PluginCommand[] };
return commandModule.default ?? [];

// In loadEvents():
const eventModule = await import(eventPath) as { default: PluginEvent[] };
return eventModule.default ?? [];
```

- [ ] **Step 3: Run lint to verify fix**

Run: `pnpm lint src/core/Plugin.ts`
Expected: 0 `no-explicit-any` errors in Plugin.ts

- [ ] **Step 4: Commit**

```bash
git add src/core/Plugin.ts
git commit -m "fix(types): type dynamic imports in Plugin.ts loadCommands/loadEvents"
```

---

### Task 3: Fix `src/core/PluginLoader.ts` — Dynamic Import & Manifest Types

**Files:**
- Modify: `src/core/PluginLoader.ts:1-60`
- Test: `tests/unit/plugin-loader.test.ts` (existing, extend)

**Interfaces:**
- Consumes: `PluginManifest` from `../types/shared.js`, `verifyPluginFile` from `./pluginDownloader.js`
- Produces: `load()`, `getLoadedPlugin()`, `clearCache()` with proper types

- [ ] **Step 1: Examine current errors (lines 10, 11, 15, 16, 24, 55, 59)**

Lines with `any`:
- 10, 11: constructor params `client: any, manager: any`
- 15, 16: `_client: any, _manager: any`
- 24, 55: dynamic import return types
- 59: manifest parsing

- [ ] **Step 2: Fix constructor and property types**

```typescript
// src/core/PluginLoader.ts
import type { ApolloClient, PluginManager } from '../types/shared.js';
import type { PluginManifest, PluginClass } from '../types/shared.js';

export class PluginLoader {
  private _client: ApolloClient;
  private _manager: PluginManager;
  private _loadedPlugins: Map<string, { PluginClass: PluginClass; manifest: PluginManifest }> = new Map();

  constructor(client: ApolloClient, manager: PluginManager) {
    this._client = client;
    this._manager = manager;
  }

  // Fix load() dynamic import (line 55, 59)
  async load(baseDir: string): Promise<{ PluginClass: PluginClass; manifest: PluginManifest }> {
    // ...
    const pluginModule = await import(pluginPath) as { default: PluginClass };
    const PluginClass = pluginModule.default;
    // ...
    const manifest = await this._loadManifest(baseDir) as PluginManifest;
    // ...
  }
}
```

- [ ] **Step 3: Run lint to verify**

Run: `pnpm lint src/core/PluginLoader.ts`
Expected: 0 `no-explicit-any` errors

- [ ] **Step 4: Run existing tests**

Run: `pnpm test tests/unit/plugin-loader.test.ts -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/core/PluginLoader.ts
git commit -m "fix(types): type PluginLoader constructor, properties, and dynamic imports"
```

---

### Task 4: Fix `src/core/PluginEnabler.ts` — Worker Host & Client Types

**Files:**
- Modify: `src/core/PluginEnabler.ts:1-50`
- Test: `tests/unit/plugin-enabler.test.ts` (new)

**Interfaces:**
- Consumes: `ApolloClient`, `PluginManager`, `WorkerHost`, `EventBus` from `../types/shared.js`
- Produces: `enable()` with typed parameters

- [ ] **Step 1: Fix constructor and property types (lines 6-14)**

```typescript
// src/core/PluginEnabler.ts
import type { ApolloClient, PluginManager, WorkerHost, EventBus } from '../types/shared.js';

export class PluginEnabler {
  private _client: ApolloClient;
  private _manager: PluginManager;
  private _workerHost: WorkerHost;
  private _bus: EventBus;

  constructor(client: ApolloClient, manager: PluginManager, workerHost: WorkerHost, bus: EventBus) {
    this._client = client;
    this._manager = manager;
    this._workerHost = workerHost;
    this._bus = bus;
  }

  // Fix enable() method calls (lines 31, 36, 41)
  async enable(pluginId: string, PluginClass: PluginClass, manifest: PluginManifest): Promise<void> {
    // _workerHost.spawnWorker() - ensure WorkerHost has proper types
    // _bus.subscribe() - ensure EventBus has proper types
  }
}
```

- [ ] **Step 2: Run lint and tests**

Run: `pnpm lint src/core/PluginEnabler.ts`
Run: `pnpm test tests/unit/plugin-enabler.test.ts -v` (create minimal test if needed)

- [ ] **Step 3: Commit**

```bash
git add src/core/PluginEnabler.ts
git commit -m "fix(types): type PluginEnabler constructor and worker/bus references"
```

---

### Task 5: Fix `src/core/PluginDisabler.ts` — Worker & EventBus Types

**Files:**
- Modify: `src/core/PluginDisabler.ts:1-30`
- Test: `tests/unit/plugin-disabler.test.ts` (new)

**Interfaces:**
- Consumes: `WorkerHost`, `EventBus` from `../types/shared.js`
- Produces: `disable()` with typed parameters

- [ ] **Step 1: Fix types (lines 4, 5, 9, 10)**

```typescript
// src/core/PluginDisabler.ts
import type { WorkerHost, EventBus } from '../types/shared.js';

export class PluginDisabler {
  private _workerHost: WorkerHost;
  private _bus: EventBus;

  constructor(workerHost: WorkerHost, bus: EventBus) {
    this._workerHost = workerHost;
    this._bus = bus;
  }

  async disable(pluginId: string): Promise<void> {
    await this._workerHost.terminateWorker(pluginId);
    this._bus.unsubscribeAllForPlugin(pluginId);
  }
}
```

- [ ] **Step 2: Run lint and tests**

Run: `pnpm lint src/core/PluginDisabler.ts`
Expected: 0 `no-explicit-any` errors

- [ ] **Step 3: Commit**

```bash
git add src/core/PluginDisabler.ts
git commit -m "fix(types): type PluginDisabler workerHost and bus references"
```

---

### Task 6: Fix `src/core/PluginRegistry.ts` — Registry Storage Types

**Files:**
- Modify: `src/core/PluginRegistry.ts:40-41`
- Test: `tests/unit/plugin-registry.test.ts` (new)

**Interfaces:**
- Consumes: `PluginManifest` from `../types/shared.js`
- Produces: Typed registry Map

- [ ] **Step 1: Fix registry Map type**

```typescript
// src/core/PluginRegistry.ts
import type { PluginManifest } from '../types/shared.js';

private _plugins: Map<string, { manifest: PluginManifest; enabled: boolean }> = new Map();
// Replace: private _plugins: any = new Map();
```

- [ ] **Step 2: Run lint**

Run: `pnpm lint src/core/PluginRegistry.ts`
Expected: 0 `no-explicit-any` errors

- [ ] **Step 3: Commit**

```bash
git add src/core/PluginRegistry.ts
git commit -m "fix(types): type PluginRegistry internal Map"
```

---

### Task 7: Fix `src/core/PluginManager.ts` — Delegation Types (Largest Task)

**Files:**
- Modify: `src/core/PluginManager.ts:349-560`
- Test: `tests/unit/plugin-manager.test.ts` (existing, extend)

**Interfaces:**
- Consumes: All Plugin* sub-modules, `ApolloClient`, `PluginManifest`, `PluginClass`
- Produces: Public API with proper types

- [ ] **Step 1: Add proper imports**

```typescript
// src/core/PluginManager.ts top
import type { ApolloClient, PluginManifest, PluginClass } from '../types/shared.js';
import type { PluginLoader } from './PluginLoader.js';
import type { PluginEnabler } from './PluginEnabler.js';
import type { PluginDisabler } from './PluginDisabler.js';
import type { PluginReloader } from './PluginReloader.js';
import type { PluginInstaller } from './PluginInstaller.js';
```

- [ ] **Step 2: Type sub-module properties (lines 349-360)**

```typescript
private _loader: PluginLoader;
private _enabler: PluginEnabler;
private _disabler: PluginDisabler;
private _reloader: PluginReloader;
private _installer: PluginInstaller;

// Initialize in constructor with proper types
this._loader = new PluginLoader(this.client, this);
this._enabler = new PluginEnabler(this.client, this, this._workerHost, this._bus);
this._disabler = new PluginDisabler(this._workerHost, this._bus);
this._reloader = new PluginReloader(this._loader, this._enabler, this._disabler);
this._installer = new PluginInstaller();
```

- [ ] **Step 3: Fix delegation methods (lines 374-560)**

Replace all `(plugin as any)._enabled` with `plugin.enabled` (getter added in Phase 3)
Replace `(plugin as any)._loaded` with `plugin.loaded`
Replace `(plugin as any)._dir` with `plugin.directory`

```typescript
// Example fix for enablePlugin (line 374-376)
async enablePlugin(pluginId: string): Promise<void> {
  const plugin = this._plugins.get(pluginId);
  if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
  if (plugin.enabled) return; // Use getter instead of (plugin as any)._enabled
  
  await this._enabler.enable(pluginId, plugin.PluginClass, plugin.manifest);
  plugin.enabled = true; // Use setter
}
```

- [ ] **Step 4: Fix listPlugins/scanPlugins/installedPlugins return types**

```typescript
listPlugins(): PluginInfo[] {
  return Array.from(this._plugins.values()).map(p => ({
    id: p.manifest.id,
    version: p.manifest.version,
    enabled: p.enabled, // getter
    loaded: p.loaded,   // getter
    directory: p.directory // getter
  }));
}
```

- [ ] **Step 5: Run lint and tests**

Run: `pnpm lint src/core/PluginManager.ts`
Expected: 0 `no-explicit-any` errors (was 24)

Run: `pnpm test tests/unit/plugin-manager.test.ts -v` (or full core test suite)

- [ ] **Step 6: Commit**

```bash
git add src/core/PluginManager.ts
git commit -m "fix(types): eliminate any in PluginManager delegation to sub-modules"
```

---

### Task 8: Fix `src/core/worker/workerChild.ts` — Capability Signature Types

**Files:**
- Modify: `src/core/worker/workerChild.ts:67-100`
- Test: `tests/unit/worker-capability-signature.test.ts` (existing)

**Interfaces:**
- Consumes: `SignedCapabilities` from `../capabilitySignature.js`
- Produces: Typed capability verification

- [ ] **Step 1: Fix capability verification types**

```typescript
// src/core/worker/workerChild.ts
import type { SignedCapabilities } from '../capabilitySignature.js';

// Line 67: const capabilities: any = JSON.parse(...)
const capabilities: SignedCapabilities | string[] = JSON.parse(process.env.PLUGIN_CAPABILITIES ?? '[]');

// Line 74-80: verify signature with proper types
if (isSignedCapabilities(capabilities)) {
  const { pluginId, capabilities: caps, issuedAt, signature } = capabilities;
  // verifySignature(caps, pluginId, issuedAt, signature)
}

// Line 93: capabilities.map((c: any) => c)
const allowedCapabilities = new Set(
  Array.isArray(capabilities) 
    ? capabilities 
    : capabilities.capabilities
);

// Type guard helper
function isSignedCapabilities(c: unknown): c is SignedCapabilities {
  return typeof c === 'object' && c !== null && 'signature' in c;
}
```

- [ ] **Step 2: Run lint and existing tests**

Run: `pnpm lint src/core/worker/workerChild.ts`
Run: `pnpm test tests/unit/worker-capability-signature.test.ts -v`

- [ ] **Step 3: Commit**

```bash
git add src/core/worker/workerChild.ts
git commit -m "fix(types): type capability verification in workerChild.ts"
```

---

### Task 9: Fix Remaining Files — `PluginInstaller.ts`, `pluginDownloader.ts`, `fencing.ts`, `socket-server.ts`

**Files:**
- Modify: `src/core/PluginInstaller.ts:88, 108, 112`
- Modify: `src/core/pluginDownloader.ts:1, 226`
- Modify: `src/gateway/fencing.ts` (if any)
- Modify: `src/cli/socket-server.ts:82` (floating promise)

**Interfaces:** Various internal types

- [ ] **Step 1: Fix each file's specific issues**

```typescript
// PluginInstaller.ts line 88, 108, 112
// Replace: const manifest: any = JSON.parse(...)
const manifest: PluginManifest = JSON.parse(...);

// pluginDownloader.ts line 1
import { readFileSync } from 'fs'; // remove unused or prefix with _

// pluginDownloader.ts line 226
// Use ?? instead of ||
const value = obj.prop ?? defaultValue;

// socket-server.ts line 82
// Add void or .catch()
void somePromise();
// or
somePromise().catch(err => console.error(err));
```

- [ ] **Step 2: Run lint on all**

Run: `pnpm lint src/core/PluginInstaller.ts src/core/pluginDownloader.ts src/gateway/fencing.ts src/cli/socket-server.ts`

- [ ] **Step 3: Commit**

```bash
git add src/core/PluginInstaller.ts src/core/pluginDownloader.ts src/gateway/fencing.ts src/cli/socket-server.ts
git commit -m "fix(types): eliminate remaining explicit any in core files"
```

---

### Task 10: Full Verification & Cleanup

**Files:** All modified files

- [ ] **Step 1: Run full lint**

Run: `pnpm lint`
Expected: 0 `no-explicit-any` errors in `src/**/*.ts` (tests/ mocks/ may still have warnings)

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: No new failures (494 pre-existing i18next mock failures acceptable)

- [ ] **Step 3: Run TypeScript check**

Run: `pnpm tsc --noEmit`
Expected: 0 errors (only pre-existing in node_modules)

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix(types): final verification - all explicit any eliminated from src/"
```

---

## Execution Notes

- **Order matters:** Tasks 1-6 are independent and can run in parallel. Task 7 (PluginManager) depends on Tasks 3-6 interfaces. Tasks 8-9 depend on Task 7.
- **TDD per file:** Write test → verify fail → fix → verify pass → commit
- **Don't fix tests/ or mocks/**: They're ESLint-ignored and have different standards
- **Use `unknown` + type guards** for dynamic values (JSON.parse, dynamic imports)
- **Prefer interfaces from `../types/shared.js`** — extend if needed
- **If a type truly can't be known**, use `unknown` with narrowing, not `any`

---

## Estimated Effort

- Tasks 1-6: ~30 min each (independent, small files)
- Task 7: ~60 min (largest, many delegation points)
- Tasks 8-9: ~20 min each
- Task 10: ~15 min

**Total: ~4-5 hours** with subagent-driven parallel execution on Tasks 1-6.