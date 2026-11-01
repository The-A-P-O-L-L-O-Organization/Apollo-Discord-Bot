# Dependency and Performance Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Apollo’s dependency safety, feed correctness, queue throughput, external-service protection, observability, and HTTP diagnostics without replacing its existing BullMQ, Redis, Discord.js, database, or scheduler architecture.

**Architecture:** Implement the work in dependency-ordered phases. First establish a clean dependency and measurement baseline, then improve RSS parsing and BullMQ behavior, then add bounded local concurrency, distributed provider quotas, and cross-system tracing. HTTP authentication and request diagnostics are hardened independently. Cache, transport, profiling, and gateway alternatives remain explicitly conditional on measurements.

**Tech Stack:** Node.js 26, TypeScript 7, ESM, pnpm, discord.js v14, BullMQ 6, Redis/ioredis, Knex with PostgreSQL or SQLite, OpenTelemetry, Prometheus, Pino, Hono, Vitest, oxlint

**Spec:** Prior dependency and performance assessment from the Apollo maintenance review; this plan records the approved implementation scope and deferral gates.

## Global Constraints

- Use pnpm only; never npm, yarn, bun, or npx.
- Use strict TypeScript ESM with `.js` relative import suffixes, 4-space indentation, single quotes, semicolons, no trailing commas, and no new `any` in `src/`.
- Preserve Node.js `>=26`, discord.js v14 compatibility, BullMQ queue names, Redis key formats, traceparent propagation, and existing database behavior.
- Preserve `safeFetch()` HTTPS, DNS-rebinding, timeout, and response-size protections for external HTTP calls.
- Keep queue payloads minimal, serializable, signed, and safe across gateway/worker trust boundaries.
- Use Redis-backed coordination only where the behavior must be shared across Apollo pods; do not turn process-local queues into durable work queues.
- Do not log tokens, webhook signatures, authorization headers, message content, queue payloads, database credentials, or other secrets.
- Do not add dependencies solely for speculative optimization; every dependency task requires a focused test or benchmark proving its value.
- New runtime dependencies require lockfile updates, license review, `pnpm audit`, build, typecheck, lint, and relevant Vitest coverage.
- No emojis in source, tests, docs, codemaps, commits, or PR text.
- Update README, INSTALLATION, CONTRIBUTING, SECURITY, runbooks, and relevant codemaps when configuration, operations, security, or architecture changes.
- Do not commit during implementation unless the executor explicitly chooses to commit; if committing, use focused commits and include the repository-required Copilot co-author trailer.

## Review Focus

1. **Feed parser boundary:** RSS/Atom documents containing CDATA, entities, namespaces, missing identifiers, malformed XML, and oversized responses must produce bounded normalized results or a contained error. Test in `tests/utils/integrationClients.test.ts`.
2. **Queue workload interference:** Increasing command-worker concurrency must not cause Redis saturation, database pool exhaustion, Discord rate-limit failures, or starvation of NSFW/scheduled jobs. Test in `tests/core/queue/` and verify with a repeatable benchmark.
3. **Cross-process trace continuity:** Gateway enqueue spans, BullMQ producer/consumer spans, and worker command spans must retain the existing traceparent relationship without duplicate high-cardinality telemetry. Test in `tests/observability/traceparent.test.ts` and queue telemetry tests.
4. **Distributed provider pressure:** Multiple pods polling the same provider must share limits, honor retry-after behavior, avoid unbounded pending work, and continue isolating failures with circuit breakers. Test in `tests/utils/integrationPoller.test.ts` and provider limiter tests.
5. **HTTP trust boundary:** Spoofed identity headers must never grant Bull Board access; authenticated requests must produce redacted request logs and bounded responses. Test in new admin HTTP tests plus `tests/utils/integrationWebhook.test.ts`.

---

## Phase 1: Establish the dependency and performance baseline

### Task 1: Remove known development dependency advisories

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `renovate.json`
- Test: dependency installation and audit commands

**Interfaces:**
- Consumes: current Vitest/Vite dependency graph and workspace overrides.
- Produces: patched Vitest/Vite development toolchain with reproducible lockfile installation.

- [ ] **Step 1: Record the current dependency and audit baseline**

Run:

```bash
pnpm audit --json
pnpm why vite @vitest/ui @vitest/coverage-v8
pnpm outdated --format json
```

