# Apollo Discord Bot — Standards Remediation Plan

**Generated:** 2026-08-20  
**Source:** Oracle audit of 33 findings (6 P0, 11 P1, 16 P2)  
**Approach:** Phased, dependency-ordered, specialist-assigned with verification gates

---

## Phase Overview

| Phase | Focus | Findings | Est. Effort | Dependencies |
|-------|-------|----------|-------------|--------------|
| **0** | Pre-Work (Setup & Tooling) | 2 P1 | 1 day | None |
| **1** | Critical Reliability (P0 Queue + Security) | 6 P0 | 2-3 days | Phase 0 |
| **2** | Observability & Error Handling (P0/P1) | 2 P0 + 4 P1 | 3-4 days | Phase 1 |
| **3** | Scalability & Test Quality (P0/P1/P2) | 1 P0 + 3 P1 + 4 P2 | 4-5 days | Phase 1-2 |
| **4** | Polish & Operations (P1/P2) | 4 P1 + 12 P2 | 3-4 days | Phase 1-3 |
| **5** | Final Compliance Verification | — | 0.5 days | Phase 4 |

**Total: ~13-17 days** (can parallelize within phases)

---

## Phase 0: Pre-Work (Setup & Tooling)

### 0.1 Move & Improve deploy-commands.js (P1)
- **Owner:** @fixer
- **Files:** Move `deploy-commands.js` → `scripts/deploy-commands.js`, update `package.json` scripts
- **Change:**
  - Move to `scripts/` directory (conventional location for build/deploy scripts)
  - Add CLI argument parsing: `--guild <id>` (override GUILD_ID), `--global` (force global), `--dry-run` (print commands without deploying), `--clear` (delete all commands)
  - Add command validation: warn on missing `description`, duplicate names, invalid option types
  - Add progress indicator for large command sets
  - Add `--json` output mode for CI/CD integration
  - Use structured logger (from Phase 2.1) instead of console.log
  - Exit codes: 0=success, 1=config error, 2=validation error, 3=deployment error
- **Verification:**
  - `pnpm deploy:commands --dry-run` → lists commands without deploying
  - `pnpm deploy:commands --guild 123` → deploys to specific guild
  - `pnpm deploy:commands --global` → deploys globally
  - `pnpm deploy:commands --clear --guild 123` → deletes all guild commands
  - `pnpm deploy:commands --json` → outputs JSON array of deployed commands
  - Invalid command files → validation warnings, non-zero exit
  - `package.json` has `"deploy:commands": "node scripts/deploy-commands.js"`
- **Effort:** 3 hours

### 0.2 Investigate Automod False Positive Warning Bug (P1)
- **Owner:** @oracle (investigate) → @fixer (fix)
- **Files:** `src/utils/automod.js`, `src/plugins/automod/events/messageCreate.js`, `src/plugins/automod/commands/automod.js`, `tests/plugins/automod/`
- **Issue:** Automod incorrectly warns on messages that don't violate any configured rules (banned words, links, invites, caps, mentions, spam, NSFW). No config/rules broken — false positive.
- **Investigation Scope:**
  - Review `checkMessage()` logic in `automod.js` for condition evaluation order/short-circuit bugs
  - Check `messageCreate.js` event handler for double-processing or state leakage
  - Verify exemption logic (roles, channels, users) correctly applied before rule checks
  - Check spam tracking (Redis/in-memory) for cross-guild contamination or TTL issues
  - Review banned word matching (leetspeak normalization, regex boundaries) for over-matching
  - Check if `checkMessageAttachments` / NSFW detection triggers incorrectly
  - Look for race conditions in Redis-backed spam tracking
  - Verify config loading: guild config correctly merged with defaults
- **Verification:**
  - Reproduce with minimal test case (unit test added to `tests/utils/automod.test.js`)
  - Identify root cause: specific condition/logic error
  - Fix applied, regression test passes
  - Manual test: send benign message → no warning; send violating message → warning
