# Apollo Discord Bot — Security Hardening & Architectural Improvements

## Goal
Systematically implement the prioritized improvement plan from the architectural review:
- P0: Critical security vulnerabilities (8 items)
- P1: Architectural debt hotspots (6 items)
- P2: Scalability bottlenecks (5 items)
- P3: Maintainability/technical debt (6 items)
- P4: Developer experience/tooling (4 items)

## Worktree
- Path: `.slim/worktrees/apollo-hardening`
- Branch: `omos/apollo-hardening`
- Base: `main` (622ce4c)

## Phase Plan

### Phase 1: Quick Wins (Week 1) — P0 Security + Config
**Gate: Oracle review after completion**
- P0-8: Zod config validation (`src/config/config.js`)
- P0-1: Interlink rate limiter fail-closed (`src/plugins/interlink/rateLimit.js`)
- P0-3: CORS on interlink server (`src/plugins/interlink/server.js`)
- P2-5: BullMQ retry/backoff/DLQ (`src/queue/queue.js`)
- P3-6: Custom error classes (`src/errors/`)
- P0-7: Global Discord REST rate limiter (`src/utils/discordRateLimit.js`)

### Phase 2: Foundation (Week 2-3) — Core Infrastructure
**Gate: Oracle review after completion**
- P1-1: Config schema split (Zod + TypeScript types)
- P0-2: Webhook HMAC verification (`src/plugins/interlink/messageBus.js`, `routes.js`)
- P0-4: Encrypted worker IPC (`src/core/worker/workerHost.js`, `workerChild.js`, `rpc.js`)
- P0-5: Audit log persistence (`src/utils/securityLog.js`, DB adapter)
- P1-5: DB adapter singleton → class with DI (`src/db/adapter.js`)
- P2-3: Centralized Redis pool (`src/utils/redis.js`)

### Phase 3: Core Architecture (Week 4-6) — EventBus Decomposition
**Gate: Oracle review after completion**
- P1-2: Split EventBus into EventEmitter, ApiRegistry, StateStore, CrossPodSync
- P0-6: Interlink key rotation (depends on P0-5, P2-4)
- P2-1: ShardedEventBus (depends on P1-2)

### Phase 4: DI + Context (Week 6-8)
**Gate: Oracle review after completion**
- P3-1: Lightweight DI container + BotContext interface
- P1-6: Migrate plugins to BotContext (incremental)
- P3-2: InteractionContext interface + Discord adapter

### Phase 5: Scalability (Week 8-10)
**Gate: Oracle review after completion**
- P2-2: Scheduler DB indexes + per-guild locking
- P2-4: Command registry with dirty tracking + incremental sync
- P1-3: BaseScheduler consolidation
- P1-4: WorkerTransport abstraction

### Phase 6: Ecosystem & DX (Week 10+)
**Gate: Oracle review after completion**
- P3-5: @apollo/plugin-api package
- P4-3: Plugin SDK + CLI template
- P4-1: Structured logging (Pino)
- P4-2: E2E tests with Testcontainers
- P3-4: Codemap validation in CI

## Phase 4: DI + Context (Week 6-8)
**Gate: Oracle review after completion**
- P3-1: Lightweight DI container + BotContext interface ✅
- P1-6: Migrate plugins to BotContext (incremental) ✅ (Plugin base class updated)
- P3-2: InteractionContext interface + Discord adapter - **IN PROGRESS**

## Phase 3: Core Architecture (Week 4-6) — EventBus Decomposition
**Gate: Oracle review after completion**
- P1-2: Split EventBus into EventEmitter, ApiRegistry, StateStore, CrossPodSync ✅
- P0-6: Interlink key rotation (depends on P0-5, P2-4) - **IN PROGRESS**
- P2-1: ShardedEventBus (depends on P1-2) - **IN PROGRESS**

## Phase 2: Foundation (Week 2-3) — Core Infrastructure
**Gate: Oracle review after completion**
- P1-1: Config schema split (Zod + TypeScript types) ✅ (done in Phase 1)
- P0-2: Webhook HMAC verification (`src/plugins/interlink/messageBus.js`, `routes.js`, `auth.js`) ✅
- P0-4: Encrypted worker IPC (`src/core/worker/workerHost.js`, `workerChild.js`, `ipcEncryption.js`) ✅
- P0-5: Audit log persistence (`src/utils/securityLog.js`, DB adapter) ✅
- P1-5: DB adapter singleton → class with DI (`src/db/adapter.js`) ✅
- P2-3: Centralized Redis pool (`src/utils/redis.js`) ✅

## Phase 1: Quick Wins — COMPLETED ✅
- P0-8: Zod config validation (`src/config/config.js`, `src/config/schema.js`) ✅
- P0-1: Interlink rate limiter fail-closed (`src/plugins/interlink/rateLimit.js`) ✅
- P0-3: CORS on interlink server (`src/plugins/interlink/server.js`) ✅
- P2-5: BullMQ retry/backoff/DLQ (`src/queue/queue.js`) ✅
- P3-6: Custom error classes (`src/errors/index.js`) ✅
- P0-7: Global Discord REST rate limiter (`src/utils/discordRateLimit.js`, integrated in `src/index.js` and `src/queue/jobs/processCommand.js`) ✅

**Oracle Review P0 Fixes Applied:**
- ✅ Validate `WORKER_IPC_SECRET` and `ENCRYPTION_KEY` at startup (fail fast if missing)
- ✅ Fix CrossPodSync state conflict resolution (version check on remote updates)
- ✅ Fix rate limiter circuit breaker (fail closed when circuit open)
- ✅ Consolidate Redis connections (lock.js uses centralized pool)
- ✅ Fix DiscordRateLimiter race condition (mutex for refill, clear waiting queue on stop)

**Oracle Review Phase 4 P0/P1 Fixes Applied:**
- ✅ Fix factory caching bug (Container.js - factories now called every time, lazy singletons separate)
- ✅ Add `CLIENT` to `BOT_CONTEXT_TOKENS` and register in container
- ✅ Provide mock Redis in test mode (ioredis-mock instead of null)
- ✅ Add circular dependency detection in `Container.resolve()`
- ✅ Unify `SERVICE_TOKENS` and `BOT_CONTEXT_TOKENS` (single source of truth)

**Validation**: `pnpm lint` ✅, `pnpm test` (1434 tests passed) ✅

## Validation Strategy
- Each phase: `pnpm lint`, `pnpm test`, manual verification of changed behavior
- Phase gates: Oracle review with changed file references
- Final: Full test suite + integration smoke test

## Notes
- Work in `.slim/worktrees/apollo-hardening` (this worktree)
- Commit at phase boundaries
- Update this file after each major decision/completion