Expected: Capture the existing Vite/Vitest advisory paths and current direct versions before editing.

- [ ] **Step 2: Write the dependency verification test script**

Add a package-manager verification command or CI step that runs:

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level=moderate
```

The audit command must fail on remaining moderate-or-higher advisories unless an explicit repository-approved exception is documented.

- [ ] **Step 3: Upgrade the patched test toolchain**

Update `vitest`, `@vitest/ui`, `@vitest/coverage-v8`, and the `vite` workspace override together. Keep the versions mutually compatible with Node.js 26 and the existing Vitest configuration.

- [ ] **Step 4: Remove catalog entries with no implementation use**

Remove unused workspace catalog entries such as `bcryptjs`, `compression`, `helmet`, and `@opentelemetry/instrumentation-grpc` unless another task in this plan adds their imports.

- [ ] **Step 5: Verify the dependency baseline**

Run:

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level=moderate
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Expected: frozen installation, audit, lint, typecheck, build, and tests pass.

- [ ] **Step 6: Commit the dependency baseline**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml renovate.json
git commit -m "chore: update audited development dependencies"
```

Include the required Copilot co-author trailer if committing.

### Task 2: Add reusable performance evidence

**Files:**
- Modify: `src/utils/metrics.ts`
- Modify: `src/queue/metrics.ts`
- Modify: `src/worker.ts`
- Modify: `src/config/config.ts`
- Modify: `src/types/config.ts`
- Create: `tests/core/queue/worker-metrics.test.ts`
- Create: `tests/utils/performanceMetrics.test.ts`
- Optional modify: `README.md`, `docs/runbooks/`

**Interfaces:**
- Produces: named metrics and validated configuration for queue wait time, job duration, active jobs, retries/failures, worker memory, Redis latency, and event-loop delay.
- Existing command, queue, and health code consumes these metrics without changing public behavior.

- [ ] **Step 1: Write failing metric assertions**

Add tests asserting that the metric registry exposes bounded-label metrics for:

- queue wait seconds
- job duration seconds
- active jobs
- job outcomes
- Redis operation latency
- event-loop delay
- worker memory

Assert that queue/job labels use fixed names and do not include job IDs, guild IDs, user IDs, URLs, or raw command arguments.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
pnpm vitest run tests/core/queue/worker-metrics.test.ts tests/utils/performanceMetrics.test.ts
```

Expected: FAIL because the new metrics do not exist.

- [ ] **Step 3: Implement metrics and validated settings**

Add typed configuration for worker concurrency and limiter values with safe finite ranges. Record metrics at queue enqueue, worker start, worker completion, retry, failure, and shutdown boundaries. Use Node’s event-loop delay facility only if it can be started and stopped with the existing lifecycle.

- [ ] **Step 4: Run focused tests and existing metrics tests**

```bash
pnpm vitest run tests/core/queue/worker-metrics.test.ts tests/utils/performanceMetrics.test.ts tests/core/queue/metrics.test.ts tests/utils/metrics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Document the baseline signals**

Document metric names, labels, sampling expectations, and the initial interpretation of queue wait versus processing time in the relevant runbook.

## Phase 2: Correct feed parsing and preserve network safeguards

### Task 3: Replace regex RSS/Atom parsing with `fast-xml-parser`

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `src/utils/integrationClients.ts`
- Test: `tests/utils/integrationClients.test.ts`
- Modify: `src/utils/safeFetch.ts` only if parser input limits need a narrowly scoped helper

**Interfaces:**
- Consumes: `safeFetch(feedUrl, options)`.
- Produces: `checkRssFeed(feedUrl): Promise<RssFeedResult | null>` with the existing result shape and circuit-breaker behavior.

- [ ] **Step 1: Add failing parser fixtures**

Extend `tests/utils/integrationClients.test.ts` with fixtures for RSS 2.0, Atom, CDATA, entities, namespaces, multiline values, missing GUIDs, missing links, empty feeds, malformed XML, and parser output containing no raw unbounded document.

