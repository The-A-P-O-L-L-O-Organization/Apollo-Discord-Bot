# Technical Debt Scan Report — Apollo Discord Bot

**Generated:** 2026-09-27  
**Scope:** `src/` directory and `package.json`  
**Total source files:** 235 TypeScript files, ~46,766 lines of code

---

## Executive Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| **Dependencies** | 0 | 4 | 2 | 1 | 7 |
| **Legacy Patterns** | 0 | 3 | 5 | 2 | 10 |
| **Code Quality** | 1 | 4 | 8 | 6 | 19 |
| **Test Gaps** | 0 | 5 | 8 | 3 | 16 |
| **Architecture** | 0 | 2 | 6 | 4 | 12 |
| **Security** | 0 | 3 | 4 | 2 | 9 |
| **Performance** | 0 | 2 | 3 | 2 | 7 |
| **Operational** | 0 | 2 | 5 | 3 | 10 |
| **TOTAL** | **1** | **25** | **41** | **23** | **90** |

---

## 1. Outdated Dependencies

### High Severity

| Package | Current | Wanted | Latest | Risk |
|---------|---------|--------|--------|------|
| `@connectrpc/connect` | 1.7.0 | 2.2.0 | 2.2.0 | Breaking changes in v2; ConnectRPC protocol updates |
| `@connectrpc/connect-node` | 1.7.0 | 2.2.0 | 2.2.0 | Required for interlink gRPC/Connect functionality |
| `@bufbuild/protobuf` | 1.10.1 | 2.15.0 | 2.15.0 | Protobuf schema changes may break generated code |
| `@bufbuild/protoc-gen-es` (dev) | 1.10.1 | 2.15.0 | 2.15.0 | Build-time tool; mismatched versions break codegen |

### Medium Severity

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `@grpc/proto-loader` | 0.7.15 | 0.8.1 | Minor; used for legacy gRPC in interlink |
| `typescript` (dev) | 6.0.3 | 7.0.2 | TS 7.x has breaking changes; may require config updates |

### Low Severity

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `i18next-cli` (dev) | missing | 1.74.1 | Only affects locale extraction CLI |

**Note:** No known vulnerabilities per `pnpm audit` (as of scan date).

---

## 2. Legacy Patterns & ESM/CommonJS Mismatches

### High Severity

| File | Issue | Impact |
|------|-------|--------|
| `src/db/migrations/*.cjs` | Migration files use CommonJS (`exports.up = async function...`) while rest of codebase is ESM | Requires `.cjs` extension; cannot use `import`; blocks full ESM migration |
| `src/utils/db.ts:68-80` | Runtime `if (isTest && config.database.type === 'sqlite')` branches between Knex and raw `better-sqlite3` | Dual code paths increase maintenance burden; test/production divergence |
| `src/db/knex.ts` | `better-sqlite3` client instantiated via dynamic import | Works but prevents static analysis; unusual pattern |

### Medium Severity

| File | Issue | Impact |
|------|-------|--------|
| `src/utils/healthServer.ts:71` | `await knex.raw('SELECT 1')` — raw SQL in health check | Works but bypasses query builder; inconsistent with adapter pattern |
| `src/utils/db.ts:88` | `await db.raw(...)` for SQLite UPSERT | Vendor-specific SQL; not portable to PostgreSQL |
| `src/core/PluginRegistry.ts:40` | `JSON.parse(readFileSync(...))` — sync I/O in async context | Blocks event loop; should use async fs |
| `src/core/worker/pluginManifest.ts:43-44` | Sync `JSON.parse` on plugin manifest | Same as above |
| `src/plugins/interlink/plugin.ts:48` | `JSON.parse(Buffer.from(payload).toString('utf8'))` — double decode | Unnecessary complexity; could be simplified |

### Low Severity

| File | Issue |
|------|-------|
| `src/types/gateway.ts:126,137` | `eval: (script: string) => Promise<unknown>` — dangerous method name shadows global `eval()` |
| `src/types/rpc-schemas.ts:62` / `src/types/rpc.ts:120` | `'eval'` as RPC command type — confusing naming |

---

## 3. Code Quality Issues

### Critical Severity

| File | Lines | Issue | Evidence |
|------|-------|-------|----------|
| `src/plugins/automod/commands/automod.ts` | 798 | **God command** — 14 subcommands in single file; violates SRP | 17 subcommand handlers; 798 lines; handles config, word lists, exemptions, NSFW scanning |

### High Severity