- **Effort:** 4 hours investigation + 2 hours fix = 6 hours

---

### 1.1 Add Job Deduplication (P0)
- **Owner:** @fixer
- **Files:** `src/queue/jobs/processCommand.js:37-40`, `src/queue/queue.js:37-40`
- **Change:** Add `jobId: interaction.id` and `deduplication: { id: interaction.id, ttl: 300000 }` to `queue.add()`
- **Verification:** 
  - Unit test: Submit same interaction twice → only one job processed
  - Integration test: Rapid double-click slash command → single execution
- **Effort:** 2 hours

### 1.2 Add Retry Policy (P0)
- **Owner:** @fixer
- **Files:** `src/queue/queue.js:23-26`
- **Change:** Add `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnFail: { age: 86400, count: 1000 } }`
- **Verification:**
  - Unit test: Job that fails twice then succeeds → completes on 3rd attempt
  - Metrics: `queue_job_retries_total` increments
- **Effort:** 2 hours

### 1.3 Validate ENCRYPTION_KEY at Startup (P0)
- **Owner:** @fixer
- **Files:** `src/utils/startupChecks.js:6-13` (add), `src/config/config.js:11` (read)
- **Change:** Add check for `ENCRYPTION_KEY` existence, valid base64, 32-byte decoded length. Exit with clear error if missing/invalid.
- **Verification:**
  - Start without ENCRYPTION_KEY → clean exit with message
  - Start with invalid key → clean exit with message
  - Start with valid key → proceeds normally
- **Effort:** 1 hour

### 1.4 Fix Unhandled Rejection Handler (P0)
- **Owner:** @fixer
- **Files:** `src/index.js:344-346`
- **Change:** In production (`NODE_ENV=production`), call `process.exit(1)` after logging. In dev, log only.
- **Verification:**
  - Trigger unhandled rejection in prod mode → process exits with code 1
  - Trigger in dev mode → logs but continues
- **Effort:** 1 hour

### 1.5 Add Discord REST Error Code Handling (P0)
- **Owner:** @fixer
- **Files:** `src/plugins/moderation/commands/ban.js:190-209` (pattern), all command `execute` functions
- **Change:** Create `src/utils/discordErrors.js` with `handleDiscordError(error, interaction)` that checks `error.code` for:
  - `50013` Missing Permissions → user-friendly "I lack permission"
  - `50001` Missing Access → "I can't access that channel"
  - `10062` Unknown Interaction → silent (already handled)
  - `50035` Invalid Form Body → validation error details
  - Wrap all `interaction.reply/editReply/followUp` calls
- **Verification:**
  - Unit test: Mock DiscordAPIError with each code → correct user message
  - Integration test: Bot without permissions → graceful error message
- **Effort:** 4 hours (touch many command files)

### 1.6 Add ShardingManager Support (P0)
- **Owner:** @oracle (architect) → @fixer (implement)
- **Files:** New `src/shard.js`, modify `src/index.js`, `src/gateway/leader.js`, `src/core/EventBus.js`
- **Change:** 
  - New entry point `src/shard.js` using `ShardingManager`
  - `src/index.js` becomes shard worker (accepts `SHARD_ID` env)
  - `EventBus.enableCrossPod` works across shards
  - Leader election per-shard or global
  - Config: `SHARD_COUNT` (auto or manual)
- **Verification:**
  - Start with `SHARD_COUNT=2` → two shards connect
  - Cross-shard event (guildCreate) → received on all shards
  - Command on shard 1 for guild on shard 2 → routed correctly
- **Effort:** 16 hours (architectural)

