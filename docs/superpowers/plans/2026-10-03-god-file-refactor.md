# God File Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 7 god/monolithic files in Apollo (~4,600 lines) into focused single-responsibility modules while preserving all public behavior and import paths.

**Architecture:** Three refactor patterns applied per file: (1) **barrel re-export** — each god util becomes a thin re-export barrel so every existing import path keeps working; (2) **per-subcommand extraction** — god command files become thin dispatchers importing per-subcommand handler modules from a subdirectory (invisible to `deploy-commands.ts`, which scans `commands/` non-recursively); (3) **coordinator delegation** — `PluginManager` delegates to extracted focused modules, keeping its public surface identical. Phases are independent; each produces working software and can be executed or reviewed separately.

**Tech Stack:** TypeScript (ESM, `"type": "module"`, `.js` extensions in relative imports), Vitest, ESLint flat config, pnpm workspaces, Node >= 26.0.0.

**Spec:** God-file analysis (2026-10-03): explorer deep-dive + orchestrator verification. Key findings are embedded inline in this plan (module move maps, config drift, importer counts). No separate spec doc — this plan argues from the verified analysis.

## Global Constraints

- pnpm only — never `npm`/`npx`/`yarn`. Run scripts with `pnpm <script>`.
- ESM only. Relative imports use `.js` extensions even for `.ts` files.
- TypeScript source only (`.ts`). Node >= 26.0.0.
- ESLint flat config: 4-space indent, single quotes, semicolons, no trailing commas, `eqeqeq`, `curly: all`. Unused args prefixed with `_`.
- No emojis in source or docs. No new code comments; comments inside MOVED code are preserved verbatim.
- `pnpm manifest` must be re-run and `plugin-manifest.json` committed after ANY change to files under `src/plugins/` — `scripts/generate-manifest.mjs` hashes every file under `src/plugins/` recursively.
- Behavior preservation: all existing tests must pass UNCHANGED at every task boundary, except the tests explicitly updated by Task 2's config unification.
- Module-level side effects (the `setInterval` bootstrap in `automodSpam.ts`) must be preserved: barrels import the module containing them, so the side effect still fires at import time.
- Dependency-direction rule for every split: no circular runtime imports. Barrels import all modules; leaf modules import only what they use.

## Review Focus

1. Slash command registration surface must be byte-identical after extraction (subcommand names, descriptions, options, choices, ordering) — pinned by `tests/commands/automod.test.ts` (Task 2) and `tests/commands/analytics.test.ts` (Task 8).
2. Automod config unification (Task 2) intentionally fixes a latent bug: the command's local `getAutomodConfig` throws `TypeError` when a guild has no stored automod config (`guildConfig['enabled']` on null). After unification, guilds with no stored config receive defaults. Verify no error reply is produced for fresh guilds.
3. Automod checking behavior (SimHash burst spam, leetspeak normalization, thresholds, Redis fallback) unchanged — pinned by `tests/utils/automod.test.ts` + `tests/utils/automod-redis.test.ts` (Task 1). Note: neither test file references `getAutomodConfig` (verified by grep), so adding the `raidDetection` field in Task 1 breaks no tests.
4. analyticsCollector flush timing (critical vs regular), map-clear semantics, and the 24-importer surface unchanged — pinned by `tests/utils/analyticsCollector.test.ts` + `tests/commands/analytics.test.ts` (Task 3).
5. PluginManager dependency ordering, parallel enablement, TOCTOU manifest verification, and installed-plugin worker startup unchanged — pinned by `tests/core/PluginManager.test.ts`, `tests/core/PluginManager.install.test.ts`, `tests/contracts/plugin-api.test.ts` (Tasks 4-6).
6. Raid detection Redis-first/memory-fallback dispatch unchanged — pinned by `tests/utils/raidDetection-redis.test.ts` + `tests/events/guildMemberAdd.test.ts` (Task 7).
7. plugin-manifest.json integrity after plugin file moves — pinned by `pnpm manifest` + `loadAll`'s `verifyPluginManifest` gate (Tasks 2, 8, 10).

---

## Phase 1: Automod De-duplication (Critical)

The confirmed duplication: `src/plugins/automod/commands/automod.ts` defines its own `getAutomodConfig` (lines 254-273) that has **drifted** from `src/utils/automod.ts`'s version (lines 247-269) — the command copy is missing `minCapsLength`, `spamChannelOverrides`, `nsfwThreshold`, has an extra `raidDetection` field, and throws on null guild config. `utils/automod.ts` is the safe source of truth (well-tested, imported by 3 src files: `src/index.ts` (`stopSpamTrackerCleanup`), `src/plugins/utility/commands/embed.ts` (`getAutomodConfig`, `checkBannedWords`), `src/plugins/automod/events/messageCreate.ts` (12 functions)).

### Task 1: Split src/utils/automod.ts into focused modules behind a barrel