Assert normalized `{ feedTitle, items }` results and that malformed input returns the existing failure shape.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
pnpm vitest run tests/utils/integrationClients.test.ts
```

Expected: New parser cases fail against the regex implementation.

- [ ] **Step 3: Install and configure `fast-xml-parser`**

Add the production dependency. Configure parsing to preserve bounded input, decode entities, support RSS/Atom namespaces, and avoid exposing parser internals to callers. Normalize alternate RSS and Atom field names in a small private helper rather than spreading parser-specific shapes through the poller.

- [ ] **Step 4: Replace the regex parser**

Implement the parser behind the existing `checkRssFeed()` contract. Keep `safeFetch()` as the only fetch boundary, retain the circuit breaker, and use GUID/ID/link fallback rules compatible with `integrationPoller.ts`.

- [ ] **Step 5: Run integration client and poller tests**

```bash
pnpm vitest run tests/utils/integrationClients.test.ts tests/utils/integrationPoller.test.ts tests/utils/integrationFormatters.test.ts
```

Expected: PASS with existing notification and deduplication behavior preserved.

- [ ] **Step 6: Verify parser dependency safety**

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --audit-level=moderate
```

## Phase 3: Tune BullMQ before introducing additional execution systems

### Task 4: Make worker concurrency and limiter settings configurable

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/config/config.ts`
- Modify: `src/types/config.ts`
- Modify: `src/queue/queue.ts`
- Modify: `src/types/queue.ts`
- Modify: `tests/core/queue/queue.test.ts`
- Create: `tests/core/queue/worker-config.test.ts`
- Modify: `.env.example`, `README.md`, `INSTALLATION.md`

**Interfaces:**
- Produces: validated `config.queue.worker` settings consumed by `startWorker()`.
- Preserves the existing queue prefix, job names, retry policy, and shutdown contract.

- [ ] **Step 1: Write failing configuration tests**

Test valid and invalid values for worker concurrency, limiter maximum, limiter duration, lock duration, and retry settings. Invalid values must fail startup validation rather than silently defaulting.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
pnpm vitest run tests/core/queue/worker-config.test.ts
```

Expected: FAIL because the typed settings are not available.

- [ ] **Step 3: Implement typed configuration**

Add finite, bounded settings with repository-safe defaults matching the current behavior: concurrency `4`, limiter maximum `50`, limiter duration `1000`, and lock duration `60000` unless the existing configuration contract requires another value.

- [ ] **Step 4: Wire settings into the BullMQ worker**

Replace hard-coded worker options in `src/worker.ts` with validated configuration. Keep `worker.close()`, queue closure, database shutdown, Redis shutdown, and OpenTelemetry shutdown ordered and awaited.

- [ ] **Step 5: Run queue and worker tests**

```bash
pnpm vitest run tests/core/queue/ tests/core/worker/ tests/core/queue/worker-config.test.ts
```

Expected: PASS.

### Task 5: Add workload-aware queue metrics and tuning guidance

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/queue/metrics.ts`
- Modify: `src/utils/metrics.ts`
- Create: `benchmarks/queue-worker-benchmark.ts`
- Create: `tests/core/queue/worker-throughput.test.ts`
- Modify: `docs/runbooks/` queue operations documentation

**Interfaces:**
- Consumes: Task 2 metrics and Task 4 configuration.
- Produces: repeatable benchmark output for command, NSFW, scheduled, and webhook workloads.

- [ ] **Step 1: Write the benchmark contract test**

Test that the benchmark reports queue wait, execution duration, throughput, failure count, and peak active jobs using deterministic fake handlers. The benchmark must not require production Redis or Discord credentials.

- [ ] **Step 2: Implement the isolated benchmark harness**

Use injectable queue/worker adapters or deterministic fakes. Do not load production secrets or send Discord messages. Support fixed concurrency values so before/after runs are comparable.

- [ ] **Step 3: Add tuning guidance**

Document how to compare throughput against Redis latency, database pool pressure, rate-limit responses, event-loop delay, and worker memory. State that concurrency must not be increased based on throughput alone.

- [ ] **Step 4: Run the benchmark and focused tests**

```bash
pnpm vitest run tests/core/queue/worker-throughput.test.ts
pnpm exec tsx benchmarks/queue-worker-benchmark.ts --concurrency 1,4,8
```

Expected: deterministic report generated without external credentials.

## Phase 4: Add bounded local concurrency and provider quotas

### Task 6: Bound local integration concurrency with `p-limit`

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `src/utils/integrationPoller.ts`
- Modify: `src/utils/translation.ts` if translation batches are added to the limiter boundary
- Modify: `src/utils/openaiModeration.ts` if moderation batches are added to the limiter boundary
- Create: `src/utils/localConcurrency.ts`
- Create: `tests/utils/localConcurrency.test.ts`
- Modify: `tests/utils/integrationPoller.test.ts`

**Interfaces:**
- Produces: typed bounded local limiter factory, for example `createLocalLimiter(name: LocalLimiterName, concurrency: number): LocalLimiter`.
- Poller tasks retain per-subscription error isolation and existing Redis deduplication.

- [ ] **Step 1: Write failing limiter tests**

Test that no more than the configured number of tasks run simultaneously, a rejected task does not cancel unrelated tasks, and shutdown prevents new work from being accepted.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
pnpm vitest run tests/utils/localConcurrency.test.ts
```

