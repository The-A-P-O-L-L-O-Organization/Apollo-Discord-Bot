# Apollo I18n/L10n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add internationalization (i18n) and localization (l10n) to Apollo Discord Bot so slash command metadata, replies, embeds, buttons, errors, mod-logs, and event messages render in the invoking user's language with a per-guild override. No implementation in this plan phase — research findings from explorer, librarian, and oracle agents are synthesized into buildable tasks.

**Architecture:** Central `src/i18n/` service module (singleton `I18nService`) backed by `i18next` + `i18next-fs-backend`, per-plugin locale namespaces (`src/plugins/<id>/locales/<DiscordCode>/common.json`), Discord native command localizations for names/descriptions plus runtime `t()` for everything the bot renders. Locale resolved once at gateway (`guild override > interaction.locale > interaction.guildLocale > en-US`) and carried through BullMQ to workers. Sandboxed third-party plugins access translations via a new low-privilege `api:i18n` RPC capability, never via direct fs.

**Tech Stack:** `i18next` + `i18next-fs-backend` (primary), Discord.js v14 `setNameLocalizations` / `setDescriptionLocalizations` (native command metadata), i18next built-in plural resolver (suffixes `_one`/`_few`/`_many`/`_other`, no hand-rolled interpolation, no `i18next-icu` in v1), `chokidar` for dev hot-reload only, `i18next-parser` for CI key extraction.

**Spec:** This plan synthesizes explorer recon (string inventory, queue locale drop), librarian research (library comparison, Discord locale docs), and oracle design (service placement, rollout, risks). No prior i18n code exists in repo.

## Locked Decisions (owner Q&A 2026-09-22)

- **Engine: Option A — `i18next` + `i18next-fs-backend`.** Community translators available; namespaces, `getFixedT` concurrency safety, and `i18next-parser` CI tooling required. `node-polyglot` and hand-rolled rejected; `@formatjs/intl` deferred unless strict ICU demanded.
- **V1 locales: pilot `en-US` + `es-ES` + `de`; fast-follow wave 2 `it` + `pl` + `el`.** Translator pool covers Spanish, German, Italian, Polish, Greek. Pilot proves pipeline on Romance + Germanic; Polish exercises hard plurals (`one`/`few`/`many`/`other`) and Greek a distinct script in wave 2.
- **Priority: Option A (guild override wins) with C-prep.** Order frozen: guild setting > `interaction.locale` > `interaction.guildLocale` > `en-US`. Every `t()` call site takes optional `scope: 'personal' | 'public'` from day one; v1 resolver ignores it so a later PR can flip scoped behavior without touching ~95 commands.
- **DMs/users: Option A (stateless) with B-prep.** DMs resolve `interaction.locale ?? en-US`, no DB, no `/language-me` in v1. Resolver reserves a `userLocale` slot (always `null` in v1); `guild_user_store` via `setUserData('settings', ...)` documented but never called.
- **Governance: Permission A (`ManageGuild`) + Storage A (`settings.locale`) + audit entry.** Every language change writes mod-log/audit entry (actor, old, new). Read-modify-write via `updateGuildData` mandatory so settings writes never clobber locale.
- **Interlink: Option A (allowlisted per-call `locale`).** `InterlinkContext.locale?: string` validated via `isSupported()`, fallback `en-US`; never pre-translated strings, never implicit inheritance, never English-only gap.

## Global Constraints