**Files:**
- Create: `src/utils/automodConfig.ts`, `src/utils/automodChecking.ts`, `src/utils/automodSpam.ts`
- Modify: `src/utils/automod.ts` (becomes barrel)
- Test: `tests/utils/automod.test.ts`, `tests/utils/automod-redis.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: existing imports of `utils/automod.ts` (`./logger.js`, `./db.js`, `../config/config.js`, `./lock.js`, `./lruCache.js`, `./simhash.js`, discord.js types, `ioredis` Redis type).
- Produces (exact public surface of the barrel — all names currently exported from `utils/automod.ts`): `checkBurstSpam`, `cleanupBurstTracker`, `trackMessageRedis`, `checkSpamRedis`, `getAutomodConfig`, `isExempt`, `isChannelExempt`, `normalizeContent`, `checkBannedWords`, `checkInvites`, `checkLinks`, `checkMentionSpam`, `checkCapsSpam`, `checkSpam`, `checkAccountAge`, `cleanupSpamTracker`, `stopSpamTrackerCleanup`, `checkPhishingLinks`, plus exported types `AutomodConfig`, `ChannelOverride`, `PhishingMatch`. `getAutomodConfig` gains one additive field `raidDetection: boolean` (the unification; no test asserts the old shape).

- [ ] **Step 1: Verify normalizeContent usage before choosing dependency direction**

Run: `rg -n 'normalizeContent' src/utils/automod.ts`
Decision rule: if used only inside checking functions (normalizeContent's own definition + checkBannedWords etc.), no cross-module import is needed. If used by spam functions (`checkBurstSpam`, `checkSpamMemory`), `automodSpam.ts` imports it from `./automodChecking.js` (one-way: spam -> checking).

- [ ] **Step 2: Create src/utils/automodConfig.ts**

Move verbatim (including JSDoc) from `src/utils/automod.ts`:
- `ChannelOverride` interface (lines 38-41)
- `AutomodConfig` interface (lines 222-240) — export it, and ADD the field `raidDetection: boolean;` after `filterLinks` (matching the canonical `src/types/config.ts:106` which also has `raidDetection`)
- `getAutomodConfig` (lines 247-269) — ADD the line `raidDetection: (automodConfig['raidDetection'] as boolean) ?? config.automod.raidDetection,` to the returned object (matching command-file semantics at line 262 of the command)

Imports for this file: `import { getGuildData } from './db.js';` and `import { config } from '../config/config.js';`

- [ ] **Step 3: Create src/utils/automodChecking.ts**

Move verbatim (including JSDoc) from `src/utils/automod.ts`:
- `isExempt` (277-294), `isChannelExempt` (295-306), `normalizeContent` (307-347), `checkBannedWords` (348-382), `checkInvites` (383-401), `checkLinks` (402-420), `checkMentionSpam` (421-437), `checkCapsSpam` (438-460), `checkAccountAge` (532-538), `escapeRegex` (541-548, stays private), `PhishingMatch` interface (627, export it), `PHISHING_DOMAINS` const (599-626), `checkPhishingLinks` (638-701)

Imports: `import type { Message, GuildMember, User } from 'discord.js';` and `import type { AutomodConfig } from './automodConfig.js';`

- [ ] **Step 4: Create src/utils/automodSpam.ts**

Move verbatim (including JSDoc) from `src/utils/automod.ts`:
- `spamTracker` TwoLevelLRUCache (13-22), `BurstTrackerEntry` interface (26-29), `burstTracker` Map (31), `BURST_THRESHOLD`/`BURST_INTERVAL`/`SIMILARITY_THRESHOLD` consts (33-36), `BurstSpamResult` interface (43-48), `checkBurstSpam` (58-127), `cleanupBurstTracker` (128-149), `getSpamRedis` (150-162, stays private), `trackMessageRedis` (163-192), `checkSpamRedis` (193-221), `checkSpam` (461-491), `checkSpamMemory` (492-530, stays private), `cleanupSpamTracker` (550-582), the module-level cleanup-interval bootstrap (584-585: `let spamTrackerCleanupInterval: NodeJS.Timeout | null = setInterval(() => { void cleanupSpamTracker(); }, 60000);`), `stopSpamTrackerCleanup` (587-597)

Imports: `import { logger } from './logger.js';`, `import { getLockRedis } from './lock.js';`, `import { TwoLevelLRUCache } from './lruCache.js';`, `import { simhash, isSimilar } from './simhash.js';`, `import { config } from '../config/config.js';`, `import type { Message } from 'discord.js';`, `import type { Redis } from 'ioredis';`, `import type { AutomodConfig, ChannelOverride } from './automodConfig.js';`

CRITICAL: the `setInterval` at old line 585 must remain at MODULE level in `automodSpam.ts` (side effect preserved at import time).

- [ ] **Step 5: Rewrite src/utils/automod.ts as a barrel**

Replace the entire file content with:

```typescript
export { getAutomodConfig, type AutomodConfig, type ChannelOverride } from './automodConfig.js';
export {
    isExempt,
    isChannelExempt,
    normalizeContent,
    checkBannedWords,
    checkInvites,
    checkLinks,
    checkMentionSpam,
    checkCapsSpam,
    checkAccountAge,
    checkPhishingLinks,
    type PhishingMatch
} from './automodChecking.js';
export {
    checkBurstSpam,
    cleanupBurstTracker,
    trackMessageRedis,
    checkSpamRedis,
    checkSpam,
    cleanupSpamTracker,
    stopSpamTrackerCleanup
} from './automodSpam.js';
```

- [ ] **Step 6: Run tests to verify behavior preserved**

Run: `pnpm vitest run tests/utils/automod.test.ts tests/utils/automod-redis.test.ts`
Expected: PASS (all existing tests unchanged). Run: `pnpm typecheck` — Expected: PASS (catches any missed barrel export; `src/index.ts`, `embed.ts`, and `messageCreate.ts` import through the barrel).

- [ ] **Step 7: Lint and commit**

Run: `pnpm eslint src/utils/automod.ts src/utils/automodConfig.ts src/utils/automodChecking.ts src/utils/automodSpam.ts`
Expected: no errors. Then:

```bash
git add src/utils/automod.ts src/utils/automodConfig.ts src/utils/automodChecking.ts src/utils/automodSpam.ts
git commit -m "refactor: split utils/automod into config, checking, and spam modules behind barrel"
```

### Task 2: Extract automod subcommand handlers, unify getAutomodConfig, thin dispatcher

**Files:**
- Create: `src/plugins/automod/commands/automod/enable.ts`, `disable.ts`, `status.ts`, `addword.ts`, `removeword.ts`, `listwords.ts`, `set.ts`, `exemptchannel.ts`, `exemptrole.ts`, `scan.ts`
- Modify: `src/plugins/automod/commands/automod.ts` (thin dispatcher)
- Test: `tests/commands/automod.test.ts`, `tests/cli/automod.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: `getAutomodConfig` + `type AutomodConfig` from `'../../../../utils/automod.js'` (the barrel, post-Task 1); current command-file imports distributed per handler (`logger`, `getGuildData`/`setGuildData` from `db.js`, `config`, `safeError`, `checkMessageAttachments` from `nsfwDetection.js`, `handleDiscordError`/`safeReply` from `discordErrors.js`, `i18n`, discord.js values).
- Produces: 10 handler modules each exporting `export async function handle<Name>(interaction: ChatInputCommandInteraction): Promise<void>` (Names: `Enable`, `Disable`, `Status`, `AddWord`, `RemoveWord`, `ListWords`, `Set`, `ExemptChannel`, `ExemptRole`, `Scan`). The command's default export (with `data` and `execute`) is unchanged, so `deploy-commands.ts` and all tests keep working.

- [ ] **Step 1: Extract the 10 handler modules**

Create `src/plugins/automod/commands/automod/` and move verbatim (including JSDoc) from `src/plugins/automod/commands/automod.ts`, one function per file, each with `export async function` prefix:
- `enable.ts` <- `handleEnable` (275-295)
- `disable.ts` <- `handleDisable` (296-312)
- `status.ts` <- `handleStatus` (313-345)
- `addword.ts` <- `handleAddWord` (346-380)
- `removeword.ts` <- `handleRemoveWord` (381-414)
- `listwords.ts` <- `handleListWords` (415-447)
- `set.ts` <- `handleSet` (448-520)
- `exemptchannel.ts` <- `handleExemptChannel` (521-581)
- `exemptrole.ts` <- `handleExemptRole` (582-642)
- `scan.ts` <- `handleScan` (643-798)

In every module: replace the local config lookup with `import { getAutomodConfig } from '../../../../utils/automod.js';` (add `type AutomodConfig` to the same import if the handler annotates the type), and delete references to the command's local copies. Distribute remaining imports per usage (a module that does not use `safeError` does not import it). While extracting, if any handler inlines logic duplicating an `automodChecking` export (e.g. banned-word or invite checks inside `handleScan`), replace it with a barrel import instead of moving the duplicate.