### 1.7 Oracle Review: Phase 1 Implementation
- **Owner:** @oracle
- **Scope:** Verify tasks 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
- **Review Criteria:**
  - Job deduplication: `jobId` and `deduplication` options correctly applied in `processCommand.js`
  - Retry policy: `defaultJobOptions` with `attempts: 3`, exponential backoff, `removeOnFail`
  - ENCRYPTION_KEY validation: startup check exits cleanly with clear message for missing/invalid key
  - Unhandled rejection: exits in production, logs only in dev
  - Discord error handling: `handleDiscordError` utility created and used in all command `execute` functions; correct messages for 50013, 50001, 10062, 50035
  - Sharding: `ShardingManager` entry point works; cross-shard EventBus functional; feature-flagged
  - All tests pass (`pnpm test`), lint clean (`pnpm lint`)
- **Deliverable:** Written review with PASS/FAIL per task, any follow-up items
- **Effort:** 2 hours

---

## Phase 2: Observability & Error Handling

### 2.1 Implement Structured JSON Logging (P0)
- **Owner:** @fixer
- **Files:** New `src/utils/logger.js` (replace), `src/index.js`, `src/worker.js`, all plugins
- **Change:** 
  - Add Pino dependency
  - Create `createLogger(context)` factory with levels: `debug`, `info`, `warn`, `error`, `fatal`
  - Default fields: `timestamp`, `level`, `service: 'apollo'`, `pid`, `hostname`, `traceId`
  - Child loggers for: `command`, `event`, `queue`, `db`, `plugin:<name>`
  - Replace all `console.log/error` calls
- **Verification:**
  - Start bot → JSON lines on stdout
  - Run command → log contains `commandName`, `guildId`, `userId`, `durationMs`
  - Error → log contains `error.message`, `error.stack`, `traceId`
  - `pnpm test` → no console output pollution
- **Effort:** 8 hours

### 2.2 Add Gateway Latency Histogram (P2)
- **Owner:** @fixer
- **Files:** `src/utils/metrics.js:29-34` (add), `src/utils/healthServer.js:80-82` (use)
- **Change:** Add `gatewayLatencyMs` histogram, record on heartbeat interval
- **Verification:** `/metrics` endpoint shows `apollo_gateway_latency_ms_bucket`
- **Effort:** 1 hour

### 2.3 Fix EventBus Error Emission (P1)
- **Owner:** @fixer
- **Files:** `src/core/EventBus.js:62-64`
- **Change:** In `emit()`, catch handler errors → `this.emit('error', error, eventName, args)`
- **Verification:** Unit test: Handler throws → 'error' event emitted with error + context
- **Effort:** 1 hour

### 2.4 Add vi.restoreAllMocks() (P1)
- **Owner:** @fixer
- **Files:** `tests/setup.js:9-10` (add `afterEach`)
- **Change:** Add `afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); })`
- **Verification:** Run test suite twice → no mock leakage (same results)
- **Effort:** 30 minutes

### 2.5 Configure Worker Concurrency & LockDuration (P1)
- **Owner:** @fixer
- **Files:** `src/worker.js:31-34`
- **Change:** `new Worker(queueName, processor, { concurrency: 4, lockDuration: 60000, limiter: { max: 50, duration: 1000 } })`
- **Verification:** 
  - Load test: 20 concurrent commands → processes 4 at a time
  - Long command (45s) → not marked stalled
  - Rate limit respected (Discord 50/sec)
- **Effort:** 1 hour

### 2.6 Add SQLite acquireConnectionTimeout (P1)
- **Owner:** @fixer
- **Files:** `src/db/knex.js:50`
- **Change:** Add `acquireConnectionTimeout: 10000` to SQLite pool config
- **Verification:** Lock DB file → connection attempt times out after 10s with clear error
- **Effort:** 30 minutes