- **Language versions:** Node.js 22+ LTS, TypeScript 5.x, ESM only (`"type": "module"`). `i18next@26+` ships dual CJS/ESM — import via ESM (confirm at Task 1 implementation time; dependency not yet installed).
- **Dependency policy:** New npm deps limited to `i18next`, `i18next-fs-backend` (prod) plus `i18next-parser` and `chokidar` (dev/CI only). No `node-polyglot` (no namespaces, weak TS). No per-request machine translation via `src/utils/translation.ts` (Argos HTTP, 30s timeout) for UI strings — that path stays exclusive to the `/translate` user-content feature.
- **Style:** 4-space indent, single quotes, semicolons, no trailing commas, `eqeqeq`, `curly: all`. New `src/i18n/` must pass `pnpm lint` from first PR. No emojis in source or docs. No code comments unless explicitly requested.
- **Module placement:** New top-level `src/i18n/`, not `src/utils/` (stateless helpers only) and not `src/core/` (avoids `Plugin -> I18nService -> db -> config` circular import). Mirrors `src/config/`, `src/db/`, `src/queue/`.
- **Service contract:** `t()` is synchronous (dictionaries preloaded in memory). Only `resolveLocale()` / `getGuildLocale()` are async (DB on cache miss). Missing key returns `defaultValue ?? key`, logs warn + increments metric, never throws, never returns empty string.
- **Naming:** New service files use `i18n` naming (`src/i18n/I18nService.ts`, `src/utils/locale.ts` if a thin resolver shim is needed). Never reuse `translation.ts` name — that module is the LibreTranslate/Argos proxy and collision would confuse imports.
- **Command contract:** Additive and back-compat. `export default { name, description, execute }` keeps working (English fallback). New optional fields `nameLocalizations` / `descriptionLocalizations` are passed through by deploy pipeline. Never change `execute(interaction)` signature — locale is derived from `interaction` + singleton, not a new parameter.
- **Storage:** No Knex migration. Guild locale lives in existing `guild_store` via `getGuildData('settings', guildId)` / `updateGuildData('settings', guildId, (cur) => ({ ...cur, locale }))` (read-modify-write mandatory — never bare `setGuildData`, which would clobber sibling keys) (`src/utils/db.ts`, `src/db/adapter.ts`). Key name frozen as `locale` (BCP47, e.g. `es-ES`). DMs (`guildId === null`) skip DB. B-prep: v2 per-user writes use 3-arg `setUserData('settings', guildId, userId, ...)` form.
- **Queue transport:** `interaction.locale` / `guildLocale` / `resolvedLocale` triple travels in every queued job. Serializer and reconstructor change atomically in one PR, never separately.
- **Sandbox:** Worker child never reads locale JSON from fs. Single low-privilege `api:i18n` RPC resolved host-side from preloaded dictionaries. Never grant `fs:read` to fix i18n. Never list `api:i18n` in `HIGH_RISK_CAPABILITIES`.
- **Deploy:** Native `*_localizations` must survive both deploy writers. Canary every localization deploy with guild deploy first (instant); global deploy takes up to 1h and rolls back slowly. `en-US` default description always populated.
- **Testing:** Vitest (`maxWorkers: 1`, `fileParallelism: false`). New `src/i18n/**` is covered (unlike `src/index.ts`, `bin/**`, `scripts/**` which are excluded). Locale-matrix tests live in as few files as possible to avoid lengthening the single-threaded suite.
- **Manifest:** `**/locales/**` translation JSON is data, excluded from `plugin-manifest.json` integrity hashing. Translators never hand-edit hashes; if security mandates hashing, automate `pnpm manifest` in the translation CI lane.
- **CLI scope:** CLI output (`src/cli/`, `*_cli` dirs), socket handlers, Interlink RPC business strings, and transcript generator stay English in v1.

## Review Focus