| File | Lines | Issue |
|------|-------|-------|
| `src/utils/automod.ts` | 700 | Large utility module — combines spam tracking, burst detection, phishing detection, banned words, invite/link filtering, caps/mention checks |
| `src/core/PluginManager.ts` | 535 | Monolithic class — handles loading, enabling, dependency resolution, worker management, socket handlers, command sync |
| `src/core/EventBus.ts` | 420 | Handles events, APIs, state, cross-pod sync — three distinct responsibilities |
| `src/index.ts` | 472 | Application bootstrap + event routing + shutdown + leader election — too many concerns |

### Medium Severity

| File | Lines | Issue |
|------|-------|-------|
| `src/plugins/moderation/commands/mute.ts` | 271 | Complex fallback logic (timeout → role); i18n error in tests |
| `src/plugins/tickets/commands/ticket.ts` | ~500+ | Multiple ticket operations in one command file |
| `src/utils/analyticsCollector.ts` | 665 | Large collector with multiple responsibilities |
| `src/utils/raidDetection.ts` | 580 | Complex raid detection with ML-like scoring |
| `src/utils/transcriptGenerator.ts` | 448 | HTML generation + Discord embed building mixed |
| `src/utils/lruCache.ts` | 459 | Custom two-level LRU — consider battle-tested library |
| `src/plugins/admin/commands/reactionrole.ts` | 389 | Complex reaction role management |
| `src/utils/commandValidator.ts` | 415 | Zod schemas + custom validation logic mixed |

### Low Severity (Duplication)

| Pattern | Locations |
|---------|-----------|
| `getGuildData` / `setGuildData` boilerplate | 15+ command files |
| `i18n.resolveLocale` + `getFixedT` boilerplate | Every command handler |
| Embed building with `EmbedBuilder` + i18n | 50+ files |
| `safeError` + `handleDiscordError` + try/catch | Most command execute() functions |

---

## 4. Test Gaps

### High Severity — **494/1682 tests failing (29%)**

| Area | Failures | Root Cause |
|------|----------|------------|
| `mute.test.ts` | 26/32 | i18next v26 API incompatibility: `this.options.overloadTranslationOptionHandler is not a function` at `fixedT` call |
| `warn.test.ts` | 21/26 | Same i18n issue |
| `clear.test.ts` | 3/18 | Mock interaction shape mismatch |
| `manifest.test.ts` | 2/2 | File system mocking issues |
| `plugin.test.ts` (admin) | 1/1 | Mock `editReply` call structure |
| `interlink.test.ts` | 4/4 | Mock client/response structure |

**Critical Finding:** The i18next v26 upgrade broke the `getFixedT` usage pattern. The codebase uses `i18n.getFixedT(locale, ns)` which returns a `TFunction`, but v26 changed internal APIs causing `fixedT()` to crash.

### Medium Severity — Missing Coverage for Critical Paths

| Path | Coverage | Risk |
|------|----------|------|
| Worker sandbox (`workerHost.ts`, `workerChild.ts`) | Minimal | Plugin isolation, crash recovery untested |
| Plugin lifecycle (`onLoad`/`onEnable`/`onDisable`/`onUnload`) | Partial | No integration tests for dependency ordering |
| Database migrations | 0 | No migration up/down tests |
| Cross-pod EventBus | 0 | No multi-instance tests |
| Queue job processing (`processCommand.ts`) | Low | Job serialization/deserialization untested |
| Interlink gRPC/Connect client | Partial | Happy path only; error paths untested |
| Rate limiting (interlink) | 0 | Redis-backed rate limiter untested |
| Encryption/decryption at rest | Partial | Key rotation untested |

### Low Severity

- `locale-lint.test.ts` passes but validates only key existence, not translation quality
- No contract tests for plugin API (`api:sendMessage`, `api:commandReply`, etc.)
- No chaos testing for worker crash/restart scenarios

---

## 5. Architecture Smells

### High Severity

| Issue | Location | Impact |
|-------|----------|--------|
| **Plugin Manager God Class** | `src/core/PluginManager.ts` | 535 lines; handles discovery, loading, dependency resolution, worker spawning, capability indexing, socket handlers, command sync — violates SRP |
| **EventBus Triple Responsibility** | `src/core/EventBus.ts` | Event emission, RPC-style APIs (`provide`/`call`), and distributed state (`provideState`/`watchState`) in one class |

### Medium Severity

| Issue | Location | Impact |
|-------|----------|--------|
| **Tight Plugin Coupling** | `src/plugins/automod/commands/automod.ts` → `src/utils/automod.ts` → `src/utils/nsfwDetection.ts` | Automod command directly imports internal utils; hard to test in isolation |
| **Config Singleton Everywhere** | 100+ files import `config` from `src/config/config.ts` | Global mutable state; difficult to test with different configs |
| **Client Augmentation** | `src/index.ts:65-72` | `client.commands`, `client.config`, `client.stats`, `client.manager`, `client.bus`, `client.socketServer` added dynamically — no TypeScript safety |
| **Queue/Worker Coupling** | `src/queue/jobs/processCommand.ts` imports `commandModuleCache` from PluginManager | Circular-ish dependency; queue knows about plugin internals |
| **Hardcoded Capability List** | `src/core/PluginManager.ts:17-30` | `ALL_PLUGIN_CAPABILITIES` array must be manually kept in sync with actual capabilities |

