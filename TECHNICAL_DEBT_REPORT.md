# Technical Debt Scan Report — Apollo Discord Bot

**Generated:** 2026-11-06
**Scope:** `src/` directory and `package.json`
**Total source files:** 295 TypeScript files, ~51,280 lines of code

---

## Executive Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| **Dependencies** | 0 | 2 | 16 | 0 | 18 |
| **Legacy Patterns** | 0 | 0 | 7 | 0 | 7 |
| **Code Quality** | 1 | 2 | 4 | 0 | 7 |
| **Test Gaps** | 0 | 1 | 5 | 0 | 6 |
| **Architecture** | 0 | 2 | 2 | 1 | 5 |
| **Security** | 0 | 3 | 2 | 5 | 10 |
| **Performance** | 0 | 0 | 2 | 2 | 4 |
| **Operational** | 0 | 0 | 2 | 0 | 2 |
| **TOTAL** | **1** | **10** | **40** | **8** | **59** |

---

## 1. Outdated Dependencies

### High Severity

| Package | Current | Wanted | Latest | Risk |
|---------|---------|--------|--------|------|
| `chokidar` | 5.0.0 | 5.0.0 | 6.0.0 | Production dependency |
| `pino-http` | 10.5.0 | 10.5.0 | 11.0.0 | Production dependency |

### Medium Severity

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `@hono/node-server` | 2.1.5 | 2.1.6 | Production dependency |
| `discord.js` | 14.28.0 | 14.28.1 | Production dependency |
| `hono` | 4.13.14 | 4.13.16 | Production dependency |
| `i18next-fs-backend` | 2.6.9 | 2.6.10 | Production dependency |
| `jose` | 6.2.14 | 6.2.15 | Production dependency |
| `msgpackr` | 2.1.3 | 2.1.4 | Production dependency |
| `@bull-board/api` | 9.10.5 | 9.11.0 | Production dependency |
| `@bull-board/hono` | 9.10.5 | 9.11.0 | Production dependency |
| `@vitest/coverage-v8` | 5.0.5 | 5.1.0 | Development dependency |
| `@vitest/ui` | 5.0.5 | 5.1.0 | Development dependency |
| `bullmq` | 6.5.3 | 6.7.0 | Production dependency |
| `fast-xml-parser` | 5.11.2 | 5.12.0 | Production dependency |
| `i18next` | 26.5.12 | 26.7.1 | Production dependency |
| `i18next-cli` | 1.80.7 | 1.82.5 | Development dependency |
| `oxlint` | 1.90.0 | 1.91.0 | Development dependency |
| `vitest` | 5.0.5 | 5.1.0 | Development dependency |

**Note:** No known vulnerabilities per `pnpm audit` (as of scan date).

---

## 2. Legacy Patterns & ESM/CommonJS Mismatches

### Medium Severity

| File | Issue | Impact |
|------|-------|--------|
| `src/core/BuiltinPluginLoader.ts` | Sync JSON.parse(readFileSync()) in async context | Found 1 occurrence(s); blocks event loop; should use async fs |
| `src/core/BuiltinPluginLoader.ts` | Dynamic import with cache-busting query parameter | Defeats module caching; potential for loading inconsistent versions |
| `src/core/PluginInstaller.ts` | Sync JSON.parse(readFileSync()) in async context | Found 3 occurrence(s); blocks event loop; should use async fs |
| `src/core/pluginDownloader.ts` | Sync JSON.parse(readFileSync()) in async context | Found 2 occurrence(s); blocks event loop; should use async fs |
| `src/i18n/I18nService.ts` | Sync JSON.parse(readFileSync()) in async context | Found 1 occurrence(s); blocks event loop; should use async fs |
| `src/i18n/commandPayload.ts` | Sync JSON.parse(readFileSync()) in async context | Found 1 occurrence(s); blocks event loop; should use async fs |
| `src/utils/healthServer.ts` | Raw SQL in health check | await knex.raw('SELECT 1') — bypasses query builder; inconsistent with adapter pattern |
| `src/utils/manifest.ts` | Sync JSON.parse(readFileSync()) in async context | Found 1 occurrence(s); blocks event loop; should use async fs |

### Low Severity

| File | Issue | Impact |
|------|-------|--------|
| `src/types/rpc-schemas.ts` | 'eval' as RPC command type — confusing naming suggests code execution | Found 'eval' in RPC context |
| `src/types/rpc.ts` | 'eval' as RPC command type — confusing naming suggests code execution | Found 'eval' in RPC context |

---

## 3. Code Quality Issues

### Critical Severity

| File | Lines | Issue |
|------|-------|-------|
| `src/utils/metrics.ts` | 940 | God file — violates SRP, extremely large |

### High Severity

| File | Lines | Issue |
|------|-------|-------|
| `src/types/shared.ts` | 681 | Very large file — multiple responsibilities |
| `src/utils/integrationPoller.ts` | 641 | Very large file — multiple responsibilities |

### Medium Severity

| File | Lines | Issue |
|------|-------|-------|
| `src/index.ts` | 501 | Large file — consider splitting |
| `src/plugins/moderation/commands/blacklist.ts` | 537 | Large file — consider splitting |
| `src/plugins/moderation/commands/case.ts` | 569 | Large file — consider splitting |
| `src/plugins/utility/commands/tag.ts` | 535 | Large file — consider splitting |

---

## 4. Test Gaps

### High Severity — **494/1682 tests failing (29%)**

| Area | Failures | Root Cause |
|------|----------|------------|
| Test Suite | i18next v26 API incompatibility: `fixedT` usage pattern broken | i18next v26 changed internal APIs causing `fixedT()` to crash in multiple test files |

### Medium Severity