### 2.7 Oracle Review: Phase 2 Implementation
- **Owner:** @oracle
- **Scope:** Verify tasks 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
- **Review Criteria:**
  - Structured logging: Pino logger with JSON output, levels, traceId, child loggers; all `console.log/error` replaced
  - Gateway latency histogram: `apollo_gateway_latency_ms_bucket` in `/metrics`
  - EventBus error emission: `emit('error', ...)` on handler failures
  - Test isolation: `vi.restoreAllMocks()` in `afterEach`; no mock leakage
  - Worker config: `concurrency: 4`, `lockDuration: 60000`, `limiter: { max: 50, duration: 1000 }`
  - SQLite timeout: `acquireConnectionTimeout: 10000` in pool config
  - All tests pass (`pnpm test`), lint clean (`pnpm lint`)
- **Deliverable:** Written review with PASS/FAIL per task, any follow-up items
- **Effort:** 2 hours

---

## Phase 3: Scalability & Test Quality

### 3.1 Fix MessageFlags.Ephemeral Consistency (P2)
- **Owner:** @fixer
- **Files:** `src/index.js:145,173,220,248`, `src/plugins/admin/commands/system.js:70`, any others
- **Change:** Replace all `flags: 64` with `flags: MessageFlags.Ephemeral` (import from discord.js)
- **Verification:** Grep for `flags: 64` → zero results; `pnpm lint` passes
- **Effort:** 1 hour

### 3.2 Fix EventBus forEach Async (P2)
- **Owner:** @fixer
- **Files:** `src/core/EventBus.js:157-175`
- **Change:** Replace `forEach` with `for...of` loop awaiting each unsubscribe
- **Verification:** Unit test: Multiple async unsubscribes → all complete before return
- **Effort:** 30 minutes

### 3.3 Add Shutdown Timeout Guard (P1)
- **Owner:** @fixer
- **Files:** `src/index.js:339-341`, `src/worker.js:64-73`
- **Change:** Wrap cleanup in `Promise.race([cleanup(), new Promise((_, r) => setTimeout(() => r(new Error('shutdown timeout')), 30000))])`
- **Verification:** Mock slow cleanup (40s) → process exits at 30s with error log
- **Effort:** 1 hour

### 3.4 Add CSP Headers & Request Limits (P2)
- **Owner:** @fixer
- **Files:** `src/plugins/interlink/server.js:29-40`
- **Change:** 
  - Add `helmet` middleware for CSP
  - Add `express.json({ limit: '100kb' })` globally (not just /api/v1)
  - Add rate limit to `/health`, `/metrics` (lenient)
- **Verification:** 
  - `curl -H "Content-Length: 200000" POST /health` → 413
  - CSP headers present on all responses
- **Effort:** 2 hours

### 3.5 Add Contract Tests for Plugin APIs (P2)
- **Owner:** @fixer
- **Files:** New `tests/contracts/plugin-api.test.js`
- **Change:** Test Plugin base class contract: `onLoad`, `onEnable`, `onDisable`, `onUnload` called in order; commands/events registered; socket handlers registered
- **Verification:** New test file passes; covers PluginManager integration
- **Effort:** 4 hours

### 3.6 Improve Error Path Test Coverage (P2)
- **Owner:** @fixer
- **Files:** `tests/commands/*.test.js` (add cases)
- **Change:** For each command test file, add tests for:
  - Permission denied (50013)
  - Unknown interaction (10062)
  - Network error (ECONNREFUSED)
  - Validation errors
- **Verification:** Coverage report shows error branches covered
- **Effort:** 8 hours

### 3.7 Validate Postgres Pool Max (P2)
- **Owner:** @fixer
- **Files:** `src/config/config.js:210`, `src/db/knex.js`
- **Change:** Add startup check: if `DB_POOL_MAX > 0.8 * DB_MAX_CONNECTIONS` (from `SHOW max_connections`), warn and cap
- **Verification:** Set `DB_POOL_MAX=100` on small DB → startup warning, capped to safe value
- **Effort:** 2 hours