### Low Severity

| Issue | Location |
|-------|----------|
| `src/types/shared.ts` | 679 lines — massive type dump; should be split by domain |
| `src/utils/automod.ts` + `src/plugins/automod/commands/automod.ts` | Duplicate `AutomodConfig` interface (lines 14-30 vs 221-239) |
| `src/utils/db.ts` | Dual adapter pattern (Knex + better-sqlite3) with runtime branching |

---

## 6. Security Concerns

### High Severity

| Issue | Location | Risk |
|-------|----------|------|
| **ENCRYPTION_KEY optional** | `src/config/config.ts:314` — `ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY') ?? ''` | Empty string allowed; `src/utils/encryption.ts:55` throws only at encrypt time, not startup |
| **Health endpoint unauthenticated by default** | `src/utils/healthServer.ts:26-27` | `if (!HEALTH_AUTH_TOKEN) return true;` — exposes `/health`, `/ready`, `/metrics` publicly unless explicitly configured |
| **SQLite DB file permissions** | `src/utils/db.ts:50` — `new Database(path.join(DATA_DIR, 'apollo.db'))` | File created with default permissions; no `mode` specified |

### Medium Severity

| Issue | Location | Risk |
|-------|----------|------|
| **Unvalidated plugin manifest loading** | `src/core/PluginManager.ts:288-296` | TOCTOU window between manifest read and file import; manifest verification happens but file could be swapped |
| **Dynamic import with cache-busting** | `src/core/PluginManager.ts:298` — `?t=${Date.now()}` | Defeats module caching; potential for loading inconsistent versions |
| **Raw SQL in db.ts** | `src/utils/db.ts:88-90` | SQLite `ON CONFLICT` raw query; parameterized but vendor-specific |
| **Socket token optional** | `src/cli/socket-server.ts:7` | `APOLLO_SOCKET_TOKEN` defaults to undefined; Unix socket `/tmp/apollo.sock` world-accessible if no token |

### Low Severity

| Issue | Location |
|-------|----------|
| `JSON.parse` on untrusted input | `src/plugins/interlink/commands/interlink.ts:274,313` — payload from user input; wrapped in try/catch but no schema validation |
| `eval` RPC command type | `src/types/rpc.ts:120` — naming suggests code execution capability |
| Hardcoded phishing domains | `src/utils/automod.ts:599-614` — static list; no auto-update mechanism |

---

## 7. Performance Risks

### High Severity

| Issue | Location | Impact |
|-------|----------|--------|
| **Unbounded in-memory caches** | `src/utils/automod.ts:15-22` (`spamTracker`), `src/utils/automod.ts:31` (`burstTracker`) | No TTL-based eviction for `burstTracker`; `cleanupBurstTracker` only runs every 60s and doesn't iterate all entries |
| **N+1 queries in automod scan** | `src/plugins/automod/commands/automod.ts:699-762` | Fetches messages in batches of 100, then calls `checkMessageAttachments` per message (which may hit DB/Redis) |

### Medium Severity

| Issue | Location | Impact |
|-------|----------|--------|
| **No DB connection pooling config for SQLite** | `src/utils/db.ts:51-55` | WAL mode + pragmas help but no write concurrency control |
| **Queue serializer uses msgpackr** | `src/queue/queue.ts:68-72` | Custom serializer adds overhead; BullMQ default is JSON |
| **EventBus cross-pod sync publishes every event** | `src/core/EventBus.ts:174-181` | Every local event emit also publishes to Redis; no batching |

### Low Severity

| Issue | Location |
|-------|----------|
| `src/utils/lruCache.ts` | Custom two-level LRU; consider `mnemonist` or `lru-cache` |
| `src/utils/analyticsCollector.ts` | Periodic flush every 30s; batch size unbounded |
| `src/index.ts:106-126` | `serializeEventArgs` creates new objects for every event |

---

## 8. Operational Debt

### High Severity

| Issue | Location | Impact |
|-------|----------|--------|
| **No structured migration runner CLI** | `src/db/migrations/` | Only 2 migrations exist; no `pnpm migrate` script visible in package.json (exists but undocumented) |
| **Health auth optional** | `src/utils/healthServer.ts:18, 26-27` | Production deployments may expose metrics/health without auth |

### Medium Severity