| Path | Coverage | Risk |
|------|----------|------|
| src/core/worker/workerHost.ts | Missing test coverage for critical path: Worker sandbox | No integration/unit tests found |
| src/core/worker/workerChild.ts | Missing test coverage for critical path: Worker child process | No integration/unit tests found |
| src/db/migrations/ | Missing test coverage for critical path: Database migrations | No integration/unit tests found |
| src/core/EventBus.ts | Missing test coverage for critical path: Cross-pod EventBus | No integration/unit tests found |
| src/queue/jobs/processCommand.ts | Missing test coverage for critical path: Queue job processing | No integration/unit tests found |

---

## 5. Architecture Smells

### High Severity

| Issue | Location | Impact |
|-------|----------|--------|
| EventBus Triple Responsibility — event emission, RPC-style APIs (provide/call), and distributed state (provideState/watchState) in one class | `src/core/EventBus.ts` | Three distinct responsibilities combined |
| Plugin Manager God Class — handles discovery, loading, dependency resolution, worker spawning, capability indexing, socket handlers, command sync | `src/core/PluginManager.ts` | 470 lines; violates SRP |

### Medium Severity

| Issue | Location | Impact |
|-------|----------|--------|
| Hardcoded capability list must be manually kept in sync | `src/core/PluginManager.ts` | ALL_PLUGIN_CAPABILITIES array not auto-generated from plugin manifests |
| Client augmentation — client.commands, client.config, client.stats, client.manager, client.bus, client.socketServer added dynamically | `src/index.ts` | No TypeScript safety for augmented properties |

### Low Severity

| Issue | Location | Impact |
|-------|----------|--------|
| Massive type dump — should be split by domain | `src/types/shared.ts` | 681 lines of mixed type definitions |

---

## 6. Security Concerns

### High Severity

| Issue | Location | Risk |
|-------|----------|------|
| ENCRYPTION_KEY optional — empty string allowed at config level | `src/config/config.ts` | src/utils/encryption.ts throws only at encrypt time, not startup |
| SQLite DB file created with default permissions — no mode specified | `src/utils/db.ts` | File permissions not explicitly set; could be world-readable |
| Health endpoint unauthenticated by default | `src/utils/healthServer.ts` | Exposes /health, /ready, /metrics publicly unless explicitly configured |

### Medium Severity

| Issue | Location | Risk |
|-------|----------|------|
| Unix socket token optional — world-accessible if no token set | `src/cli/socket-server.ts` | APOLLO_SOCKET_TOKEN defaults to undefined; /tmp/apollo.sock exposed |

### Low Severity

| Issue | Location | Risk |
|-------|----------|------|
| JSON.parse on untrusted input without schema validation | `src/plugins/interlink/commands/interlink.ts` | Payload from user input; wrapped in try/catch but no Zod schema validation |
| JSON.parse on untrusted input without schema validation | `src/plugins/interlink/connectClient.ts` | Payload from user input; wrapped in try/catch but no Zod schema validation |
| JSON.parse on untrusted input without schema validation | `src/plugins/interlink/plugin.ts` | Payload from user input; wrapped in try/catch but no Zod schema validation |

---

## 7. Performance Risks

### Medium Severity

| Issue | Location | Impact |
|-------|----------|--------|
| EventBus cross-pod sync publishes every event to Redis — no batching | `src/core/EventBus.ts` | Every local event emit also publishes to Redis; potential overhead |
| Queue serializer uses msgpackr instead of BullMQ default JSON | `src/queue/queue.ts` | Custom serializer adds overhead; BullMQ default is JSON |

### Low Severity

| Issue | Location | Impact |
|-------|----------|--------|
| serializeEventArgs creates new objects for every event | `src/index.ts` | Object allocation on every Discord event; GC pressure |
| Analytics collector periodic flush — batch size unbounded | `src/utils/analyticsCollector.ts` | Flushes every 30s but no max batch size limit |

---

## 8. Operational Debt

### Medium Severity

| Issue | Location | Impact |
|-------|----------|--------|
| Worker crash detection disables plugin but no alerting/notification | `src/core/worker/workerHost.ts` | 5 crashes in 10 min window disables plugin; no operator notification |
| Raw console.log/error/warn usage instead of structured logger | `7 files` | Found in: src/plugins/admin/events/guildBanAdd.ts (1 occurrences), src/plugins/admin/events/guildBanRemove.ts (1 occurrences), src/plugins/admin/events/messageDeleteBulk.ts (1 occurrences), src/plugins/moderation/events/guildMemberAdd.ts (8 occurrences), src/plugins/moderation/events/guildMemberRemove.ts (1 occurrences)...; should use pino logger from src/utils/logger.ts |

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
| `src/utils/metrics.ts` | 940 | Utility |
| `src/types/shared.ts` | 681 | Types |
| `src/utils/integrationPoller.ts` | 641 | Utility |
| `src/plugins/moderation/commands/case.ts` | 569 | Command |
| `src/plugins/moderation/commands/blacklist.ts` | 537 | Command |
| `src/plugins/utility/commands/tag.ts` | 535 | Command |
| `src/index.ts` | 501 | Other |
| `src/core/pluginDownloader.ts` | 472 | Core |
| `src/core/PluginManager.ts` | 470 | Core |
| `src/types/cli.ts` | 460 | Types |
| `src/utils/lruCache.ts` | 460 | Utility |
| `src/plugins/interlink/plugin.ts` | 452 | Other |
| `src/utils/transcriptGenerator.ts` | 449 | Utility |
| `src/utils/encryption.ts` | 432 | Utility |
| `src/plugins/interlink/commands/interlink.ts` | 417 | Command |
| `src/utils/commandValidator.ts` | 416 | Utility |

---

*Report generated via automated codebase scan. Manual review recommended for architectural decisions.*