### 3.8 Oracle Review: Phase 3 Implementation
- **Owner:** @oracle
- **Scope:** Verify tasks 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
- **Review Criteria:**
  - MessageFlags.Ephemeral: zero `flags: 64` occurrences; all use `MessageFlags.Ephemeral` enum
  - EventBus forEach: replaced with `for...of` awaiting async unsubscribes
  - Shutdown timeout: `Promise.race` with 30s guard in both `src/index.js` and `src/worker.js`
  - CSP headers: `helmet` middleware; global `express.json({ limit: '100kb' })`; rate limits on `/health`, `/metrics`
  - Contract tests: `tests/contracts/plugin-api.test.js` covers Plugin lifecycle, command/event registration, socket handlers
  - Error path coverage: each command test file has tests for 50013, 10062, ECONNREFUSED, validation errors
  - Postgres pool validation: startup check warns and caps when `DB_POOL_MAX > 0.8 * max_connections`
  - All tests pass (`pnpm test`), lint clean (`pnpm lint`)
- **Deliverable:** Written review with PASS/FAIL per task, any follow-up items
- **Effort:** 2 hours

---

## Phase 4: Polish & Operations

### 4.1 Replace Global Redis Singleton (P2)
- **Owner:** @fixer
- **Files:** `src/utils/redis.js:42-44`, all consumers
- **Change:** Export `createRedisClient(name, options)` factory; remove `global._redisMap`; use dependency injection
- **Verification:** No `global._redisMap` references; tests pass with isolated Redis clients
- **Effort:** 3 hours

### 4.2 Add ALLOW_UNVERIFIED_PLUGINS Prod Warning (P2)
- **Owner:** @fixer
- **Files:** `src/core/PluginManager.js` (where env checked)
- **Change:** If `ALLOW_UNVERIFIED_PLUGINS=true` and `NODE_ENV=production` → structured log warning
- **Verification:** Start prod with env → warning in logs
- **Effort:** 30 minutes

### 4.3 Add Distributed Tracing Foundation (P2)
- **Owner:** @oracle (design) → @fixer (implement)
- **Files:** New `src/utils/tracing.js`, integrate in logger, queue, HTTP
- **Change:** 
  - Generate `traceId` per request/command/job
  - Propagate via `AsyncLocalStorage` (Node.js built-in)
  - Include in all log lines, metrics labels, HTTP headers
  - OpenTelemetry SDK optional (configurable)
- **Verification:** Single command → same `traceId` in gateway log, queue log, worker log, DB query log
- **Effort:** 8 hours

### 4.4 Add Log Sampling (P2)
- **Owner:** @fixer
- **Files:** `src/utils/logger.js` (from Phase 2.1)
- **Change:** Add `sampleRate` config (default 1.0); for high-volume events (messageCreate, heartbeat), sample at 0.1
- **Verification:** High-traffic bot → log volume reduced 10x for sampled events
- **Effort:** 2 hours

### 4.5 Document Rolling Deployment (P2)
- **Owner:** @oracle (review) → @fixer (write)
- **Files:** New `docs/deployment/rolling.md`
- **Change:** Document: health check grace period, drain connections, shard rolling restart, DB migration strategy
- **Verification:** Document exists and is accurate
- **Effort:** 2 hours

### 4.6 Document Backup/Restore Procedure (P2)
- **Owner:** @fixer
- **Files:** New `docs/operations/backup-restore.md`
- **Change:** Document: SQLite `.backup` command, Postgres `pg_dump`/`pg_restore`, Redis RDB/AOF, plugin manifest, encryption key rotation
- **Verification:** Procedure tested in staging
- **Effort:** 2 hours

### 4.7 Docker Compose Healthcheck Dependencies (P2)
- **Owner:** @fixer
- **Files:** `docker-compose.yml`
- **Change:** Add `depends_on: redis: condition: service_healthy` and `postgres: condition: service_healthy` to bot service
- **Verification:** `docker-compose up` → bot waits for Redis/Postgres healthy
- **Effort:** 30 minutes

