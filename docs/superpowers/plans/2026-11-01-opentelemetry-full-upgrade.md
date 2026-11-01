# OpenTelemetry Full Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Apollo's OpenTelemetry packages as one compatible family and preserve current tracing, propagation, exporter, and instrumentation behavior.

**Architecture:** Keep Apollo's existing `src/observability/otel.ts` public helpers and explicit exporter opt-in. Prefer the current `NodeSDK` lifecycle and current semantic-convention/resource APIs; remove obsolete direct packages only when no Apollo source imports them. Regenerate the pnpm catalog and lockfile as one dependency change.

**Tech Stack:** Node.js 26, TypeScript ESM, pnpm, OpenTelemetry JS, Vitest, oxlint, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-01-opentelemetry-full-upgrade-design.md`

## Global Constraints

- Align the OpenTelemetry family together; do not merge isolated 0.300 package bumps into the old 0.222 generation.
- Preserve OTLP opt-in behavior, no-op test behavior, W3C propagation, graceful shutdown, and HTTP/Redis/PostgreSQL/BullMQ instrumentation.
- Do not silently enable exporters when no endpoint is configured.
- Keep changes limited to OpenTelemetry packages, required peer/catalog updates, bootstrap compatibility, tests, and lockfile output.
- Use pnpm only and retain strict TypeScript ESM imports with `.js` suffixes.

## Review Focus

- No endpoint configured: initialization must not create an exporter or emit telemetry unexpectedly; test the no-op path.
- Repeated initialization and shutdown: lifecycle calls must remain idempotent and not leak providers or context managers; test repeated calls.
- W3C traceparent propagation: valid remote contexts must survive async boundaries and invalid carriers must remain harmless; retain the existing traceparent tests.
- Resource identity: emitted telemetry must retain Apollo's service name and current default resource attributes; test the configured service name.
- Current instrumentation registration: HTTP instrumentation and existing instrumentation wiring must remain registered once after the SDK migration; test the registration boundary with mocks.

---

### Task 1: Establish the failing OTel upgrade contract

**Files:**
- Modify: `tests/observability/traceparent.test.ts`
- Modify: `tests/integration/otel-trace.test.ts`
- Create: `tests/observability/otel-lifecycle.test.ts`

**Interfaces:**
- Consumes: `initializeOtel`, `getTracer`, `shutdownOtel`, `injectTraceContext`, and `extractTraceContext` from `src/observability/otel.ts`.
- Produces: Focused assertions that pin lifecycle, no-endpoint behavior, resource service name, and propagation compatibility before dependency changes.

- [ ] **Step 1: Add lifecycle tests** asserting initialization is idempotent, shutdown is safe when called more than once, and a fresh initialization works after shutdown.
- [ ] **Step 2: Add no-exporter tests** using mocked exporter/SDK construction to prove endpoint-less startup does not create an OTLP exporter.
- [ ] **Step 3: Add resource/instrumentation assertions** verifying `service.name` is set and HTTP instrumentation registration occurs once.
- [ ] **Step 4: Run the focused tests** with `pnpm vitest run tests/observability/otel-lifecycle.test.ts tests/observability/traceparent.test.ts tests/integration/otel-trace.test.ts`.
- [ ] **Step 5: Commit** the failing/contract tests with `git commit -m "test: define OpenTelemetry upgrade contract"`.

### Task 2: Upgrade the OpenTelemetry dependency family

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: The package set and catalog entries currently used by Apollo's observability bootstrap and instrumentation modules.
- Produces: A single lockfile-resolved OpenTelemetry family using the latest mutually compatible versions available for Node.js 26: API 1.10.x, experimental packages 0.300.x, core/resource/context packages 3.0.x, semantic conventions 1.44.x, auto-instrumentations 0.82.x, and compatible trace SDK packages.

- [ ] **Step 1: Update every direct OpenTelemetry catalog entry and package specifier together**, including `@opentelemetry/api`, `auto-instrumentations-node`, `context-async-hooks`, `core`, `exporter-trace-otlp-http`, `instrumentation`, `instrumentation-http`, `resources`, `sdk-node`, trace SDK packages, and semantic conventions.
- [ ] **Step 2: Remove direct OpenTelemetry packages that Apollo no longer imports** after the SDK migration is selected, rather than retaining unused deprecated direct dependencies.
- [ ] **Step 3: Regenerate the lockfile** with `pnpm install` and verify no 0.222-era direct instrumentation packages remain.
- [ ] **Step 4: Run `pnpm syncpack lint` or the repository's equivalent dependency consistency check** and confirm catalog and manifest versions agree.
- [ ] **Step 5: Commit** the dependency-only update with `git commit -m "chore(deps): upgrade OpenTelemetry family"`.

### Task 3: Migrate the OTel bootstrap to current APIs

**Files:**
- Modify: `src/observability/otel.ts`
- Modify: `src/index.ts` only if lifecycle invocation requires an API-compatible adjustment
- Modify: `src/worker.ts` only if lifecycle invocation requires an API-compatible adjustment

**Interfaces:**
- Consumes: `OtelInitOptions`, `initializeOtel`, `shutdownOtel`, `getTracer`, `injectTraceContext`, and `extractTraceContext`; callers must retain these names and behavior.
- Produces: Current OpenTelemetry SDK initialization with explicit OTLP HTTP exporter configuration, merged default/custom resource attributes, current propagator registration, HTTP instrumentation registration, and awaited shutdown.

- [ ] **Step 1: Update the implementation** to use `NodeSDK` where supported by the resolved package generation, preserving the existing public helper signatures.
- [ ] **Step 2: Preserve explicit exporter gating** so callers without an endpoint receive no exporter setup and existing startup warnings remain authoritative.
- [ ] **Step 3: Merge the default resource with Apollo's `service.name` resource attributes** so SDK metadata is not lost during the upgrade.
- [ ] **Step 4: Keep context manager and W3C propagator registration compatible** with the resolved API, avoiding duplicate global registration during repeated initialization.
- [ ] **Step 5: Run the focused lifecycle and propagation tests** and confirm the new implementation passes them.
- [ ] **Step 6: Commit** the bootstrap migration with `git commit -m "refactor(otel): migrate to current SDK lifecycle"`.

### Task 4: Verify the full repository integration

**Files:**
- Modify: focused OTel tests only if failures expose behavior regressions
- Modify: `docs/superpowers/specs/2026-11-01-opentelemetry-full-upgrade-design.md` only if final version decisions need recording

**Interfaces:**
- Consumes: The upgraded dependency graph and bootstrap from Tasks 2-3.
- Produces: Verified build, type safety, lint, tests, and dependency audit results suitable for a PR.

- [ ] **Step 1: Run `pnpm lint` and fix only upgrade-caused diagnostics.**
- [ ] **Step 2: Run `pnpm typecheck` and distinguish upgrade-caused errors from documented pre-existing repository errors.**
- [ ] **Step 3: Run focused OTel tests and then `pnpm test`.**
- [ ] **Step 4: Run `pnpm build`.**
- [ ] **Step 5: Run dependency consistency and audit checks, including the repository's CI-equivalent security audit.**
- [ ] **Step 6: Review `git diff`, confirm no unrelated dependency updates entered the change, and commit any test-only corrections with `git commit -m "test(otel): verify upgraded telemetry stack"`.