| Issue | Location | Impact |
|-------|----------|--------|
| **No distributed tracing integration** | `src/utils/tracing.ts` exists but unused | `AsyncLocalStorage` context created but no OpenTelemetry exporter; trace IDs generated but not propagated to logs/metrics |
| **Logging inconsistent** | `src/plugins/admin/events/*.ts` use `console.log/error` | 10+ files use raw `console` instead of structured logger |
| **No structured logging correlation** | `src/utils/logger.ts` | Trace ID generated at startup but not attached to Discord events or queue jobs |
| **Graceful shutdown timeout hardcoded** | `src/index.ts:367` — `SHUTDOWN_TIMEOUT_MS = 30000` | Not configurable via env; may be too short for large guilds |
| **Worker crash detection** | `src/core/worker/workerHost.ts:153-176` | 5 crashes in 10 min window disables plugin; no alerting/notification |

### Low Severity

| Issue | Location |
|-------|----------|
| `src/utils/startupChecks.ts` | Validates `DISCORD_TOKEN` and operator agreement but not `ENCRYPTION_KEY` for PostgreSQL |
| `src/db/migrations/*.cjs` | No migration version tracking in DB (has `migration_meta` table but unused) |
| `src/utils/healthServer.ts:227-235` | Latency recording interval not cleaned up on error path |
| No `pnpm doctor` / `pnpm audit` in CI | CI only runs lint + test |

---

## Recommendations (Priority Order)

### P0 — Fix Immediately
1. **Fix i18next v26 compatibility** — Update `getFixedT` usage or pin i18next to v25 until migration complete
2. **Make ENCRYPTION_KEY required at startup** — Add validation in `startupChecks.ts`
3. **Require HEALTH_AUTH_TOKEN in production** — Fail startup if `NODE_ENV=production` and no auth token
4. **Fix failing tests** — 494 failures block CI confidence

### P1 — Next Sprint
5. **Split `PluginManager`** — Extract `PluginLoader`, `PluginEnabler`, `WorkerManager`, `CommandSyncer`
6. **Split `EventBus`** — Separate `EventEmitter`, `RpcRegistry`, `StateStore`
7. **Add migration CLI and tests** — Document `pnpm migrate`, add up/down tests
8. **Enable OpenTelemetry** — Wire `tracing.ts` to OTLP exporter; propagate trace IDs to logs/queue

### P2 — Technical Debt Reduction
9. **Extract automod command** — Split 798-line file into subcommand modules
10. **Unify DB adapter** — Remove runtime SQLite/Knex branching; use Knex for both
11. **Add integration tests** — Worker sandbox, plugin lifecycle, cross-pod EventBus, queue processing
12. **Replace custom LRU** — Use `lru-cache` or `mnemonist`
13. **Add schema validation** — Zod schemas for all RPC messages, interlink payloads, plugin manifests

### P3 — Polish
14. **Migrate migrations to ESM** — Rename `.cjs` → `.js` with `export async function up()`
15. **Remove console.log** — Replace with structured logger in admin event handlers
16. **Configurable shutdown timeout** — Add `SHUTDOWN_TIMEOUT_MS` env var
17. **Automated dependency updates** — Add Renovate/Dependabot config

---

## Appendix: File Size Leaders (>400 lines)

| File | Lines | Category |
|------|-------|----------|
| `src/plugins/automod/commands/automod.ts` | 798 | Command (God) |
| `src/utils/automod.ts` | 700 | Utility |
| `src/utils/analyticsCollector.ts` | 665 | Utility |
| `src/plugins/utility/commands/analytics.ts` | 665 | Command |
| `src/types/shared.ts` | 679 | Types |
| `src/core/PluginManager.ts` | 535 | Core |
| `src/plugins/moderation/commands/case.ts` | 568 | Command |
| `src/plugins/moderation/commands/blacklist.ts` | 536 | Command |
| `src/plugins/utility/commands/tag.ts` | 534 | Command |
| `src/utils/raidDetection.ts` | 580 | Utility |
| `src/queue/remoteInteraction.ts` | 584 | Queue |
| `src/utils/transcriptGenerator.ts` | 448 | Utility |
| `src/utils/lruCache.ts` | 459 | Utility |
| `src/utils/commandValidator.ts` | 415 | Utility |
| `src/core/EventBus.ts` | 420 | Core |
| `src/index.ts` | 472 | Entry |
| `src/plugins/admin/commands/reactionrole.ts` | 389 | Command |
| `src/queue/nsfwClient.ts` | 380 | Queue |
| `src/utils/circuitBreaker.ts` | 391 | Utility |
| `src/utils/exportAnalytics.ts` | 399 | Utility |
| `src/utils/dataStore.ts` | 400 | Utility |

---

*Report generated via automated codebase scan. Manual review recommended for architectural decisions.*