1. **Queue locale preservation:** `serialize -> msgpackr encode -> RemoteInteraction reconstruct` must preserve `resolvedLocale`. Test: Spanish fixture interaction yields Spanish error embed in worker path. Gateway-direct tests passing while queued commands fail is the expected failure mode if this is wrong.
2. **Sandbox capability safety:** `api:i18n` added to both allowlists (`pluginManifest.ts` + `PluginManager.ts`) simultaneously, resolved host-side, respecting `isOversize()` RPC limits. Test: sandboxed fixture plugin translates without fs access; unknown capability still rejected.
3. **Deploy pipeline divergence:** `scripts/deploy-commands.ts` and `PluginManager._syncDiscordCommands()` must share one `buildCommandPayload()` helper. Test: guild-deploy vs boot-sync produce identical `name_localizations` payloads; validator warns on missing localizations.
4. **Missing-key / pluralization silence:** Missing keys must return `defaultValue ?? key` (never throw, never empty string); i18next plural suffixes (`_one`/`_few`/`_many`/`_other`) cover Polish/Greek wave-2 follow. Test matrix: `en-US` + `es-ES` + `de` (pilot); `pl` joins the matrix in wave 2 (Task 7). CI key-parity check fails on unextracted `t()` keys or uninterpolated `{var}`.
5. **Cache coherence and hot-path latency:** `getGuildLocale()` on every command must hit in-process TTL cache; cross-pod invalidation rides existing Redis `apollo:event:*` pub/sub. Test: locale change propagates within TTL; worker never re-reads DB on cache hit.

---

### Task 1: Foundation — `src/i18n/` service, locale codes, English dictionary

**Files:**
- Create: `src/i18n/I18nService.ts`
- Create: `src/i18n/supportedLocales.ts` — frozen pilot list `['en-US', 'es-ES', 'de']` (`SUPPORTED_LOCALES`), `DEFAULT_LOCALE = 'en-US'`; wave-2 (`it`, `pl`, `el`) adds entries here only
- Create: `src/i18n/localeCache.ts` — TTL 5 min, LRU cap 5k (frozen here; Task 3 wires subscription)
- Create: `src/i18n/dictionaries/en-US/common.json`
- Create: `src/i18n/dictionaries/es-ES/common.json` (pilot stub, core keys only)
- Create: `src/i18n/dictionaries/de/common.json` (pilot stub, core keys only)
- Create: `src/i18n/index.ts`
- Modify: `src/index.ts` — call `init()` in `startGateway()` after `assertOperatorAgreement`
- Create: `tests/i18n.test.js` (normalize, fallback, missing-key contract, `scope` ignored, `userLocale` slot)

**Interfaces:**
- Produces: `i18n` singleton with `init()`, `t(key, opts?: { lng?, vars?, count?, scope?: 'personal' | 'public' })` (`scope` accepted but ignored in v1 — C-prep), `tFor(interaction, opts?: { scope?: 'personal' | 'public' })`, `resolveLocale(opts: { locale?, guildLocale?, guildId?, userLocale?: string | null })` (`userLocale` always `null` in v1 — B-prep; v2 reads `setUserData('settings', guildId, userId, ...)` 3-arg form), `getGuildLocale()`, `setGuildLocale()`, `getAvailableLocales()`. Later tasks (queue, plugins, sandbox) consume it.
- Dictionary keys: `common` namespace for core errors, queue-failure, permission-denied strings. Plural keys use i18next suffixes (`_one`/`_few`/`_many`/`_other`); no hand-rolled interpolation anywhere.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { normalize, isSupported, DEFAULT_LOCALE } from '../src/i18n/supportedLocales.js';