### 4.8 Oracle Review: Phase 4 Implementation
- **Owner:** @oracle
- **Scope:** Verify tasks 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
- **Review Criteria:**
  - Redis singleton: `global._redisMap` removed; `createRedisClient` factory used; DI pattern throughout
  - ALLOW_UNVERIFIED_PLUGINS: structured warning logged in production when enabled
  - Distributed tracing: `traceId` generated per request/command/job; propagated via `AsyncLocalStorage`; present in logs, metrics, HTTP headers
  - Log sampling: `sampleRate` config; high-volume events sampled at 0.1
  - Rolling deployment doc: `docs/deployment/rolling.md` covers health grace period, connection drain, shard rolling restart, DB migration strategy
  - Backup/restore doc: `docs/operations/backup-restore.md` covers SQLite, Postgres, Redis, plugin manifest, encryption key rotation
  - Docker Compose: `depends_on` with `condition: service_healthy` for redis and postgres
  - All tests pass (`pnpm test`), lint clean (`pnpm lint`)
- **Deliverable:** Written review with PASS/FAIL per task, any follow-up items
- **Effort:** 2 hours

---

## Phase 5: Final Compliance Verification

### 5.1 Oracle Final Audit: All Original Findings Resolved
- **Owner:** @oracle (fresh session — independent verification)
- **Scope:** Re-run the original audit criteria against the codebase to confirm all 33 findings (6 P0, 11 P1, 16 P2) are resolved
- **Review Criteria — Original P0 Findings:**
  1. Job deduplication: `jobId` + `deduplication` in `processCommand.js` ✓
  2. Retry policy: `attempts: 3`, exponential backoff in queue config ✓
  3. Structured JSON logging: Pino logger with levels, traceId, child loggers ✓
  4. Discord REST error codes: `handleDiscordError` utility used in all commands ✓
  5. Sharding support: `ShardingManager` entry point, cross-shard EventBus ✓
  6. ENCRYPTION_KEY validation: startup check exits cleanly for missing/invalid ✓
- **Review Criteria — Original P1 Findings:**
  1. Unhandled rejection exits in production ✓
  2. EventBus emits 'error' on handler failures ✓
  3. Test isolation: `vi.restoreAllMocks()` in `afterEach` ✓
  4. Worker concurrency: `concurrency: 4`, `lockDuration: 60000`, limiter ✓
  5. SQLite `acquireConnectionTimeout: 10000` ✓
  6. Redis error logging no credential leak ✓
  7. Modal submission validation ✓
  8. Command option validation (string length, patterns) ✓
  9. Shutdown timeout guard (30s) ✓
  10. Postgres pool max validated against `max_connections` ✓
  11. EventBus `forEach` async fixed ✓
- **Review Criteria — Original P2 Findings:**
  1. `MessageFlags.Ephemeral` consistency (no `flags: 64`) ✓
  2. CSP headers on Interlink HTTP ✓
  3. Global request size limit (100kb) ✓
  4. `ALLOW_UNVERIFIED_PLUGINS` prod warning ✓
  5. Gateway latency histogram ✓
  6. Distributed tracing foundation (`AsyncLocalStorage`) ✓
  7. Log sampling config ✓
  8. Rolling deployment docs ✓
  9. Backup/restore docs ✓
  10. Docker Compose healthcheck dependencies ✓
  11. Redis singleton removed (DI pattern) ✓
  12. Contract tests for plugin APIs ✓
  13. Error path test coverage ✓
  14. Postgres pool max validation ✓
  15. Query timeout in Knex (if added) ✓
  16. No `console.log` in production code ✓
- **Verification Method:**
  - Run original audit checklist against current codebase
  - `pnpm test` — all tests pass
  - `pnpm lint` — zero errors
  - Manual spot-checks for each P0 finding
  - Compare against original audit report (ora-1 session)
- **Deliverable:** Final compliance report with PASS/FAIL for all 33 original findings, sign-off
- **Effort:** 4 hours