Expected: FAIL because the limiter helper does not exist.

- [ ] **Step 3: Add `p-limit` and implement the local limiter**

Keep the limiter process-local and bounded. Expose active/pending counts for metrics. Do not add an unbounded pending array or durable retry behavior.

- [ ] **Step 4: Apply limits to polling batches**

Use separate limits for Twitch, YouTube, and RSS. Preserve `withLock`, per-subscription handling, circuit breakers, `NonceStore`, and graceful poller shutdown.

- [ ] **Step 5: Run poller and limiter tests**

```bash
pnpm vitest run tests/utils/localConcurrency.test.ts tests/utils/integrationPoller.test.ts
```

Expected: PASS, including large-subscription and single-failure cases.

### Task 7: Add Redis-coordinated provider quotas with `bottleneck`

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Create: `src/utils/providerLimiters.ts`
- Modify: `src/utils/integrationClients.ts`
- Modify: `src/utils/translation.ts`
- Modify: `src/utils/openaiModeration.ts`
- Modify: `src/utils/integrationPoller.ts`
- Create: `tests/utils/providerLimiters.test.ts`
- Modify: `tests/utils/integrationClients.test.ts`
- Modify: `tests/utils/integrationPoller.test.ts`
- Modify: `tests/utils/redis.test.ts`
- Modify: `.env.example`, `README.md`, `INSTALLATION.md`

**Interfaces:**
- Produces: provider-specific limiter accessors with bounded local fallback when Redis is unavailable.
- Existing clients continue returning their current result types and continue using circuit breakers and timeout handling.

- [ ] **Step 1: Write failing provider quota tests**

Test provider-specific limits, Redis-backed coordination, local fallback, retry-after handling, bounded pending work, and limiter reset during shutdown. Verify that a provider failure does not open unrelated provider limiters.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
pnpm vitest run tests/utils/providerLimiters.test.ts
```

Expected: FAIL because provider limiter infrastructure does not exist.

- [ ] **Step 3: Implement provider limiter configuration**

Create explicit limiter names and validated settings for Twitch, YouTube, GitHub, LibreTranslate, OpenAI, and RSS. RSS should support per-origin keys where practical. Keep limits conservative and configurable rather than embedding undocumented provider quotas.

- [ ] **Step 4: Wrap outbound provider operations**

Schedule provider calls through Bottleneck while preserving `safeFetch` where applicable, bounded timeouts, circuit breakers, deduplication, and safe error conversion.

- [ ] **Step 5: Add quota metrics and logs**

Record throttled, queued, rejected, succeeded, failed, and retry-after events with fixed provider labels. Never include API keys, full URLs with secrets, message content, or user data.

- [ ] **Step 6: Run provider tests and integration checks**

```bash
pnpm vitest run tests/utils/providerLimiters.test.ts tests/utils/integrationClients.test.ts tests/utils/integrationPoller.test.ts tests/utils/redis.test.ts
pnpm lint
pnpm typecheck
```

Expected: PASS.

## Phase 5: Add queue, database, Redis, and HTTP observability

### Task 8: Migrate and align OpenTelemetry SDK dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `src/observability/otel.ts`
- Modify: `src/observability/codemap.md`
- Create or modify: `tests/observability/otel.test.ts`

**Interfaces:**
- Preserves `initializeOtel`, `getTracer`, `injectTraceContext`, `extractTraceContext`, `shutdownOtel`, `createSpan`, and `endSpan`.
- Produces: one compatible OpenTelemetry SDK family with no deprecated direct trace SDK packages.

- [ ] **Step 1: Write lifecycle and compatibility tests**

Test one-time initialization, repeated initialization, W3C propagation, exporter shutdown, and safe behavior when no OTLP endpoint is configured.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
pnpm vitest run tests/observability/otel.test.ts tests/observability/traceparent.test.ts
```