- [ ] **Step 2: Delete the drifted local copies from the command file**

Delete from `src/plugins/automod/commands/automod.ts`:
- local `AutomodConfig` interface (lines 14-30)
- local `getAutomodConfig` (lines 254-273) — the drifted duplicate with the null-safety bug

This is the intentional behavior fix (Review Focus item 2): guilds with no stored automod config now get defaults instead of a thrown TypeError caught into an error reply.

- [ ] **Step 3: Rewrite the command as a thin dispatcher**

Keep lines 33-208 (metadata + options + `data` SlashCommandBuilder) verbatim. Replace the handler references in `execute` with imports. Resulting shape:

```typescript
import type { ChatInputCommandInteraction } from 'discord.js';
import { PermissionsBitField, ChannelType, SlashCommandBuilder } from 'discord.js';
import { handleDiscordError, safeReply } from '../../../utils/discordErrors.js';
import { handleEnable } from './automod/enable.js';
import { handleDisable } from './automod/disable.js';
import { handleStatus } from './automod/status.js';
import { handleAddWord } from './automod/addword.js';
import { handleRemoveWord } from './automod/removeword.js';
import { handleListWords } from './automod/listwords.js';
import { handleSet } from './automod/set.js';
import { handleExemptChannel } from './automod/exemptchannel.js';
import { handleExemptRole } from './automod/exemptrole.js';
import { handleScan } from './automod/scan.js';

export default {
    /* lines 33-208 verbatim: name, description, category, defaultMemberPermissions, dmPermission, options, data */

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            switch (subcommand) {
            case 'enable':
                await handleEnable(interaction);
                break;
            case 'disable':
                await handleDisable(interaction);
                break;
            case 'status':
                await handleStatus(interaction);
                break;
            case 'addword':
                await handleAddWord(interaction);
                break;
            case 'removeword':
                await handleRemoveWord(interaction);
                break;
            case 'listwords':
                await handleListWords(interaction);
                break;
            case 'set':
                await handleSet(interaction);
                break;
            case 'exemptchannel':
                await handleExemptChannel(interaction);
                break;
            case 'exemptrole':
                await handleExemptRole(interaction);
                break;
            case 'scan':
                await handleScan(interaction);
                break;
            }
        } catch (error) {
            const userMessage = handleDiscordError(error);
            if (userMessage) {
                await safeReply(interaction, userMessage);
            }
        }
    }
};
```

Keep any import from the original list that the retained metadata still uses (e.g. `EmbedBuilder`, `MessageFlags` if present in lines 33-208). Remove imports only used by the moved handlers.

- [ ] **Step 4: Run tests to verify behavior preserved**

Run: `pnpm vitest run tests/commands/automod.test.ts tests/cli/automod.test.ts`
Expected: PASS (registration surface byte-identical, handlers behave the same).

- [ ] **Step 5: Regenerate the plugin manifest (files under src/plugins/ changed)**

Run: `pnpm manifest`
Expected: `[MANIFEST] Wrote N file hash(es) to plugin-manifest.json` with N increased (new handler modules hashed).

- [ ] **Step 6: Lint and commit**

Run: `pnpm eslint 'src/plugins/automod/commands/**'`
Expected: no errors. Then:

```bash
git add src/plugins/automod/commands/ plugin-manifest.json
git commit -m "refactor: extract automod subcommand handlers and unify getAutomodConfig with utils"
```

---

## Phase 2: analyticsCollector Split (High)

`src/utils/analyticsCollector.ts` (717 lines) has the highest importer count in the codebase (22 src files + tests, including all moderation commands, both member events, `messageCreate`, `src/index.ts`, `reportHandler.ts`). It mixes 4 concerns: in-memory caching, DB batch flushing + lifecycle, stats retrieval, and performance counters. Splitting keeps the import path stable via a barrel.

### Task 3: Split src/utils/analyticsCollector.ts into cache, flush, and stats modules behind a barrel

