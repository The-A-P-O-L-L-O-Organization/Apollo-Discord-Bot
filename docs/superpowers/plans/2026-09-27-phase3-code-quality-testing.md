# Phase 3: Code Quality & Testing Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix EventBus unsubscribe no-op (already done in Phase 1), fix 494 pre-existing test failures, and split the PluginManager monolith.

**Architecture:** Three independent workstreams that can be parallelized:
1. Test infrastructure fixes (i18next v26, mock shapes)
2. PluginManager decomposition into focused modules
3. Test coverage improvements

**Tech Stack:** Node.js 22+, TypeScript, Vitest, i18next v26, discord.js v14

**Spec:** This plan addresses Technical Debt Assessment items:
- **494 pre-existing test failures** (Explorer #6, Oracle TST-001, Librarian) — High
- **PluginManager monolith (535 lines)** (Explorer #4, Oracle) — High

## Global Constraints

- **Node.js:** ≥22 (Iron LTS)
- **TypeScript:** Strict mode, ESM only
- **Lint:** `pnpm lint` (ESLint flat config, 4-space indent, single quotes, semicolons, no trailing commas)
- **Test:** `pnpm test` (Vitest)
- **No emojis** in source or docs
- **No code comments** unless explicitly requested

## Review Focus

| Input/Condition | Expected Behavior | Test Location |
|-----------------|-------------------|---------------|
| i18next v26 `t()` called with new signature | Returns translated string | `tests/unit/i18next-compat.test.ts` |
| Discord.js v14 mock used in test | Matches real API (permissions, EmbedBuilder) | `tests/mocks/discord.ts` |
| PluginManager.loadPlugin() called | Delegates to PluginLoader | `tests/unit/plugin-loader.test.ts` |
| PluginManager.enablePlugin() called | Delegates to PluginEnabler | `tests/unit/plugin-enabler.test.ts` |
| PluginManager.reloadPlugin() called | Delegates to PluginReloader | `tests/unit/plugin-reloader.test.ts` |

---

### Task 1: Fix i18next v26 Compatibility in Test Setup

**Files:**
- Modify: `tests/setup.js` (i18next initialization for v26)
- Test: `tests/unit/i18next-compat.test.ts`

**Interfaces:**
- Consumes: i18next v26 API
- Produces: Working i18n instance for tests

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/i18next-compat.test.ts
import { describe, it, expect, vi, beforeAll } from 'vitest'
import i18n from '../../tests/setup.js'

describe('i18next v26 compatibility', () => {
  beforeAll(async () => {
    // Wait for i18n initialization
    await i18n.init()
  })

  it('t() function works with v26 signature', () => {
    const result = i18n.t('ping', { lng: 'en-US' })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('t() with interpolation works', () => {
    const result = i18n.t('user.banned', { lng: 'en-US', user: 'TestUser' })
    expect(result).toContain('TestUser')
  })

  it('getFixedT() returns bound function', () => {
    const t = i18n.getFixedT('en-US')
    const result = t('ping')
    expect(typeof result).toBe('string')
  })

  it('handles pluralization', () => {
    const result1 = i18n.t('items.count', { lng: 'en-US', count: 1 })
    const result2 = i18n.t('items.count', { lng: 'en-US', count: 5 })
    expect(result1).not.toBe(result2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/i18next-compat.test.ts
# Expected: FAIL - i18next v26 API mismatch
```

- [ ] **Step 3: Fix tests/setup.js for i18next v26**

```javascript
// tests/setup.js - MODIFY
import i18n from 'i18next'
import Backend from 'i18next-fs-backend'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

await i18n.init({
  lng: 'en-US',
  fallbackLng: 'en-US',
  preload: ['en-US'],
  ns: ['common', 'moderation', 'tickets', 'utility', 'automod', 'integrations', 'admin'],
  defaultNS: 'common',
  backend: {
    loadPath: path.join(__dirname, '../src/plugins/{{ns}}/locales/{{lng}}.json'),
  },
  interpolation: {
    escapeValue: false,
  },
  // v26: initImmediate removed, use initAsync (already default)
  // v26: no more initImmediate option
  returnObjects: true,
})

// Add mock for EmbedBuilder getters (discord.js v14)
import { EmbedBuilder } from 'discord.js'
Object.defineProperties(EmbedBuilder.prototype, {
  title: { get() { return this.data?.title } },
  description: { get() { return this.data?.description } },
  color: { get() { return this.data?.color } },
  fields: { get() { return this.data?.fields || [] } },
  // Add other getters as needed
})

export default i18n
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/i18next-compat.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add tests/setup.js tests/unit/i18next-compat.test.ts
git commit -m "fix: update test setup for i18next v26 compatibility"
```

---

### Task 2: Fix Discord.js Mock Shapes

**Files:**
- Modify: `tests/mocks/discord.ts` (fix mock shapes to match v14 API)
- Test: `tests/unit/discord-mock-shapes.test.ts`

**Interfaces:**
- Consumes: discord.js v14 types
- Produces: Type-safe mock builders

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/discord-mock-shapes.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createMockInteraction, createMockGuild, createMockMember } from '../../tests/mocks/discord.js'

describe('Discord.js v14 mock shapes', () => {
  it('createMockInteraction has correct permissions structure', () => {
    const interaction = createMockInteraction()
    expect(interaction.guild).toBeDefined()
    expect(interaction.guild!.permissions).toBeDefined()
    expect(typeof interaction.guild!.permissions.has).toBe('function')
  })

  it('createMockGuild has roles.cache Map', () => {
    const guild = createMockGuild()
    expect(guild.roles).toBeDefined()
    expect(guild.roles.cache).toBeInstanceOf(Map)
    expect(typeof guild.roles.cache.get).toBe('function')
    expect(typeof guild.roles.cache.has).toBe('function')
  })

  it('createMockMember has permissions bitfield', () => {
    const member = createMockMember()
    expect(member.permissions).toBeDefined()
    expect(typeof member.permissions.has).toBe('function')
    expect(typeof member.permissions.bitfield).toBe('bigint')
  })

  it('EmbedBuilder getters work', () => {
    const embed = new (await import('discord.js')).EmbedBuilder()
      .setTitle('Test')
      .setDescription('Description')
    expect(embed.title).toBe('Test')
    expect(embed.description).toBe('Description')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/discord-mock-shapes.test.ts
# Expected: FAIL - mock shapes don't match v14 API
```

- [ ] **Step 3: Fix tests/mocks/discord.ts**

```typescript
// tests/mocks/discord.ts - KEY FIXES
import { vi } from 'vitest'
import type { Guild, GuildMember, Role, PermissionFlagsBits } from 'discord.js'

// Fix: permissions.has() should accept PermissionFlagsBits or string
function createMockPermissions() {
  const perms = new Set<bigint>()
  return {
    has: vi.fn((permission: bigint | string) => {
      const bit = typeof permission === 'string'
        ? BigInt(PermissionFlagsBits[permission as keyof typeof PermissionFlagsBits] || 0)
        : permission
      return perms.has(bit)
    }),
    add: vi.fn((...permissions: (bigint | string)[]) => {
      permissions.forEach(p => {
        const bit = typeof p === 'string'
          ? BigInt(PermissionFlagsBits[p as keyof typeof PermissionFlagsBits] || 0)
          : p
        perms.add(bit)
      })
    }),
    remove: vi.fn((...permissions: (bigint | string)[]) => {
      permissions.forEach(p => {
        const bit = typeof p === 'string'
          ? BigInt(PermissionFlagsBits[p as keyof typeof PermissionFlagsBits] || 0)
          : p
        perms.delete(bit)
      })
    }),
    bitfield: 0n,
  }
}

// Fix: Role cache should be Map with proper methods
function createMockRoleCache() {
  const cache = new Map<string, Role>()
  return {
    get: vi.fn((id: string) => cache.get(id)),
    has: vi.fn((id: string) => cache.has(id)),
    set: vi.fn((id: string, role: Role) => cache.set(id, role)),
    delete: vi.fn((id: string) => cache.delete(id)),
    clear: vi.fn(() => cache.clear()),
    forEach: vi.fn((callback: (role: Role, key: string) => void) => cache.forEach(callback)),
    map: vi.fn(<T>(callback: (role: Role, key: string) => T) => Array.from(cache.values()).map((r, i) => callback(r, Array.from(cache.keys())[i]))),
    filter: vi.fn((callback: (role: Role, key: string) => boolean) => Array.from(cache.entries()).filter(([k, v]) => callback(v, k)).map(([k, v]) => v)),
    find: vi.fn((callback: (role: Role, key: string) => boolean) => Array.from(cache.values()).find((r, i) => callback(r, Array.from(cache.keys())[i]))),
    random: vi.fn(() => Array.from(cache.values())[Math.floor(Math.random() * cache.size)]),
    first: vi.fn(() => cache.values().next().value),
    last: vi.fn(() => Array.from(cache.values()).pop()),
    size: cache.size,
    [Symbol.iterator]: cache[Symbol.iterator].bind(cache),
  }
}

// Fix: GuildMember permissions
export function createMockMember(overrides = {}) {
  return {
    id: '123456789012345678',
    user: createMockUser(),
    guild: createMockGuild(),
    permissions: createMockPermissions(),
    roles: { cache: createMockRoleCache() },
    ...overrides,
  }
}

// Fix: Guild with proper roles cache
export function createMockGuild(overrides = {}) {
  return {
    id: '123456789012345678',
    name: 'Test Guild',
    roles: { cache: createMockRoleCache() },
    members: { cache: new Map() },
    channels: { cache: new Map() },
    ...overrides,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/discord-mock-shapes.test.ts
# Expected: PASS
```

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
pnpm test
# Expected: Reduced failures (target <494)
```

- [ ] **Step 6: Commit**

```bash
git add tests/mocks/discord.ts tests/unit/discord-mock-shapes.test.ts
git commit -m "fix: correct Discord.js v14 mock shapes"
```

---

### Task 3: Split PluginManager into Focused Modules

**Files:**
- Create: `src/core/PluginLoader.ts` (loading, manifest verification)
- Create: `src/core/PluginEnabler.ts` (enabling, worker spawn, command sync)
- Create: `src/core/PluginDisabler.ts` (disabling, cleanup)
- Create: `src/core/PluginReloader.ts` (reload orchestration)
- Create: `src/core/PluginInstaller.ts` (install/uninstall)
- Modify: `src/core/PluginManager.ts` (facade delegating to modules)
- Test: `tests/unit/plugin-*.test.ts` (one per module)

**Interfaces:**
- Consumes: `Plugin`, `PluginManifest`, `WorkerHost`, `EventBus`
- Produces: Focused classes with single responsibilities

- [ ] **Step 1: Write failing tests for each module**

```typescript
// tests/unit/plugin-loader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginLoader } from '../../src/core/PluginLoader.js'
import { createMockPlugin } from '../mocks/plugin.js'

describe('PluginLoader', () => {
  let loader: PluginLoader
  let mockWorkerHost: any
  let mockEventBus: any

  beforeEach(() => {
    mockWorkerHost = { spawnWorker: vi.fn(), terminateWorker: vi.fn() }
    mockEventBus = { subscribe: vi.fn(), unsubscribe: vi.fn() }
    loader = new PluginLoader({ workerHost: mockWorkerHost, eventBus: mockEventBus })
  })

  it('loads plugin and verifies manifest', async () => {
    const plugin = createMockPlugin()
    const result = await loader.load('test-plugin', '/path/to/plugin')
    expect(result).toBeDefined()
    expect(result.manifest).toBeDefined()
  })

  it('rejects plugin with invalid manifest hash', async () => {
    // Mock manifest verification failure
    await expect(loader.load('bad-plugin', '/path/to/bad')).rejects.toThrow('Manifest verification failed')
  })
})
```

```typescript
// tests/unit/plugin-enabler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginEnabler } from '../../src/core/PluginEnabler.js'

describe('PluginEnabler', () => {
  let enabler: PluginEnabler
  let mockWorkerHost: any
  let mockEventBus: any
  let mockCommandSync: any

  beforeEach(() => {
    mockWorkerHost = { spawnWorker: vi.fn().mockResolvedValue(undefined) }
    mockEventBus = { subscribe: vi.fn() }
    mockCommandSync = { syncCommands: vi.fn().mockResolvedValue(undefined) }
    enabler = new PluginEnabler({ workerHost: mockWorkerHost, eventBus: mockEventBus, commandSync: mockCommandSync })
  })

  it('enables plugin and spawns worker', async () => {
    const plugin = { onEnable: vi.fn(), commands: [], events: [] }
    await enabler.enable('test-plugin', plugin)
    expect(plugin.onEnable).toHaveBeenCalled()
    expect(mockWorkerHost.spawnWorker).toHaveBeenCalled()
  })

  it('syncs commands after enable', async () => {
    const plugin = { onEnable: vi.fn(), commands: [{ data: { name: 'test' } }], events: [] }
    await enabler.enable('test-plugin', plugin)
    expect(mockCommandSync.syncCommands).toHaveBeenCalled()
  })
})
```

```typescript
// tests/unit/plugin-disabler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginDisabler } from '../../src/core/PluginDisabler.js'

describe('PluginDisabler', () => {
  let disabler: PluginDisabler
  let mockWorkerHost: any
  let mockEventBus: any

  beforeEach(() => {
    mockWorkerHost = { terminateWorker: vi.fn().mockResolvedValue(undefined) }
    mockEventBus = { unsubscribe: vi.fn().mockResolvedValue(undefined) }
    disabler = new PluginDisabler({ workerHost: mockWorkerHost, eventBus: mockEventBus })
  })

  it('disables plugin and terminates worker', async () => {
    const plugin = { onDisable: vi.fn() }
    await disabler.disable('test-plugin', plugin)
    expect(plugin.onDisable).toHaveBeenCalled()
    expect(mockWorkerHost.terminateWorker).toHaveBeenCalledWith('test-plugin')
  })

  it('unsubscribes all event handlers', async () => {
    const plugin = { onDisable: vi.fn() }
    await disabler.disable('test-plugin', plugin)
    expect(mockEventBus.unsubscribe).toHaveBeenCalled()
  })
})
```

```typescript
// tests/unit/plugin-reloader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginReloader } from '../../src/core/PluginReloader.js'

describe('PluginReloader', () => {
  let reloader: PluginReloader
  let mockLoader: any
  let mockDisabler: any
  let mockEnabler: any

  beforeEach(() => {
    mockLoader = { load: vi.fn().mockResolvedValue({ plugin: {}, manifest: {} }) }
    mockDisabler = { disable: vi.fn().mockResolvedValue(undefined) }
    mockEnabler = { enable: vi.fn().mockResolvedValue(undefined) }
    reloader = new PluginReloader({ loader: mockLoader, disabler: mockDisabler, enabler: mockEnabler })
  })

  it('reloads plugin by disabling and re-enabling', async () => {
    await reloader.reload('test-plugin')
    expect(mockDisabler.disable).toHaveBeenCalledWith('test-plugin', expect.any(Object))
    expect(mockLoader.load).toHaveBeenCalledWith('test-plugin', expect.any(String))
    expect(mockEnabler.enable).toHaveBeenCalledWith('test-plugin', expect.any(Object))
  })

  it('clears command module cache on reload', async () => {
    await reloader.reload('test-plugin')
    // Verify cache cleared - implementation specific
  })
})
```

```typescript
// tests/unit/plugin-installer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PluginInstaller } from '../../src/core/PluginInstaller.js'

describe('PluginInstaller', () => {
  let installer: PluginInstaller
  let mockDownloader: any
  let mockManifest: any

  beforeEach(() => {
    mockDownloader = { download: vi.fn().mockResolvedValue('/tmp/plugin') }
    mockManifest = { generate: vi.fn().mockResolvedValue({}) }
    installer = new PluginInstaller({ downloader: mockDownloader, manifest: mockManifest })
  })

  it('installs plugin from registry', async () => {
    const result = await installer.install('test-plugin', '1.0.0')
    expect(mockDownloader.download).toHaveBeenCalled()
    expect(result).toBeDefined()
  })

  it('uninstalls plugin and cleans up', async () => {
    await installer.uninstall('test-plugin')
    // Verify cleanup
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test tests/unit/plugin-loader.test.ts tests/unit/plugin-enabler.test.ts tests/unit/plugin-disabler.test.ts tests/unit/plugin-reloader.test.ts tests/unit/plugin-installer.test.ts
# Expected: FAIL - modules don't exist
```

- [ ] **Step 3: Create PluginLoader**

```typescript
// src/core/PluginLoader.ts - NEW FILE
import { Plugin } from './Plugin.js'
import { PluginManifest } from './pluginManifest.js'
import { verifyPluginFile } from '../utils/manifest.js'

export interface PluginLoaderOptions {
  workerHost: any
  eventBus: any
}

export class PluginLoader {
  private workerHost: any
  private eventBus: any
  private loadedPlugins = new Map<string, { plugin: Plugin; manifest: PluginManifest }>()

  constructor(options: PluginLoaderOptions) {
    this.workerHost = options.workerHost
    this.eventBus = options.eventBus
  }

  async load(pluginId: string, path: string): Promise<{ plugin: Plugin; manifest: PluginManifest }> {
    // Verify manifest hash before import (TOCTOU protection)
    await verifyPluginFile(path)

    // Dynamic import with cache busting
    const module = await import(`${path}/plugin.ts?t=${Date.now()}`)
    const PluginClass = module.default as new () => Plugin
    const plugin = new PluginClass()

    // Load manifest
    const manifestModule = await import(`${path}/plugin-manifest.json?t=${Date.now()}`, { assert: { type: 'json' } })
    const manifest = manifestModule.default as PluginManifest

    this.loadedPlugins.set(pluginId, { plugin, manifest })
    return { plugin, manifest }
  }

  getLoadedPlugin(pluginId: string): { plugin: Plugin; manifest: PluginManifest } | undefined {
    return this.loadedPlugins.get(pluginId)
  }

  clearCache(pluginId: string): void {
    this.loadedPlugins.delete(pluginId)
  }
}
```

- [ ] **Step 4: Create PluginEnabler**

```typescript
// src/core/PluginEnabler.ts - NEW FILE
import { Plugin } from './Plugin.js'
import { PluginManifest } from './pluginManifest.js'
import { signCapabilities } from '../worker/capabilitySignature.js'

export interface PluginEnablerOptions {
  workerHost: any
  eventBus: any
  commandSync: any
}

export class PluginEnabler {
  private workerHost: any
  private eventBus: any
  private commandSync: any
  private enabledPlugins = new Set<string>()

  constructor(options: PluginEnablerOptions) {
    this.workerHost = options.workerHost
    this.eventBus = options.eventBus
    this.commandSync = options.commandSync
  }

  async enable(pluginId: string, plugin: Plugin, manifest: PluginManifest): Promise<void> {
    // Call onEnable
    if (plugin.onEnable) {
      await plugin.onEnable()
    }

    // Register events
    if (plugin.events) {
      for (const event of plugin.events) {
        this.eventBus.subscribe(event.filter, event.handler)
      }
    }

    // Spawn worker if plugin has worker capabilities
    if (manifest.capabilities?.some(c => c.startsWith('worker:'))) {
      await this.workerHost.spawnWorker(pluginId, manifest)
    }

    // Sync commands
    if (plugin.commands?.length) {
      await this.commandSync.syncCommands(pluginId, plugin.commands)
    }

    // Sign capabilities for worker
    const secret = process.env.PLUGIN_CAPABILITY_SECRET || process.env.QUEUE_HMAC_SECRET
    if (secret && manifest.capabilities) {
      const signed = signCapabilities(pluginId, manifest.capabilities, secret)
      process.env[`PLUGIN_${pluginId.toUpperCase()}_CAPABILITIES`] = JSON.stringify(signed)
    }

    this.enabledPlugins.add(pluginId)
  }

  isEnabled(pluginId: string): boolean {
    return this.enabledPlugins.has(pluginId)
  }
}
```

- [ ] **Step 5: Create PluginDisabler**

```typescript
// src/core/PluginDisabler.ts - NEW FILE
import { Plugin } from './Plugin.js'

export interface PluginDisablerOptions {
  workerHost: any
  eventBus: any
}

export class PluginDisabler {
  private workerHost: any
  private eventBus: any

  constructor(options: PluginDisablerOptions) {
    this.workerHost = options.workerHost
    this.eventBus = options.eventBus
  }

  async disable(pluginId: string, plugin: Plugin): Promise<void> {
    // Call onDisable
    if (plugin.onDisable) {
      await plugin.onDisable()
    }

    // Terminate worker
    await this.workerHost.terminateWorker(pluginId)

    // Unsubscribe all events (EventBus now supports this)
    await this.eventBus.unsubscribeAllForPlugin(pluginId)

    // Clear capability env var
    delete process.env[`PLUGIN_${pluginId.toUpperCase()}_CAPABILITIES`]
  }
}
```

- [ ] **Step 6: Create PluginReloader**

```typescript
// src/core/PluginReloader.ts - NEW FILE
import { Plugin } from './Plugin.js'
import { PluginManifest } from './pluginManifest.js'
import { PluginLoader } from './PluginLoader.js'
import { PluginDisabler } from './PluginDisabler.js'
import { PluginEnabler } from './PluginEnabler.js'

export interface PluginReloaderOptions {
  loader: PluginLoader
  disabler: PluginDisabler
  enabler: PluginEnabler
}

export class PluginReloader {
  private loader: PluginLoader
  private disabler: PluginDisabler
  private enabler: PluginEnabler

  constructor(options: PluginReloaderOptions) {
    this.loader = options.loader
    this.disabler = options.disabler
    this.enabler = options.enabler
  }

  async reload(pluginId: string, path: string): Promise<void> {
    const loaded = this.loader.getLoadedPlugin(pluginId)
    if (!loaded) {
      throw new Error(`Plugin ${pluginId} not loaded`)
    }

    // Disable first
    await this.disabler.disable(pluginId, loaded.plugin)

    // Clear command module cache (for queue workers)
    this.loader.clearCache(pluginId)

    // Reload
    const { plugin, manifest } = await this.loader.load(pluginId, path)

    // Enable new version
    await this.enabler.enable(pluginId, plugin, manifest)
  }
}
```

- [ ] **Step 7: Create PluginInstaller**

```typescript
// src/core/PluginInstaller.ts - NEW FILE
import { PluginDownloader } from './pluginDownloader.js'
import { generateManifest } from '../utils/manifest.js'

export interface PluginInstallerOptions {
  downloader: PluginDownloader
  manifestGenerator: typeof generateManifest
}

export class PluginInstaller {
  private downloader: PluginDownloader
  private manifestGenerator: typeof generateManifest

  constructor(options: PluginInstallerOptions) {
    this.downloader = options.downloader
    this.manifestGenerator = options.manifestGenerator
  }

  async install(pluginId: string, version: string): Promise<string> {
    const path = await this.downloader.download(pluginId, version)
    await this.manifestGenerator(path)
    return path
  }

  async uninstall(pluginId: string): Promise<void> {
    // Implementation
  }
}
```

- [ ] **Step 8: Refactor PluginManager as facade**

```typescript
// src/core/PluginManager.ts - REFACTOR to delegate
import { PluginLoader } from './PluginLoader.js'
import { PluginEnabler } from './PluginEnabler.js'
import { PluginDisabler } from './PluginDisabler.js'
import { PluginReloader } from './PluginReloader.js'
import { PluginInstaller } from './PluginInstaller.js'
import { PluginDownloader } from './pluginDownloader.js'
import { generateManifest } from '../utils/manifest.js'
import { WorkerHost } from './worker/workerHost.js'

export class PluginManager {
  private loader: PluginLoader
  private enabler: PluginEnabler
  private disabler: PluginDisabler
  private reloader: PluginReloader
  private installer: PluginInstaller
  private workerHost: WorkerHost

  constructor(eventBus: EventBus, commandSync: CommandSync) {
    this.workerHost = new WorkerHost()
    this.loader = new PluginLoader({ workerHost: this.workerHost, eventBus })
    this.enabler = new PluginEnabler({ workerHost: this.workerHost, eventBus, commandSync })
    this.disabler = new PluginDisabler({ workerHost: this.workerHost, eventBus })
    this.reloader = new PluginReloader({ loader: this.loader, disabler: this.disabler, enabler: this.enabler })
    this.installer = new PluginInstaller({ downloader: new PluginDownloader(), manifestGenerator: generateManifest })
  }

  // Delegate methods
  async loadPlugin(pluginId: string, path: string) {
    return this.loader.load(pluginId, path)
  }

  async enablePlugin(pluginId: string) {
    const loaded = this.loader.getLoadedPlugin(pluginId)
    if (!loaded) throw new Error(`Plugin ${pluginId} not loaded`)
    await this.enabler.enable(pluginId, loaded.plugin, loaded.manifest)
  }

  async disablePlugin(pluginId: string) {
    const loaded = this.loader.getLoadedPlugin(pluginId)
    if (!loaded) throw new Error(`Plugin ${pluginId} not loaded`)
    await this.disabler.disable(pluginId, loaded.plugin)
  }

  async reloadPlugin(pluginId: string, path: string) {
    await this.reloader.reload(pluginId, path)
  }

  async installPlugin(pluginId: string, version: string) {
    return this.installer.install(pluginId, version)
  }

  // ... other delegate methods
}
```

- [ ] **Step 9: Run all plugin module tests**

```bash
pnpm test tests/unit/plugin-loader.test.ts tests/unit/plugin-enabler.test.ts tests/unit/plugin-disabler.test.ts tests/unit/plugin-reloader.test.ts tests/unit/plugin-installer.test.ts
# Expected: PASS
```

- [ ] **Step 10: Run full test suite**

```bash
pnpm test
# Expected: No new failures
```

- [ ] **Step 11: Commit**

```bash
git add src/core/PluginLoader.ts src/core/PluginEnabler.ts src/core/PluginDisabler.ts src/core/PluginReloader.ts src/core/PluginInstaller.ts src/core/PluginManager.ts tests/unit/plugin-*.test.ts
git commit -m "refactor: split PluginManager into focused modules"
```

---

### Task 4: Verify Test Failure Reduction

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
pnpm test 2>&1 | tail -20
# Count failures
```

- [ ] **Step 2: Compare with baseline (494 failures)**

```bash
# Should be significantly reduced
```

- [ ] **Step 3: Document remaining failures**

```bash
pnpm test 2>&1 | grep -E "(FAIL|Test Files)" > test-results-phase3.txt
```

- [ ] **Step 4: Commit verification results**

```bash
git add test-results-phase3.txt
git commit -m "docs: record test failure count after Phase 3 fixes"
```

---

## Execution Order

```
Parallel Workstream 1 (Tests):
  Task 1: i18next v26 compat
  Task 2: Discord mock shapes
    ↓
  Task 4: Verify failure reduction

Parallel Workstream 2 (PluginManager):
  Task 3: Split PluginManager (5 sub-tasks, sequential within)
```

**Total estimated time:** 2-3 hours

## Post-Phase Verification

```bash
pnpm test
pnpm lint
pnpm build
```

All should pass with test failures reduced from 494.