Expected: FAIL only for newly specified lifecycle expectations.

- [ ] **Step 3: Replace deprecated direct SDK packages**

Use the current supported OpenTelemetry SDK package and align API, core, resources, context, exporter, instrumentation, and semantic-convention versions as one family. Do not mix major generations.

- [ ] **Step 4: Preserve Apollo’s lifecycle and propagation**

Keep the existing service-name resource, OTLP HTTP exporter, batch processor, async context manager, W3C propagator, and shutdown semantics. Avoid changing log field or traceparent formats.

- [ ] **Step 5: Run observability verification**

```bash
pnpm vitest run tests/observability/otel.test.ts tests/observability/traceparent.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

### Task 9: Add BullMQ, PostgreSQL, and ioredis instrumentation

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `src/observability/otel.ts`
- Modify: `src/worker.ts`
- Modify: `src/queue/queue.ts`
- Create: `tests/observability/queue-otel.test.ts`
- Modify: `tests/core/queue/queue.test.ts`
- Modify: `tests/core/db/knex.test.ts`
- Modify: `tests/utils/redis.test.ts`

**Interfaces:**
- Consumes: Task 8 OpenTelemetry lifecycle.
- Produces: queue, PostgreSQL, and ioredis spans without changing business results or traceparent serialization.

- [ ] **Step 1: Write failing instrumentation tests**

Test that instrumentation is registered once, queue producer/consumer context remains connected, database and Redis instrumentation can be disabled when OTLP is not configured, and sensitive job data is not recorded as span attributes.

- [ ] **Step 2: Add the instrumentation dependencies**

Add `bullmq-otel`, `@opentelemetry/instrumentation-pg`, and `@opentelemetry/instrumentation-ioredis` with versions compatible with the aligned SDK family.

- [ ] **Step 3: Wire BullMQ telemetry**

Pass a shared telemetry implementation to queue and worker creation. Preserve the existing custom traceparent payload propagation and avoid duplicate spans when an active Apollo span already exists.

- [ ] **Step 4: Register PostgreSQL and ioredis instrumentation**

Register instrumentation in the guarded OpenTelemetry initialization path. Use fixed service and operation attributes; never record SQL values, Redis values, queue payloads, tokens, or message content.

- [ ] **Step 5: Verify queue and infrastructure traces**

```bash
pnpm vitest run tests/observability/queue-otel.test.ts tests/core/queue/ tests/core/db/knex.test.ts tests/utils/redis.test.ts
pnpm lint
pnpm typecheck
```

Expected: PASS with tracing disabled and enabled test modes.

### Task 10: Harden admin authentication and add `pino-http`

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `src/admin/bullboard.ts`
- Modify: `src/admin/server.ts`
- Modify: `src/utils/healthServer.ts`
- Modify: `src/utils/integrationWebhook.ts`
- Modify: `src/config/config.ts`
- Modify: `src/types/config.ts`
- Create: `tests/admin/bullboard-auth.test.ts`
- Modify: `tests/utils/integrationWebhook.test.ts`
- Modify: `tests/utils/startupChecks.test.ts`
- Modify: `.env.example`, `SECURITY.md`, `README.md`, `INSTALLATION.md`

**Interfaces:**
- Produces: authenticated owner-only Bull Board access, redacted request logging, request IDs, and safe lifecycle behavior for all Node HTTP servers.
- Existing routes and response shapes remain compatible except unauthorized access must no longer be granted by spoofed headers.

- [ ] **Step 1: Write failing authentication tests**

Test that:

- a spoofed `X-User-ID` header cannot authenticate;
- missing credentials return `401`;
- invalid credentials return `401`;
- valid configured credentials reach the Bull Board route;
- non-owner authenticated identities return `403`;
- auth comparison is constant-time;
- auth failures are logged without secrets.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
pnpm vitest run tests/admin/bullboard-auth.test.ts
```