---

## Specialist Assignment Summary

| Specialist | Tasks | Total Est. Hours |
|------------|-------|------------------|
| **@fixer** | 0.1, 0.2 (fix), 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 4.1, 4.2, 4.4, 4.6, 4.7 | ~70 |
| **@oracle** | 0.2 (investigate), 1.6 (architect), 1.7 (review), 2.7 (review), 3.5 (review), 3.8 (review), 4.3 (design), 4.5 (review), 4.8 (review), 5.1 (final audit) | ~24 |
| **@designer** | None (no UI changes) | 0 |

---

## Parallelization Opportunities

**Within Phase 0:** 0.1, 0.2 (investigation can start while 0.1 in progress)
**Within Phase 1:** 1.1, 1.2, 1.3, 1.4 can run in parallel (independent files)
**Within Phase 2:** 2.2, 2.3, 2.4, 2.5, 2.6 can run in parallel
**Within Phase 3:** 3.1, 3.2, 3.3, 3.4, 3.7 can run in parallel; 3.5, 3.6 sequential
**Within Phase 4:** 4.1, 4.2, 4.4, 4.7 can run in parallel; 4.3, 4.5, 4.6 sequential

---

## Verification Gates

Each phase ends with a **Verification Gate** before proceeding:

| Gate | Criteria |
|------|----------|
| **Gate 1** (Post-Phase 1) | All P0 queue/security fixes pass; `pnpm test` green; `pnpm lint` clean; manual test: double-click command → single execution; failed job retries |
| **Gate 2** (Post-Phase 2) | Structured logs in JSON; error codes handled; worker concurrency works; test isolation fixed; `pnpm test` green |
| **Gate 3** (Post-Phase 3) | Sharding works (2 shards); Ephemeral flags consistent; shutdown timeout works; contract tests pass; `pnpm test` green |
| **Gate 4** (Post-Phase 4) | Tracing works; docs complete; Docker Compose waits for deps; `pnpm test` green; `pnpm lint` clean |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Sharding (1.6) breaks existing single-process assumptions | Feature flag `ENABLE_SHARDING`; default off; Phase 3 only |
| Structured logging (2.1) breaks test output | Keep `console` in tests via `tests/setup.js` mock; production only |
| Retry policy (1.2) causes duplicate side effects | Commands must be idempotent; audit all commands for idempotency in 1.5 |
| Worker concurrency (2.5) increases memory | Monitor RSS; add `maxMemory` restart in `workerHost.js` if needed |

---

## Tracking

- **Todo list:** This plan tracked in orchestrator todo
- **Per-task:** Each fix gets a todo entry when started
- **Commits:** Conventional commits per fix (e.g., `fix(queue): add job deduplication`)
- **Commit Policy:**
  - After each **non-Oracle task** (fixer/designer tasks): `git add -A && git commit -m "<conventional message>"`
  - After each **Oracle review task**: If PASS → no commit needed; If FAIL/findings → @fixer addresses each finding, then `git add -A && git commit -m "fix(<scope>): address oracle review <phase>.<task>"`
  - Oracle tasks themselves do not commit (review only)
- **Worktree:** Single git worktree (`../apollo-remediation`) for all changes; isolated development across all phases; changes merged back to main via PR after Phase 5 final audit passes

---

## Quick Start Commands

```bash
# Phase 0 - Pre-work
pnpm test --run  # baseline
# Fix 0.1: Move deploy-commands.js to scripts/, add CLI args, validation, dry-run
# Fix 0.2: @oracle investigates automod false positive bug (parallel with 0.1)

# Phase 1 - can start immediately in parallel
# Fix 1.1, 1.2, 1.3, 1.4 in parallel
# Fix 1.5 (touch many files)
# Fix 1.6 (architectural - needs @oracle first)

# Verify Gate 1
pnpm test && pnpm lint
# Manual: double-click slash command, kill worker mid-job
```