**Files:**
- Create: `src/utils/analyticsCache.ts`, `src/utils/analyticsFlush.ts`, `src/utils/analyticsStats.ts`
- Modify: `src/utils/analyticsCollector.ts` (becomes barrel)
- Test: `tests/utils/analyticsCollector.test.ts`, `tests/commands/analytics.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: existing imports (`./logger.js`, `./db.js`, discord.js `Client` type).
- Produces (exact public surface of the barrel — all names currently exported): `initAnalyticsCollector`, `stopAnalyticsCollector`, `trackCommand`, `trackMessage`, `trackViolation`, `trackModAction`, `trackMemberChange`, `flushAnalyticsCritical`, `flushAnalyticsCache`, `getCommandStats`, `getMessageStats`, `getViolationStats`, `getModActionStats`, `getMemberGrowthStats`, `getAnalyticsCollectorStats`.

- [ ] **Step 1: Determine placement of the date-key helpers**

Run: `rg -n 'getDateString|getHourString' src/utils/analyticsCollector.ts`
Decision rule: if used by both flush (DB key building) and stats (query key building), place them in `analyticsCache.ts` (both consumers already import it). If used by only one module, place them in that module.

- [ ] **Step 2: Create src/utils/analyticsCache.ts (state + tracking)**

Move verbatim (including JSDoc) from `src/utils/analyticsCollector.ts`:
- `AnalyticsCache` interface (9-14) — export it
- `analyticsCache` object (16-21) — export it (flush and stats need access)
- `trackCommand` (98-119), `trackMessage` (120-140), `trackViolation` (141-156), `trackModAction` (157-178), `trackMemberChange` (179-212)

Imports: `import { getGuildData, setGuildData } from './db.js';` plus whatever `trackMemberChange` uses. Dependency rule: `analyticsCache.ts` must NOT import from `analyticsFlush.js` or `analyticsStats.js`.

- [ ] **Step 3: Create src/utils/analyticsFlush.ts (lifecycle + flushing + counters)**

Move verbatim (including JSDoc) from `src/utils/analyticsCollector.ts`:
- `BATCH_INTERVAL` const (24), `batchIntervalId` let (25), `RETENTION_DAYS` const (28), `PerformanceStats` interface (31-39) — export it, `performanceStats` object (41-49), `initAnalyticsCollector` (55-76), `stopAnalyticsCollector` (77-97), `flushAnalyticsCritical` (213-228), `flushAnalyticsCache` (229-362), `cleanupOldAnalytics` (363-477, stays private), `getDateString` (478-487, per Step 1 decision), `getHourString` (488-500, per Step 1 decision), `getAnalyticsCollectorStats` (699-717)

Imports: `import { logger } from './logger.js';`, `import type { Client } from 'discord.js';`, `import { analyticsCache } from './analyticsCache.js';` plus date helpers if they landed here.

- [ ] **Step 4: Create src/utils/analyticsStats.ts (stats retrieval)**

Move verbatim (including JSDoc) from `src/utils/analyticsCollector.ts`:
- `getCommandStats` (501-545), `getMessageStats` (546-599), `getViolationStats` (600-629), `getModActionStats` (630-674), `getMemberGrowthStats` (675-698)

Imports: `import { getGuildData, setGuildData } from './db.js';`, `import { analyticsCache } from './analyticsCache.js';`, plus date helpers per Step 1 decision.

- [ ] **Step 5: Rewrite src/utils/analyticsCollector.ts as a barrel**

Replace the entire file content with:

```typescript
export {
    trackCommand,
    trackMessage,
    trackViolation,
    trackModAction,
    trackMemberChange
} from './analyticsCache.js';
export {
    initAnalyticsCollector,
    stopAnalyticsCollector,
    flushAnalyticsCritical,
    flushAnalyticsCache,
    getAnalyticsCollectorStats
} from './analyticsFlush.js';
export {
    getCommandStats,
    getMessageStats,
    getViolationStats,
    getModActionStats,
    getMemberGrowthStats
} from './analyticsStats.js';
```

- [ ] **Step 6: Run tests to verify behavior preserved**

Run: `pnpm vitest run tests/utils/analyticsCollector.test.ts tests/commands/analytics.test.ts`
Expected: PASS (all existing tests unchanged; the 22 src importers use the barrel so they compile). Run: `pnpm typecheck` — Expected: PASS.

- [ ] **Step 7: Lint and commit**

Run: `pnpm eslint src/utils/analyticsCollector.ts src/utils/analyticsCache.ts src/utils/analyticsFlush.ts src/utils/analyticsStats.ts`
Expected: no errors. Then:

```bash
git add src/utils/analyticsCollector.ts src/utils/analyticsCache.ts src/utils/analyticsFlush.ts src/utils/analyticsStats.ts
git commit -m "refactor: split analyticsCollector into cache, flush, and stats modules behind barrel"
```

---

## Phase 3: PluginManager Coordinator Refactor (High)

`src/core/PluginManager.ts` (588 lines) already instantiates `PluginLoader`, `PluginEnabler`, `PluginDisabler`, `PluginReloader`, `PluginInstaller` (constructor lines 86-91) and delegates enable/disable/reload to them. Three concerns remain inline and extract cleanly: dependency ordering + parallel enablement (pure graph algorithms, lines 127-184 and 203-231), Discord command sync (lines 233-297, with internal duplication between `_syncDiscordCommands` and `syncCommands`), and built-in plugin loading (lines 342-395). Public surface stays identical: `constructor(client, bus)`, `loadAll`, `syncCommands`, `loadPlugin`, `loadBuiltinPlugin`, `unloadPlugin`, `enablePlugin`, `disablePlugin`, `reloadPlugin`, `installPlugin`, `loadInstalledPlugin`, `uninstallPlugin`, `getPlugin`, `isEnabled`, `listPlugins`, `scanPlugins`, `registerSocketHandler`, `getSocketHandler`.

### Task 4: Extract PluginDependencyResolver (TDD)

**Files:**
- Create: `src/core/PluginDependencyResolver.ts`
- Modify: `src/core/PluginManager.ts`
- Test: `tests/core/PluginDependencyResolver.test.ts` (new)

**Interfaces:**
- Consumes: nothing (pure functions; no imports beyond nothing external).
- Produces: `sortByDependencies(ids: string[], getDeps: (id: string) => string[]): string[]` and `enablePluginsParallel(sortedIds: string[], getDeps: (id: string) => string[], enable: (id: string) => Promise<void>): Promise<void>`. The accessor form avoids `Map` invariance issues with `Map<string, PluginConstructor>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/core/PluginDependencyResolver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sortByDependencies, enablePluginsParallel } from '../../src/core/PluginDependencyResolver.js';

function makeRegistry(entries: [string, string[]][]): Map<string, { dependencies: string[] }> {
    return new Map(entries.map(([id, deps]) => [id, { dependencies: deps }]));
}