Expected: FAIL against the current header-based identity check.

- [ ] **Step 3: Implement real admin authentication**

Use a configured bearer token or repository-approved authenticated proxy boundary. Validate presence and production requirements in startup checks. Keep owner authorization separate from authentication.

- [ ] **Step 4: Add `pino-http`**

Reuse Apollo’s Pino logger. Add request IDs, method/path/status/duration fields, path normalization, and redaction for authorization, webhook signatures, cookies, API keys, and query secrets. Do not log request bodies.

- [ ] **Step 5: Add request metrics correlation**

Ensure pino request IDs and existing Prometheus request metrics use the same normalized route labels without introducing high-cardinality URLs.

- [ ] **Step 6: Run HTTP security tests**

```bash
pnpm vitest run tests/admin/bullboard-auth.test.ts tests/utils/integrationWebhook.test.ts tests/utils/startupChecks.test.ts
pnpm lint
pnpm typecheck
```

## Phase 6: Conditional cache and transport improvements

### Task 11: Decide whether to replace the custom locale cache with `lru-cache`

**Files:**
- Inspect/modify: `src/i18n/localeCache.ts`
- Modify: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` only if migration is approved
- Modify: `tests/utils/lruCache.test.ts`
- Modify: `src/i18n/codemap.md` if behavior changes

**Interfaces:**
- Preserves TTL `5 * 60 * 1000`, maximum `5000` entries, LRU promotion, deletion, clearing, size reporting, and EventBus invalidation.

- [ ] **Step 1: Benchmark the existing cache**

Measure get/set/delete/expiry behavior and memory for representative locale-cache workloads. Compare against the actual requirements rather than package feature count.

- [ ] **Step 2: Make the go/no-go decision**

Do not add `lru-cache` if the custom cache meets requirements and no stale-while-revalidate or async fetch behavior is needed. If approved, record the reason in the plan execution notes.

- [ ] **Step 3: If approved, write compatibility tests first**

Pin TTL, cap, LRU ordering, invalidation, and clear behavior in `tests/utils/lruCache.test.ts`.

- [ ] **Step 4: Replace the implementation only after tests pass**

Keep the cache process-local and retain cross-pod EventBus invalidation.

### Task 12: Decide whether direct `undici` dispatchers are needed

**Files:**
- Inspect/modify: `src/utils/safeFetch.ts`
- Inspect/modify: `src/utils/integrationClients.ts`
- Inspect/modify: `src/utils/translation.ts`
- Add dependency only if approved: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- Add/modify: `tests/utils/safeFetch.test.ts` if present or create it

**Interfaces:**
- Preserves all `safeFetch` security and timeout guarantees.

- [ ] **Step 1: Profile outbound HTTP**

Measure connection reuse, latency, concurrency, timeouts, and origin distribution using controlled integration fixtures.

- [ ] **Step 2: Make the go/no-go decision**

Do not install direct `undici` usage if Node’s built-in fetch is sufficient. Approve it only for demonstrated needs such as per-origin pools, proxies, custom CA, or dispatcher-level limits.

- [ ] **Step 3: If approved, add dispatcher support behind `safeFetch`**

Keep provider code unaware of transport internals. Enforce HTTPS, DNS checks, response-size limits, timeouts, and safe error behavior.

## Phase 7: Development-only profiling and benchmarking

### Task 13: Add repeatable CPU profiling with `0x`

**Files:**
- Modify: `package.json` only if approved
- Create: `benchmarks/README.md` or update existing benchmark documentation
- Add no production imports

**Interfaces:**
- Produces: documented developer command for profiling a controlled Apollo workload.

- [ ] **Step 1: Identify a measured CPU or event-loop hotspot**

Do not add `0x` without evidence from event-loop delay, CPU usage, or a reproducible slow benchmark.

- [ ] **Step 2: Add the development-only dependency and command**

Document a command that profiles a local fixture or benchmark without production credentials.

- [ ] **Step 3: Verify the profile workflow**

Run the command against a deterministic workload and confirm it produces a readable flamegraph artifact outside committed runtime data.

### Task 14: Add isolated HTTP benchmarks with `autocannon`

**Files:**
- Modify: `package.json` only if approved
- Create: `benchmarks/http-benchmark.ts`
- Create: `tests/benchmarks/http-benchmark.test.ts` if the harness needs automated validation
- Modify: `docs/runbooks/`

**Interfaces:**
- Produces: safe local benchmarks for health, readiness, metrics, authenticated admin routes, and side-effect-free webhook fixtures.

- [ ] **Step 1: Write benchmark safety assertions**

Assert that the harness uses test credentials, valid fixture signatures, isolated state, no production URLs, and no Discord notification side effects.

- [ ] **Step 2: Add the development-only benchmark**

Use fixed duration, connections, and request counts. Report throughput, latency percentiles, status distribution, and errors.

- [ ] **Step 3: Run the benchmark locally**

```bash
pnpm exec tsx benchmarks/http-benchmark.ts
```

Expected: deterministic local report with no production side effects.

## Deferred work and explicit no-go gates

### `piscina`

Do not add unless profiling proves synchronous CPU saturation or event-loop blocking inside Node. Candidate workloads are large transcript processing, archive scanning, or expensive similarity calculations. BullMQ, plugin workers, the Rust NSFW service, and Go interlink service remain the first isolation options.

### `@discordjs/ws`

Do not add unless gateway CPU, cache pressure, shard startup, reconnect, or event-dispatch profiling proves the high-level Discord.js gateway layer is the bottleneck. This would be a separate gateway architecture plan.

### `fastify` and `@fastify/rate-limit`

Do not migrate the current small HTTP surface. Revisit only when Apollo has a substantial public HTTP API with route schemas, authentication middleware, uploads, and multiple external consumers.

## Documentation and release gates

- Update `.env.example` for every new worker, limiter, telemetry, or authentication setting.
- Update `README.md` and `INSTALLATION.md` for setup and operational configuration.
- Update `SECURITY.md` for admin authentication, request logging, external quotas, and telemetry redaction.
- Update relevant codemaps for new files and integration boundaries.
- Add or update runbooks for queue tuning, provider throttling, OpenTelemetry troubleshooting, and admin access.
- Keep dependency changes separate from behavior changes where practical.
- Regenerate and review `pnpm-lock.yaml`; never hand-edit lockfile integrity data.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and focused tests after each phase.
- Run `pnpm test` after cross-cutting queue, dependency, observability, or HTTP changes.
- Run `pnpm audit --audit-level=moderate` after all dependency changes.
- Run `pnpm lint:locales` if locale or i18n files are touched.

## Verification budget

| Claim | Evidence owner | Minimum evidence |
|---|---|---|
| Known dependency advisories are resolved | Task 1 | Frozen install, `pnpm audit`, build, full tests |
| Feeds parse correctly without weakening SSRF/resource controls | Task 3 | Parser fixtures, integration poller tests, safe-fetch tests |
| BullMQ throughput improves without destabilizing dependencies | Tasks 4-5 | Queue metrics, deterministic benchmark, queue/worker tests, Redis/DB/rate-limit review |
| Local integration work is bounded | Task 6 | Concurrency tests, large-subscription poller test, memory/backpressure observation |
| Provider quotas are shared and failures remain isolated | Task 7 | Redis-backed limiter tests, retry-after tests, multi-instance integration test |
| Traces connect gateway, queues, workers, PostgreSQL, and Redis safely | Tasks 8-9 | OTel lifecycle, traceparent, queue telemetry, DB/Redis instrumentation tests |
| Admin access is authenticated and HTTP activity is diagnosable | Task 10 | Auth bypass tests, redaction tests, webhook tests, startup validation |
| Optional cache/transport dependencies are justified | Tasks 11-12 | Before/after benchmark and explicit go/no-go decision |
| Profiling tools do not enter production | Tasks 13-14 | Development-only package placement and isolated benchmark execution |

## Final execution order

1. Dependency audit remediation and baseline measurements.
2. XML parser replacement.
3. BullMQ configuration, metrics, and benchmark harness.
4. `p-limit` bounded local integration concurrency.
5. `bottleneck` distributed provider quotas.
6. OpenTelemetry SDK alignment.
7. BullMQ, PostgreSQL, and ioredis instrumentation.
8. Admin authentication and `pino-http`.
9. Conditional `lru-cache` and Undici decisions.
10. Development-only `0x` and `autocannon`.
11. Defer Piscina, `@discordjs/ws`, and Fastify until their go/no-go evidence exists.