describe('supportedLocales', () => {
    it('normalizes BCP47 and falls back to en-US', () => {
        expect(normalize('es-ES')).toBe('es-ES');
        expect(normalize('de')).toBe('de');
        expect(normalize('xx-YY')).toBe(DEFAULT_LOCALE);
    });
    it('supports the frozen pilot set', () => {
        expect(isSupported('en-US')).toBe(true);
        expect(isSupported('es-ES')).toBe(true);
        expect(isSupported('de')).toBe(true);
        expect(isSupported('xx')).toBe(false);
    });
    it('accepts scope without changing v1 output (C-prep)', async () => {
        const { i18n } = await import('../src/i18n/index.js');
        expect(i18n.t('common:ok', { scope: 'public' })).toBe(i18n.t('common:ok', { scope: 'personal' }));
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation (`supportedLocales.ts` with frozen pilot `['en-US', 'es-ES', 'de']` selected from the 34 Discord codes, `DEFAULT_LOCALE = 'en-US'`, `I18nService` with pilot dictionaries + `preload: ['en-US', 'es-ES', 'de']`, in-process `Map` cache TTL 5 min / LRU 5k)**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

### Task 2: Queue locale transport fix (serializer + reconstructor atomically)

**Files:**
- Modify: `src/queue/serializeInteraction.ts` — widen input type (lines 4-15) with `locale?: string`, `guildLocale?: string | null`, `resolvedLocale?: string`; copy real `interaction.locale ?? 'en-US'` and `interaction.guildLocale ?? null` plus new `resolvedLocale` instead of hardcoded `'en-US'` literals (lines 52-53)
- Modify: `src/types/shared.ts` — extend `SerializedInteraction` (lines 67-68) with `resolvedLocale: string`
- Modify: `src/queue/remoteInteraction.ts` — reconcile schema mismatch (constructor is `(data, rest, opts)`; it reads flat keys `interactionToken`/`userId`/`commandName` while the serializer emits nested `SerializedInteraction`): map `locale`/`guildLocale`/`resolvedLocale` through reconstruction and expose them as getters so worker-executed commands can resolve language
- Modify: `src/queue/jobs/processCommand.ts` — resolve locale before `enqueueCommand` branch, sign with existing HMAC (`signJobData`), worker uses `resolvedLocale` with DB fallback for old jobs missing the field
- Create: `tests/queue-locale.test.js` — round-trip contract test (serialize → msgpackr encode → decode → reconstruct)

**Interfaces:**
- Consumes: `I18nService.resolveLocale()` from Task 1.
- Produces: locale triple preserved across `serialize -> msgpackr -> RemoteInteraction`. Task 6 (worker/sandbox) consumes it.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { encode, decode } from 'msgpackr';

describe('queue locale round-trip', () => {
    it('preserves resolvedLocale through serialize, codec, and reconstruct', async () => {
        const { serializeInteraction } = await import('../src/queue/serializeInteraction.js');
        const { RemoteInteraction } = await import('../src/queue/remoteInteraction.js');
        const live = {
            id: '1', commandId: 'c1', commandName: 'ping', createdTimestamp: Date.now(),
            channelId: 'ch1', guildId: 'g1', token: 't',
            user: { id: 'u1', username: 'tester' }, options: { data: [] },
            locale: 'es-ES', guildLocale: 'es-ES', resolvedLocale: 'es-ES'
        };
        const mockRest = {};
        const serialized = serializeInteraction(live);
        const remote = new RemoteInteraction(decode(encode(serialized)), mockRest, {});
        expect(remote.locale).toBe('es-ES');
        expect(remote.resolvedLocale).toBe('es-ES');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

### Task 3: Guild locale preference — `/language` command, cache, cross-pod invalidation

**Files:**
- Create: `src/plugins/admin/commands/language.ts` — `ManageGuild`-only, guild-scoped, single string option `locale` with NO `choices` (Discord caps choices at 25; 34 codes would fail deploy) — validate via `isSupported()` inside `execute()`, error via `t('admin:language.unsupported')`; writes via `updateGuildData('settings', guildId, (cur) => ({ ...cur, locale }))` (read-modify-write mandatory — never bare `setGuildData`, which would clobber sibling settings keys); invalidates local cache; emits `eventBus.emit('i18n:localeChanged', { guildId, locale })`
- Modify: `src/i18n/localeCache.ts` — `Map<guildId, { locale, expiresAt }>`, TTL 5 min, LRU cap 5k; export `subscribeInvalidation(eventBus)`; called from `src/index.ts` `startGateway()` boot hook
- Modify: `src/core/EventBus.ts` subscription — `subscribeInvalidation` listens on existing `apollo:event:*` Redis pub/sub (`enableCrossPod`), no new Redis topology
- Modify: `src/utils/modLog.ts` (or `guildLogging.ts`) — `logLocaleChange({ guildId, actor, oldLocale, newLocale })`; every language change writes an audit entry
- Modify: `src/index.ts` gateway error paths (`handleInteraction` queue-failure embed and inline-error embed — locate by function name, line numbers drift) and `processCommand.ts` worker error embeds (lines 158-196) to use `tFor` / `t(key, resolvedLocale)`

**Interfaces:**
- Consumes: Task 1 service + Task 2 transport.
- Produces: per-guild override honored with priority over user locale. Later plugin tasks read it via `resolveLocale()`.

- [ ] **Step 1: Write the failing test (`tests/language-command.test.js`: `updateGuildData` spy receives merge updater preserving sibling keys; unsupported code `xx` yields localized error; `logLocaleChange` called with actor/old/new; `subscribeInvalidation` clears cache entry on `i18n:localeChanged`)**
- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

### Task 4: Deploy pipeline — shared payload builder with native localizations

**Files:**
- Create: `src/i18n/commandPayload.ts` (frozen location — importable by both writers without pulling queue code into the deploy script) — single shared `buildCommandPayload(cmd)` helper emitting `name_localizations` / `description_localizations` plus option/choice maps
- Modify: `scripts/deploy-commands.ts` (`loadCommands`; `validateCommands`) — import shared helper; `data.toJSON()` path already preserves localizations, `name/description/options` fallback path warns and skips localization
- Modify: `src/core/PluginManager.ts` (`_syncDiscordCommands`) — same shared helper, eliminating guild-deploy-vs-boot-sync divergence
- Add: `--check-locales` lint mode warning on missing `en-US` or overlong localized strings (8000-char combined budget)

**Interfaces:**
- Consumes: command modules with optional `nameLocalizations` / `descriptionLocalizations`.
- Produces: Discord client renders localized names/descriptions. Runtime strings still need Task 5+ conversion.

- [ ] **Step 1: Write the failing test (`tests/command-payload.test.js`: builder-style fixture with `setDescriptionLocalizations` yields identical payload from both writers; legacy-style fixture warns on missing localizations; overlong localized description triggers `--check-locales` warning))**
- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

### Task 5: Pilot plugin (`utility`, `ping.ts` + one builder-style command) end-to-end

**Files:**
- Create: `src/plugins/utility/locales/en-US/common.json`, `src/plugins/utility/locales/es-ES/common.json`, `src/plugins/utility/locales/de/common.json` (pilot trio — `de` mandatory per Locked Decisions)
- Modify: `src/plugins/utility/commands/ping.ts` (legacy `{ name, description, execute }` style — proves the fallback deploy path) — runtime `t()` for `Pong!` title, `Round-Trip Latency` / `API Latency` / `Status` fields, `Requested by` footer
- Modify: one `SlashCommandBuilder`-style utility command (e.g. `help.ts`) with `setNameLocalizations` / `setDescriptionLocalizations` (proves the `data.toJSON()` deploy path — `ping.ts` alone cannot prove both)
- Modify: `src/core/Plugin.ts` (`_loadCommands`) — optionally walk `locales/` at `onLoad` via `loadNamespaces(pluginId)`; missing dir is legal (English fallback); pattern frozen to `getFixedT(resolvedLocale, pluginId)` (no `t('<plugin>.<key>')` alternative — one pattern only, avoiding double-load with Task 8 `chokidar.reloadResources`)
- Deploy: guild-deploy (`--guild`) to canary server first, then global

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: proven pattern (`getFixedT(resolvedLocale, pluginId)`) replicated by Task 7.

- [ ] **Step 1: Write the failing test (`tests/utility-i18n-matrix.test.js`: `es-ES` and `de` fixtures render translated `Pong!` embed via `getFixedT`; builder-style fixture payload carries `description_localizations`; `localeCompare` sort paths in `help.ts` still pass))**
- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

### Task 6: Worker sandbox + Interlink locale propagation

**Files:**
- Modify: `src/core/worker/pluginManifest.ts` (`KNOWN_CAPABILITIES`) — add `api:i18n`
- Modify: `src/core/PluginManager.ts` (`ALL_PLUGIN_CAPABILITIES`) — add `api:i18n` (both allowlists simultaneously or `normalizeCapabilities()` rejects third-party `plugin.json`); assert `HIGH_RISK_CAPABILITIES.has('api:i18n') === false` in test
- Create: host-side `api:i18n` resolution (greenfield — `workerHost.ts` `getGrantedCapabilities`/`startPlugin` region currently contains NO RPC dispatch; build the handler from scratch resolving via singleton + shared Task 3 cache, respecting `isOversize()` / `MAX_PAYLOAD_BYTES` in `src/core/worker/rpc.ts`); never add to `HIGH_RISK_CAPABILITIES`
- Modify: `src/core/worker/workerChild.ts` — child calls `host.call('api:i18n', { key, locale, vars, count })`
- Modify: `src/types/shared.ts` (`InterlinkContext`) — optional `locale?: string`, validated via `isSupported()` on the callee, never inheriting caller bot guild locale across trust boundary; callee applies same fallback chain, never pre-translated strings
- Modify: callee handler in `src/plugins/interlink/` — apply `isSupported()` + `en-US` fallback at request ingress (type change alone is insufficient)
- Modify: `src/types/shared.ts` (`PluginContext`, `src/types/plugin.ts`) — additive `i18n: { t, tFor, resolveLocale, getGuildLocale }`

**Interfaces:**
- Consumes: Tasks 1-3 (Task 3 cache required for host-side resolution).
- Produces: sandboxed and bot-to-bot paths resolve locale safely. Unblocks third-party rollout (Task 8).

- [ ] **Step 1: Write the failing test (`tests/worker-i18n.test.js`: sandboxed fixture plugin translates via `api:i18n` without fs access; unknown capability still rejected; `HIGH_RISK_CAPABILITIES` excludes `api:i18n`; oversize payload rejected per `rpc.ts` limit))**
- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

### Task 7: Remaining bundled plugins per-plugin conversion

**Files (order by blast radius):**
1. `utility` remainder (31 command files: `serverinfo`, `userinfo`, `avatar`, `8ball`, `joke`, `roll`, `embed`, `level`, `leaderboard`, `remind`, `poll`, `analytics`, `tag`, `translate`, `giveaway`, `report`, etc.) + `events/messageCreate.ts` (XP level-up)
2. `tickets` (13 files; `Claim Ticket` button lives in `commands/ticket.ts`, `Close Ticket` in `events/interactionCreate.ts`)
3. `moderation` (40 files — densest error embeds, e.g. `ban.ts` `Missing User` from line 49; `canModerate` reasons in `src/utils/moderation.ts`; `events/guildMemberAdd/Remove.ts` welcome/goodbye)
4. `automod` (`automod.ts` 771 lines, `scanMessage.ts`, `events/messageCreate.ts`)
5. `admin` (7 files), `integrations` (1 file), `interlink` (1 file) last
- Shared choke points in same wave: `src/utils/discordErrors.ts` (`handleDiscordError`, `safeReply`, `safeFollowUp`), `src/utils/modLog.ts`, `src/utils/guildLogging.ts`, `config.ts` defaults (`welcome.message`, `tickets.welcomeMessage`, `moderation.defaultReason`) as fallback-locale templates

**Interfaces:**
- Consumes: Tasks 1-6 pattern (`getFixedT(resolvedLocale, pluginId)` only).
- Each plugin PR adds `src/plugins/<id>/locales/<BCP47>/common.json` (frozen layout — e.g. `src/plugins/moderation/locales/de/common.json`) + converts `execute()` strings. Button custom-ids stay stable while labels localize. Wave 2 adds `it` + `pl` + `el` dictionaries and extends the matrix with `pl` plural forms.

- [ ] **Step 1: Write the failing test (per plugin file in consolidated `tests/i18n-matrix.test.js`: locale-matrix render for `en-US`/`es-ES`/`de`, `pl` forms from wave 2; single consolidated matrix file keeps the single-threaded Vitest suite fast)**
- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

### Task 8: Tooling, docs, third-party publish

**Files:**
- Add: `pnpm lint:locales` CI script (separate from `pnpm lint` — `tests/**`, `scripts/**`, `bin/**` are ESLint-ignored, so locale lint lives outside the flat config): `i18next-parser` extraction + key parity across locale files + no empty values + no uninterpolated `{var}`
- Modify: `scripts/generate-manifest.mjs` — IMPLEMENT `**/locales/**` exclusion from integrity hashing (it hashes every file under `src/plugins/` today; without this change translator PRs churn hashes and break `verifyPluginManifest`); translators never hand-edit hashes, `pnpm manifest` automated in the translation CI lane if hashing is later mandated
- Create: `docs/i18n.md` — translator guide (namespace = plugin id, `en-US` canonical, fallback chain, plural `_one`/`_few`/`_many`/`_other` convention, `getFixedT` concurrency note for gateway+worker, German `du`/`Sie` style decision, wave-2 `it`/`pl`/`el` order)
- Modify: `CONTRIBUTING.md` (if present) — locale PR lane + `pnpm manifest` guidance
- Add: dev hot-reload (`chokidar` → `i18n.reloadResources(lng, ns)`) and prod admin `/reload-locales` socket handler via `manager.registerSocketHandler`
- Publish: `api:i18n` capability + `locales/` convention for third-party (`data/plugins/<id>/locales/<BCP47>/common.json` loaded via RPC, never worker fs). Missing locales = English fallback, never load failure.

- [ ] **Step 1: Write the failing test (CI parity check on fixture locales: missing `de` key fails; empty value fails; uninterpolated `{var}` fails; `locales/**` paths excluded from manifest hash)**
- [ ] **Step 2: Run the test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run the test to verify it passes**
- [ ] **Step 5: Run existing tests to verify no regressions**

---

## Locale Resolution (frozen)

```text
interaction received (src/index.ts:handleInteraction)
  [A] interaction.locale present? YES -> candidate = normalize(interaction.locale), NO -> null
  [B] guildId null (DM)? YES -> resolved = candidate ?? 'en-US', DONE (no DB)
  [C] cache hit (localeCache.ts, TTL 5-10 min)? HIT -> guildPref = cached, MISS -> guildPref = getGuildData('settings', guildId).locale
  [D] guildPref set AND isSupported? YES -> resolved = guildPref (guild override WINS), NO -> candidate ?? guildLocaleHint ?? 'en-US'
  [E] isSupported(resolved)? YES -> attach interaction.resolvedLocale, DONE. NO -> strip region ('es-ES' -> 'es'), retry, else 'en-US' + warn once
  [F] queue enabled AND canQueue !== false? YES -> serialize { locale, guildLocale, resolvedLocale } -> worker uses resolvedLocale, DB fallback only for old jobs. NO -> execute inline.
```

Priority: **guild stored preference > `interaction.locale` (user client) > `interaction.guildLocale` (server setting) > `en-US`**. `fallbackLng: { 'en-GB': ['en-US'], 'es-419': ['es-ES'], default: ['en-US'] }` mirrors Discord's own fallback. BCP47 directory names match Discord codes verbatim (`{{lng}}`).

## Dictionary Layout (frozen)

```text
src/i18n/dictionaries/en-US/common.json        # core / shared (errors, footer, permission strings)
src/i18n/dictionaries/es-ES/common.json        # core pilot
src/i18n/dictionaries/de/common.json           # core pilot
src/plugins/moderation/locales/en-US/common.json
src/plugins/moderation/locales/es-ES/common.json
src/plugins/moderation/locales/de/common.json
src/plugins/utility/locales/en-US/common.json
src/plugins/utility/locales/es-ES/common.json
src/plugins/utility/locales/de/common.json
```

Frozen: per-plugin `locales/<BCP47>/common.json` everywhere (no bare `<lng>.json` variant). No central-only `locales/` layout. Wave 2 adds `it`/`pl`/`el` triples per plugin.

Namespace = plugin id via `getFixedT(resolvedLocale, pluginId)` (only pattern — no `t('<plugin>.<key>')` alternative), core strings in `common` as `fallbackNS`. `preload: ['en-US', 'es-ES', 'de']`, lazy `loadNamespaces` at `onLoad` or eager-load enabled plugins at boot. `saveMissing: true` + `addPath` in dev only; prod `saveMissing: false`, `returnEmptyString: false`, `returnNull: false`.

## Native vs Runtime Split (frozen)

| String class | Mechanism |
|---|---|
| Slash `name` / `description`, option `name` / `description` / `choices[].name` | Discord native `name_localizations` / `description_localizations` via shared `buildCommandPayload()` |
| Replies, embeds, buttons, errors, validation, mod-logs, event messages | Runtime `t()` / `tFor(interaction)` |
| `/language` command | Both (native description + runtime confirmation) |
| CLI, socket RPC output, Interlink business params | English in v1 (out of scope) |

## String Inventory (explorer ground truth)

~95 command files (`admin` 7, `moderation` 40, `tickets` 13, `utility` 31, `automod` 2, `interlink` 1, `integrations` 1), 17 event files, ~50 `src/utils/*.ts` string-heavy files, ~1000-2000 hardcoded English literals, zero existing i18n. Two command styles coexist (legacy `{ name, description, options }` e.g. `ping.ts`, and `SlashCommandBuilder data`); both deploy paths must be handled, and the pilot converts one of each. `Plugin._loadCommands()` stamps `pluginId` on every module — natural namespace key. Note: `src/utils/translation.ts` is the Argos/LibreTranslate user-content proxy — never reuse its name for UI-string i18n.

## Library Decision (librarian verdict)

Primary `i18next` + `i18next-fs-backend`: only candidate with ESM-native support, per-plugin namespaces, lazy loading, `getFixedT` concurrency safety, `fallbackLng` / `fallbackNS`, and `i18next-parser` / `saveMissing` CI tooling. Fallback `@formatjs/intl` (`intl-messageformat` + `createIntl`) only if strict ICU `select` + CLDR date/number skeletons become a hard requirement. `node-polyglot` rejected.

## Risks (oracle top 5, condensed)

1. Queue/worker locale drop (prod-only wrong-language replies) — mitigate with atomic serializer fix + round-trip contract test.
2. Sandbox fs vs capability sprawl — mitigate with single `api:i18n` host-resolved RPC, no fs grant.
3. Deploy footgun (two writers stripping localizations, 1h global propagation) — mitigate with shared helper + canary guild deploys.
4. Silent missing-key / plural breakage — mitigate with `t()` never-throw contract + i18next built-in plural resolver + CI parity lint + pilot matrix (`en-US`/`es-ES`/`de`, `pl` joins in wave 2).
5. Hot-path DB read + cross-pod incoherence + manifest churn — mitigate with in-process TTL cache + existing Redis pub/sub invalidation + `locales/**` hash exclusion.

## Open Decisions

Resolved — see Locked Decisions 1-6 above. No owner action required before Task 3. Remaining translators' choice (German `du`/`Sie` style, wave-2 `it`/`pl`/`el` order) is settled in Task 8 translator guide, not here.

## Explicitly Out of Scope for v1

CLI output, socket RPC text, Interlink business params (locale travels as metadata only), transcript generator full localization, per-user persisted locale, Redis shared locale cache, strict ICU MessageFormat, Translator PR automation beyond `lint:locales`.