describe('sortByDependencies', () => {
    it('returns dependencies before dependents', () => {
        const registry = makeRegistry([['a', []], ['b', ['a']], ['c', ['a', 'b']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        expect(sortByDependencies(['c', 'b', 'a'], getDeps)).toEqual(['a', 'b', 'c']);
    });

    it('throws on circular dependencies', () => {
        const registry = makeRegistry([['x', ['y']], ['y', ['x']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        expect(() => sortByDependencies(['x', 'y'], getDeps)).toThrow(/Circular dependency/);
    });

    it('ignores deps outside the id set', () => {
        const registry = makeRegistry([['a', ['ghost']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        expect(sortByDependencies(['a'], getDeps)).toEqual(['a']);
    });
});

describe('enablePluginsParallel', () => {
    it('enables dependencies before dependents', async () => {
        const registry = makeRegistry([['a', []], ['b', ['a']]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        const order: string[] = [];
        await enablePluginsParallel(['a', 'b'], getDeps, async (id) => { order.push(id); });
        expect(order).toEqual(['a', 'b']);
    });

    it('enables independent plugins concurrently within a level', async () => {
        const registry = makeRegistry([['a', []], ['c', []]]);
        const getDeps = (id: string) => registry.get(id)?.dependencies ?? [];
        const active = new Set<string>();
        let maxConcurrent = 0;
        await enablePluginsParallel(['a', 'c'], getDeps, async (id) => {
            active.add(id);
            maxConcurrent = Math.max(maxConcurrent, active.size);
            await new Promise(resolve => setTimeout(resolve, 0));
            active.delete(id);
        });
        expect(maxConcurrent).toBe(2);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/core/PluginDependencyResolver.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create src/core/PluginDependencyResolver.ts**

Move the algorithm bodies verbatim from `src/core/PluginManager.ts` (`_enablePluginsParallel` 127-184, `_sortByDependencies` 203-231), adapted to the accessor form:

```typescript
interface DependencySource {
    dependencies: string[];
}

export function sortByDependencies(ids: string[], getDeps: (id: string) => string[]): string[] {
    const idSet = new Set(ids);
    const visited = new Set<string>();
    const sorted: string[] = [];

    function visit(id: string, graph: Map<string, string[]>, path: Set<string>): void {
        if (path.has(id)) { throw new Error(`Circular dependency detected: ${[...path, id].join(' -> ')}`); }
        if (visited.has(id)) { return; }
        visited.add(id);
        path.add(id);
        for (const dep of graph.get(id) ?? []) {
            if (idSet.has(dep)) { visit(dep, graph, path); }
        }
        path.delete(id);
        sorted.push(id);
    }

    const graph = new Map<string, string[]>();
    for (const id of ids) {
        graph.set(id, getDeps(id));
    }

    for (const id of ids) {
        visit(id, graph, new Set());
    }

    return sorted;
}

export async function enablePluginsParallel(sortedIds: string[], getDeps: (id: string) => string[], enable: (id: string) => Promise<void>): Promise<void> {
    const graph = new Map<string, string[]>();
    const reverseGraph = new Map<string, Set<string>>();
    for (const id of sortedIds) {
        const deps = getDeps(id).filter(d => sortedIds.includes(d));
        graph.set(id, deps);
        for (const dep of getDeps(id)) {
            if (!reverseGraph.has(dep)) { reverseGraph.set(dep, new Set()); }
            reverseGraph.get(dep)!.add(id);
        }
    }

    const levels = new Map<string, number>();
    const visited = new Set<string>();

    function calculateLevel(id: string): number {
        if (visited.has(id)) { return levels.get(id)!; }
        visited.add(id);
        const deps = graph.get(id) ?? [];
        if (deps.length === 0) {
            levels.set(id, 0);
            return 0;
        }
        let maxLevel = 0;
        for (const dep of deps) {
            const depLevel = calculateLevel(dep);
            maxLevel = Math.max(maxLevel, depLevel + 1);
        }
        levels.set(id, maxLevel);
        return maxLevel;
    }

    for (const id of sortedIds) {
        calculateLevel(id);
    }

    const levelGroups = new Map<number, string[]>();
    for (const [id, level] of levels) {
        if (!levelGroups.has(level)) { levelGroups.set(level, []); }
        levelGroups.get(level)!.push(id);
    }

    if (levels.size === 0) { return; }
    const maxLevel = Math.max(...levels.values());
    for (let level = 0; level <= maxLevel; level++) {
        const idsAtLevel = levelGroups.get(level) ?? [];
        if (idsAtLevel.length === 0) { continue; }
        await Promise.all(idsAtLevel.map(id => enable(id)));
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/core/PluginDependencyResolver.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Delegate from PluginManager**

In `src/core/PluginManager.ts`: add `import { sortByDependencies, enablePluginsParallel } from './PluginDependencyResolver.js';`, replace the `_sortByDependencies` body (203-231) with:

```typescript
    _sortByDependencies(ids: string[]): string[] {
        return sortByDependencies(ids, id => this._pluginRegistry.get(id)?.dependencies ?? []);
    }
```

and replace the `_enablePluginsParallel` body (127-184) with:

```typescript
    async _enablePluginsParallel(sortedIds: string[]): Promise<void> {
        await enablePluginsParallel(sortedIds, id => this._pluginRegistry.get(id)?.dependencies ?? [], id => this.enablePlugin(id));
    }
```

- [ ] **Step 6: Run PluginManager tests and commit**

Run: `pnpm vitest run tests/core/PluginManager.test.ts tests/core/PluginManager.install.test.ts tests/contracts/plugin-api.test.ts`
Expected: PASS (behavior identical). Then:

```bash
git add src/core/PluginDependencyResolver.ts tests/core/PluginDependencyResolver.test.ts src/core/PluginManager.ts
git commit -m "refactor: extract plugin dependency resolution from PluginManager"
```

### Task 5: Extract CommandSync

**Files:**
- Create: `src/core/CommandSync.ts`
- Modify: `src/core/PluginManager.ts`
- Test: `tests/core/PluginManager.test.ts`, `tests/contracts/plugin-api.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: `buildLocalizedPayload` + `CommandInput` from `../i18n/commandPayload.js`, `Routes` from `discord.js`, `logger` from `../utils/logger.js`.
- Produces: `class CommandSync` with `constructor(client: CommandSyncClient)`, `syncCommands(pluginId: string, commands: unknown[]): Promise<void>`, `syncAllCommands(): Promise<void>`. `CommandSyncClient` is a minimal structural interface satisfied by `TypedClient`. This also removes the internal duplication between `_syncDiscordCommands` and `syncCommands` (both currently re-implement the guild/global `rest.put` branching).

- [ ] **Step 1: Create src/core/CommandSync.ts**

```typescript
import { Routes } from 'discord.js';
import { buildLocalizedPayload } from '../i18n/commandPayload.js';
import type { CommandInput } from '../i18n/commandPayload.js';
import type { REST } from 'discord.js';
import { logger } from '../utils/logger.js';

interface CommandSyncClient {
    rest: REST;
    config: { discord: { clientId: string }; guildId?: string };
    commands?: Map<string, unknown>;
}

export class CommandSync {
    private client: CommandSyncClient;

    constructor(client: CommandSyncClient) {
        this.client = client;
    }

    async syncCommands(pluginId: string, commands: unknown[]): Promise<void> {
        await this.putCommands(commands, `[ERROR] Failed to sync commands for plugin ${pluginId}`);
    }

    async syncAllCommands(): Promise<void> {
        const commands = [...(this.client.commands?.values() ?? [])];
        await this.putCommands(commands, '[ERROR] Failed to sync commands with Discord');
    }

    private async putCommands(commands: unknown[], errorMessage: string): Promise<void> {
        try {
            const rest = this.client.rest;
            const clientConfig = this.client.config;
            const CLIENT_ID = clientConfig.discord.clientId;
            if (!CLIENT_ID) { return; }

            const body = commands.map(cmd => buildLocalizedPayload(cmd as CommandInput));

            if (clientConfig.guildId) {
                await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID, clientConfig.guildId),
                    { body }
                );
            } else {
                await rest.put(
                    Routes.applicationCommands(CLIENT_ID),
                    { body }
                );
            }
        } catch (error) {
            logger.error({ err: error, msg: errorMessage });
        }
    }
}
```

- [ ] **Step 2: Wire CommandSync into PluginManager**

In `src/core/PluginManager.ts`:
- Add `import { CommandSync } from './CommandSync.js';` and a private field `private _commandSync: CommandSync;`
- In the constructor, BEFORE `this._enabler = ...` (line 88), add `this._commandSync = new CommandSync(client);` and change the enabler options to `commandSync: this._commandSync` (preserving `PluginEnabler`'s `CommandSyncLike` contract — `syncCommands(pluginId: string, commands: unknown[]): Promise<void>`, see `src/core/PluginEnabler.ts:16`)
- Replace `syncCommands` body (274-297) with:

```typescript
    async syncCommands(pluginId: string, commands: unknown[]): Promise<void> {
        await this._commandSync.syncCommands(pluginId, commands);
    }
```

- Replace `_syncDiscordCommands` body (233-272) with:

```typescript
    async _syncDiscordCommands(changedPluginId: string | null = null): Promise<void> {
        if (changedPluginId) {
            const plugin = this.plugins.get(changedPluginId);
            if (!plugin) { return; }
            await this._commandSync.syncCommands(changedPluginId, plugin.getCommands?.() || []);
        } else {
            await this._commandSync.syncAllCommands();
        }
    }
```

- Remove now-unused imports (`Routes`, `buildLocalizedPayload`, `CommandInput`) if nothing else in the file uses them.

- [ ] **Step 3: Run tests and commit**

Run: `pnpm vitest run tests/core/PluginManager.test.ts tests/core/PluginManager.install.test.ts tests/contracts/plugin-api.test.ts` and `pnpm typecheck`
Expected: PASS. Then:

```bash
git add src/core/CommandSync.ts src/core/PluginManager.ts
git commit -m "refactor: extract CommandSync from PluginManager, deduplicate rest.put branching"
```

### Task 6: Extract BuiltinPluginLoader

**Files:**
- Create: `src/core/BuiltinPluginLoader.ts`
- Modify: `src/core/PluginManager.ts`
- Test: `tests/core/PluginManager.test.ts`, `tests/core/PluginManager.install.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: `verifyPluginFile` from `../utils/manifest.js`, `Plugin` type from `./Plugin.js`.
- Produces: `class BuiltinPluginLoader` with `async load(id: string, baseDir: string, preferJs: boolean, installedDir: string): Promise<BuiltinPluginLoadResult>` where `BuiltinPluginLoadResult = { PluginClass: new (...args: unknown[]) => PluginBase; pluginDir: string }`. The manager keeps registry bookkeeping (`this._pluginRegistry.set`) and instantiation.

- [ ] **Step 1: Create src/core/BuiltinPluginLoader.ts**

Move verbatim from `src/core/PluginManager.ts` `loadBuiltinPlugin` (342-395): the candidate resolution (346-370), TOCTOU manifest verification (372-381), dynamic import with cache-bust (383-388):

```typescript
import { existsSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { pathToFileURL } from 'url';
import { verifyPluginFile } from '../utils/manifest.js';
import type { Plugin as PluginBase } from './Plugin.js';

export interface BuiltinPluginLoadResult {
    PluginClass: new (...args: unknown[]) => PluginBase;
    pluginDir: string;
}

export class BuiltinPluginLoader {
    async load(id: string, baseDir: string, preferJs: boolean, installedDir: string): Promise<BuiltinPluginLoadResult> {
        const pluginDir = join(process.cwd(), baseDir, id);
        const candidates = preferJs
            ? [join(pluginDir, 'plugin.js'), join(pluginDir, 'plugin.ts')]
            : [join(pluginDir, 'plugin.ts'), join(pluginDir, 'plugin.js')];
        const pluginPath = candidates.find((p) => existsSync(p)) ?? candidates[0]!;
        if (!existsSync(pluginPath)) {
            const optionalDir = join(process.cwd(), installedDir, id);
            const optionalPath = join(optionalDir, 'plugin.ts');
            const optionalPathJs = join(optionalDir, 'plugin.js');
            const optionalCandidates = preferJs ? [optionalPathJs, optionalPath] : [optionalPath, optionalPathJs];
            if (existsSync(optionalCandidates[0]!)) {
                return { PluginClass: await this.importPlugin(id, optionalCandidates[0]!), pluginDir: optionalDir };
            }
            if (existsSync(optionalCandidates[1]!)) {
                return { PluginClass: await this.importPlugin(id, optionalCandidates[1]!), pluginDir: optionalDir };
            }
            throw new Error(`Plugin ${id} not found at ${pluginPath}`);
        }
        return { PluginClass: await this.importPlugin(id, pluginPath), pluginDir };
    }

    private async importPlugin(id: string, pluginPath: string): Promise<new (...args: unknown[]) => PluginBase> {
        const manifestPathGlobal = join(process.cwd(), 'plugin-manifest.json');
        if (existsSync(manifestPathGlobal)) {
            const manifest = JSON.parse(readFileSync(manifestPathGlobal, 'utf8'));
            const relPath = relative(process.cwd(), pluginPath).split(sep).join('/');
            const expectedHash = manifest[relPath] as string | undefined;
            if (expectedHash) {
                verifyPluginFile(pluginPath, expectedHash);
            }
        }

        const url = pathToFileURL(pluginPath).href + (process.env['NODE_ENV'] === 'development' ? `?t=${Date.now()}` : '');
        const mod = await import(url);
        const PluginClass = mod.default;
        if (!PluginClass) {
            throw new Error(`Plugin ${id} does not export a default class`);
        }
        return PluginClass;
    }
}
```

- [ ] **Step 2: Delegate from PluginManager**

In `src/core/PluginManager.ts`:
- Add `import { BuiltinPluginLoader } from './BuiltinPluginLoader.js';` and a private field `private _builtinLoader = new BuiltinPluginLoader();`
- Replace the `loadBuiltinPlugin` body (342-395) with:

```typescript
    async loadBuiltinPlugin(id: string, baseDir = './src/plugins'): Promise<PluginBase> {
        let PluginClass = this._pluginRegistry.get(id);
        let pluginDir = path.join(process.cwd(), baseDir, id);
        if (!PluginClass) {
            const preferJs = process.env['NODE_ENV'] === 'production';
            const installedDir = this.config?.plugins?.paths?.installed ?? './data/plugins';
            const result = await this._builtinLoader.load(id, baseDir, preferJs, installedDir);
            PluginClass = result.PluginClass as unknown as PluginConstructor;
            pluginDir = result.pluginDir;
            this._pluginRegistry.set(id, PluginClass);
        }

        const plugin = new PluginClass(this.client, this);
        plugin.setDirectory(pluginDir);
        return plugin;
    }
```

- Remove now-unused imports (`pathToFileURL`, `readFileSync`) if nothing else uses them.

- [ ] **Step 3: Run tests and commit**

Run: `pnpm vitest run tests/core/PluginManager.test.ts tests/core/PluginManager.install.test.ts tests/contracts/plugin-api.test.ts` and `pnpm typecheck`
Expected: PASS (TOCTOU verification, candidate resolution, and import behavior identical). Then:

```bash
git add src/core/BuiltinPluginLoader.ts src/core/PluginManager.ts
git commit -m "refactor: extract BuiltinPluginLoader from PluginManager"
```

---

## Phase 4: raidDetection Split (Medium)

`src/utils/raidDetection.ts` (592 lines) mixes Redis-backed tracking, in-memory fallback, Discord raid actions, and pure similarity helpers. Dependency analysis (verified): `checkRaidPattern` (189-206) is the dispatcher — Redis first via `getRaidRedis`/`trackJoinRedis`/`checkRaidPatternRedis`, memory fallback via `checkRaidPatternMemory`. `checkRaidPatternRedis` defaults `thresholds = DEFAULT_RAID_THRESHOLDS`, so shared constants must live in a leaf module both sides import (no cycles: types <- redis <- core).

### Task 7: Split src/utils/raidDetection.ts into types, redis, and core modules behind a barrel

**Files:**
- Create: `src/utils/raidDetectionTypes.ts`, `src/utils/raidDetectionRedis.ts`, `src/utils/raidDetectionCore.ts`
- Modify: `src/utils/raidDetection.ts` (becomes barrel)
- Test: `tests/utils/raidDetection-redis.test.ts`, `tests/events/guildMemberAdd.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: existing imports (`./lock.js`, `./db.js`, `../config/config.js`, discord.js `Guild`/`GuildMember` types, ioredis Redis type).
- Produces (exact public surface of the barrel — all names currently exported): `trackJoinRedis`, `checkRaidPatternRedis`, `isRaidModeEnabledRedis`, `setRaidModeRedis`, `checkRaidPattern`, `handleRaidDetected`, `enableRaidMode`, `disableRaidMode`, `isRaidModeEnabled`, `cleanupRaidState`, plus the default export object with identical shape, plus exported types `RaidThresholds`, `RaidCheckResult`, `RaidRedis`.

- [ ] **Step 1: Create src/utils/raidDetectionTypes.ts**

Move verbatim from `src/utils/raidDetection.ts`, all now exported: `DEFAULT_RAID_THRESHOLDS` const (20-27), `RaidThresholds` interface (28-35), `RaidCheckResult` interface (36-53).

- [ ] **Step 2: Create src/utils/raidDetectionRedis.ts**

Move verbatim (including JSDoc) from `src/utils/raidDetection.ts`: `RaidRedis` interface (72-81, export it), `getRaidRedis` (82-94, stays private), `trackJoinRedis` (95-114), `checkRaidPatternRedis` (115-155), `isRaidModeEnabledRedis` (156-169), `setRaidModeRedis` (170-188).

Imports: `import { getLockRedis } from './lock.js';`, ioredis Redis type, `import { DEFAULT_RAID_THRESHOLDS, type RaidThresholds, type RaidCheckResult } from './raidDetectionTypes.js';`. Dependency rule: must NOT import from `raidDetectionCore.js`.

- [ ] **Step 3: Create src/utils/raidDetectionCore.ts**

Move verbatim (including JSDoc) from `src/utils/raidDetection.ts`: the module-level `raidState` Map (top-of-file region), `getRaidThresholds` (54-71, stays private), `checkRaidPattern` (189-206), `checkRaidPatternMemory` (217-273, stays private), `handleRaidDetected` (274-371), `enableRaidMode` (372-423), `disableRaidMode` (424-477), `isRaidModeEnabled` (478-492), `countSimilarNames` (493-515, stays private), `calculateSimilarity` (516-531, stays private), `levenshteinDistance` (532-562, stays private), `cleanupRaidState` (563-580).

Imports: discord.js `Guild`/`GuildMember` types, `./db.js` and `../config/config.js` as used, `import { DEFAULT_RAID_THRESHOLDS, type RaidThresholds } from './raidDetectionTypes.js';`, `import { getRaidRedis, trackJoinRedis, checkRaidPatternRedis } from './raidDetectionRedis.js';` (one-way: core -> redis).

- [ ] **Step 4: Rewrite src/utils/raidDetection.ts as a barrel**

Replace the entire file content with named re-exports plus the default object copied verbatim from lines 581-592 (updating references to the imported functions):

```typescript
export {
    trackJoinRedis,
    checkRaidPatternRedis,
    isRaidModeEnabledRedis,
    setRaidModeRedis,
    type RaidRedis
} from './raidDetectionRedis.js';
export {
    checkRaidPattern,
    handleRaidDetected,
    enableRaidMode,
    disableRaidMode,
    isRaidModeEnabled,
    cleanupRaidState
} from './raidDetectionCore.js';
export type { RaidThresholds, RaidCheckResult } from './raidDetectionTypes.js';
```

plus `import { ... } from './raidDetectionCore.js';` / `import { ... } from './raidDetectionRedis.js';` and a `export default { ... };` object listing exactly the same public function names as the original lines 581-592 (copy that object's key list verbatim).

- [ ] **Step 5: Run tests to verify behavior preserved**

Run: `pnpm vitest run tests/utils/raidDetection-redis.test.ts tests/events/guildMemberAdd.test.ts` and `pnpm typecheck`
Expected: PASS. Then lint the four files:

Run: `pnpm eslint src/utils/raidDetection.ts src/utils/raidDetectionTypes.ts src/utils/raidDetectionRedis.ts src/utils/raidDetectionCore.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/raidDetection.ts src/utils/raidDetectionTypes.ts src/utils/raidDetectionRedis.ts src/utils/raidDetectionCore.ts
git commit -m "refactor: split raidDetection into types, redis, and core modules behind barrel"
```

---

## Phase 5: Analytics Command Split (Low)

`src/plugins/utility/commands/analytics.ts` (666 lines) is already well-decomposed: a `data` SlashCommandBuilder + execute switch (24-155) and 6 self-contained handlers (verified: no shared helper functions exist in the file). Extraction is mechanical; handlers import the analyticsCollector barrel (post-Task 3), charts, exportAnalytics, db, i18n, discordErrors.

### Task 8: Extract analytics subcommand handlers, thin dispatcher

**Files:**
- Create: `src/plugins/utility/commands/analytics/serverStats.ts`, `commandStats.ts`, `activityStats.ts`, `moderationStats.ts`, `userStats.ts`, `exportStats.ts`
- Modify: `src/plugins/utility/commands/analytics.ts` (thin dispatcher)
- Test: `tests/commands/analytics.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: `getCommandStats`, `getMessageStats`, `getViolationStats`, `getModActionStats`, `getMemberGrowthStats` from `'../../../../utils/analyticsCollector.js'`; `createBarChart`, `createSparkline`, `formatDuration`, `formatNumber` from `'../../../../utils/charts.js'`; `exportAnalytics`, `cleanupExport`, `getAnalyticsSummary` from `'../../../../utils/exportAnalytics.js'`; `getGuildData`, `getUserData` from `'../../../../utils/db.js'`; `handleDiscordError`, `safeReply`, `safeFollowUp` from `'../../../../utils/discordErrors.js'`; `i18n` from `'../../../../i18n/index.js'`; `logger` from `'../../../../utils/logger.js'`.
- Produces: 6 handler modules each exporting `export async function handle<Name>(interaction: ChatInputCommandInteraction): Promise<void>` (Names: `ServerStats`, `CommandStats`, `ActivityStats`, `ModerationStats`, `UserStats`, `Export`). The command's default export is unchanged.

- [ ] **Step 1: Extract the 6 handler modules**

Create `src/plugins/utility/commands/analytics/` and move verbatim (including JSDoc) from `src/plugins/utility/commands/analytics.ts`, one function per file, each with `export async function` prefix:
- `serverStats.ts` <- `handleServerStats` (161-238)
- `commandStats.ts` <- `handleCommandStats` (239-316)
- `activityStats.ts` <- `handleActivityStats` (317-409)
- `moderationStats.ts` <- `handleModerationStats` (410-546)
- `userStats.ts` <- `handleUserStats` (547-625)
- `exportStats.ts` <- `handleExport` (626-666)

Distribute the original imports per module usage (a module that does not chart does not import `charts.js`; `readFileSync` from `fs` moves with `handleExport` only).

- [ ] **Step 2: Rewrite the command as a thin dispatcher**

Keep lines 25-155 verbatim (the `data` builder, `name`, `category`, and `execute` switch). Replace handler references with imports:

```typescript
import { handleServerStats } from './analytics/serverStats.js';
import { handleCommandStats } from './analytics/commandStats.js';
import { handleActivityStats } from './analytics/activityStats.js';
import { handleModerationStats } from './analytics/moderationStats.js';
import { handleUserStats } from './analytics/userStats.js';
import { handleExport } from './analytics/exportStats.js';
```

Remove imports only used by the moved handlers (`charts.js`, `exportAnalytics.js`, `fs`'s `readFileSync`, and any analyticsCollector stats imports if the dispatcher no longer references them).

- [ ] **Step 3: Run tests to verify behavior preserved**

Run: `pnpm vitest run tests/commands/analytics.test.ts`
Expected: PASS.

- [ ] **Step 4: Regenerate the plugin manifest (files under src/plugins/ changed)**

Run: `pnpm manifest`
Expected: `[MANIFEST] Wrote N file hash(es) to plugin-manifest.json`.

- [ ] **Step 5: Lint and commit**

Run: `pnpm eslint 'src/plugins/utility/commands/**'`
Expected: no errors. Then:

```bash
git add src/plugins/utility/commands/ plugin-manifest.json
git commit -m "refactor: extract analytics subcommand handlers into modules behind thin dispatcher"
```

---

## Phase 6: remoteInteraction Split (Low)

`src/queue/remoteInteraction.ts` (585 lines) is 11 single-responsibility classes co-located. Dependency analysis (verified): `RemoteGuildChannels.create` returns `RemoteChannel`, so guild must import channel (one-way). `DiscordAPI` is a leaf. Import path stability matters: `src/queue/jobs/processCommand.ts` and `tests/queue-locale.test.ts` import `remoteInteraction.js`.

### Task 9: Split remote interaction classes into src/queue/remote/ behind a barrel

**Files:**
- Create: `src/queue/remote/interaction.ts`, `options.ts`, `guild.ts`, `channel.ts`, `discordApi.ts`, `index.ts`
- Modify: `src/queue/remoteInteraction.ts` (becomes barrel)
- Test: `tests/queue-locale.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: `Collection` from `discord.js` (as used by the classes).
- Produces: default export `RemoteInteraction` plus named exports `RemoteOptions`, `RemoteGuild`, `RemoteGuildMembers`, `RemoteGuildChannels`, `RemoteGuildRoles`, `RemoteGuildBans`, `RemoteChannel`, `RemoteMessages`, `RemotePermissionOverwrites`, `DiscordAPI` — identical to the current file's surface.

- [ ] **Step 1: Create the leaf modules**

Move verbatim from `src/queue/remoteInteraction.ts`:
- `src/queue/remote/discordApi.ts` <- `DiscordAPI` class (577-end), exported
- `src/queue/remote/options.ts` <- `RemoteOptions` class (255-314), exported
- `src/queue/remote/channel.ts` <- `RemoteChannel` (489-535), `RemoteMessages` (536-554), `RemotePermissionOverwrites` (555-576), all exported; imports `DiscordAPI` from `./discordApi.js`
- `src/queue/remote/guild.ts` <- `RemoteGuild` (317-347), `RemoteGuildMembers` (348-381), `RemoteGuildChannels` (383-421), `RemoteGuildRoles` (423-448), `RemoteGuildBans` (450-487), all exported; imports `DiscordAPI` from `./discordApi.js` and `type { RemoteChannel }` from `./channel.js` (one-way: guild -> channel)

- [ ] **Step 2: Create src/queue/remote/interaction.ts and the index barrel**

- `src/queue/remote/interaction.ts` <- `RemoteInteraction` class (8-253), `export default class RemoteInteraction`; imports from `./options.js`, `./guild.js`, `./channel.js`, `./discordApi.js` as the class body requires.
- `src/queue/remote/index.ts`:

```typescript
export { RemoteOptions } from './options.js';
export { RemoteGuild, RemoteGuildMembers, RemoteGuildChannels, RemoteGuildRoles, RemoteGuildBans } from './guild.js';
export { RemoteChannel, RemoteMessages, RemotePermissionOverwrites } from './channel.js';
export { DiscordAPI } from './discordApi.js';
export { default } from './interaction.js';
```

- [ ] **Step 3: Rewrite src/queue/remoteInteraction.ts as a barrel**

Replace the entire file content with:

```typescript
export {
    RemoteOptions,
    RemoteGuild,
    RemoteGuildMembers,
    RemoteGuildChannels,
    RemoteGuildRoles,
    RemoteGuildBans,
    RemoteChannel,
    RemoteMessages,
    RemotePermissionOverwrites,
    DiscordAPI
} from './remote/index.js';
export { default } from './remote/index.js';
```

- [ ] **Step 4: Run tests to verify behavior preserved**

Run: `pnpm vitest run tests/queue-locale.test.ts` and `pnpm typecheck`
Expected: PASS (`processCommand.ts` and the test import through the barrel).

- [ ] **Step 5: Lint and commit**

Run: `pnpm eslint 'src/queue/**'`
Expected: no errors. Then:

```bash
git add src/queue/remoteInteraction.ts src/queue/remote/
git commit -m "refactor: split remoteInteraction classes into focused modules behind barrel"
```

---

## Phase 7: Final Verification and Documentation

### Task 10: Full verification, codemap refresh, manifest commit

**Files:**
- Modify: `src/utils/codemap.md`, `src/core/codemap.md`, `src/queue/codemap.md`, `src/plugins/automod/commands/codemap.md`, `src/plugins/utility/commands/codemap.md`

- [ ] **Step 1: Run the full verification gate**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass. Quote the output in the final report.

- [ ] **Step 2: Regenerate and commit the manifest if stale**

Run: `pnpm manifest` then `git status --short plugin-manifest.json`. If modified:

```bash
git add plugin-manifest.json
git commit -m "chore: regenerate plugin manifest after refactor"
```

- [ ] **Step 3: Refresh the codemaps for changed directories**

For each of the 5 codemap files listed above: read the current file, enumerate the new module files in that directory, and rewrite the Responsibility / Design / Flow / Integration sections to reflect the split (barrels, new modules, dependency directions). Do not invent content — describe what exists.

- [ ] **Step 4: Commit documentation**

```bash
git add src/utils/codemap.md src/core/codemap.md src/queue/codemap.md src/plugins/automod/commands/codemap.md src/plugins/utility/commands/codemap.md
git commit -m "docs: refresh codemaps for god-file refactor"
```

---

## Out of Scope (with rationale)

- `src/plugins/moderation/commands/case.ts` (568), `blacklist.ts` (536), `src/plugins/utility/commands/tag.ts` (534), `src/utils/metrics.ts` (519): large but single-purpose; the god-pattern is mild. Revisit only if they grow.
- `src/types/shared.ts` (679): type definitions; cheap to maintain. (Note: it contains a duplicate `AutomodConfig` at line 498 vs `src/types/config.ts:106` — a follow-up type dedup candidate, not part of this refactor.)
- `src/generated/**`: protobuf output, never hand-edited.
