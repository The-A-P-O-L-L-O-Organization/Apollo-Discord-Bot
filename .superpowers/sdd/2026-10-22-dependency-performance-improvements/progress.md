# SDD ledger — plan: docs/superpowers/plan/2026-10-22-dependency-performance-improvements.md

## Setup

- Worktree: `.worktrees/dependency-performance-improvements`
- Branch: `chore/dependency-performance-improvements`
- Plan spec: no separate reachable design spec; the plan is the binding authority.

## Pre-flight conflict scan

| Tasks | Shared file/interface | Finding | Ruling |
|---|---|---|---|
| 1 / 2 | `package.json`, lockfile, verification | Task 1 updates test tooling; Task 2 adds runtime metrics. No behavioral conflict. | Execute Task 1 first. |
| 2 / 4 / 5 | `src/worker.ts`, queue metrics/config | Task 2 creates evidence; Tasks 4-5 consume and extend it. | Keep metric names stable after Task 2; later tasks add labels only when bounded. |
| 3 / 6 / 7 | `src/utils/integrationClients.ts`, `integrationPoller.ts` | Parser replacement, local concurrency, and provider limiters wrap different layers. | Preserve `checkRssFeed()` result shape and wrap outbound calls below poller task scheduling. |
| 7 / 9 | Redis connections and provider telemetry | Provider limiter Redis usage and ioredis instrumentation can overlap. | Use existing Redis factories and register instrumentation once. |
| 8 / 9 | `src/observability/otel.ts` | Task 8 changes SDK packages; Task 9 adds instrumentation. | Task 8 must finish and pass before Task 9 wiring. |
| 9 / 10 | HTTP/queue observability and logging | Separate concerns; no direct API conflict. | Keep sensitive data redaction centralized. |
| 10 / 12 | HTTP outbound/security boundaries | Task 10 hardens inbound servers; Task 12 optionally tunes outbound transport. | Do not let transport changes weaken `safeFetch()`. |
| 11 / 12 | Optional dependencies | Independent go/no-go decisions. | Do not install either without benchmark evidence. |
| 13 / 14 | Development tooling | Independent tooling and no production imports. | Keep both dev-only and isolated. |

| Task | Self-consistency scan | Finding | Ruling |
|---|---|---|---|
| 1 | Tests/files/requirements | Audit command is concrete; `renovate.json` is listed although likely only version grouping changes. | Implement only necessary config updates. |
| 2 | Tests/files/requirements | Metric tests and implementation files align. | Proceed. |
| 3 | Tests/files/requirements | Existing integration client contract is explicit. | Preserve result shape. |
| 4 | Tests/files/requirements | Config and worker files align with current hard-coded settings. | Preserve current defaults. |
| 5 | Tests/files/requirements | Benchmark harness is separate from production queue. | No production credentials. |
| 6 | Tests/files/requirements | `p-limit` is local and bounded. | Do not add durable retry semantics. |
| 7 | Tests/files/requirements | Provider limiter names/config are open but bounded. | Use explicit names and conservative defaults. |
| 8 | Tests/files/requirements | SDK migration preserves exported functions. | Keep public observability API stable. |
| 9 | Tests/files/requirements | Instrumentation spans multiple existing modules. | Register once and avoid sensitive attributes. |
| 10 | Tests/files/requirements | Authentication change is security-sensitive. | Implement bearer-token authentication; do not trust identity headers. |
| 11 | Tests/files/requirements | Explicitly conditional. | Benchmark before dependency change. |
| 12 | Tests/files/requirements | Explicitly conditional. | Benchmark before dependency change. |
| 13 | Tests/files/requirements | Explicitly conditional dev-only. | Add only after measured hotspot. |
| 14 | Tests/files/requirements | Explicitly conditional dev-only. | Keep fixtures side-effect free. |

## Rulings

- Ruling: implement the plan in dependency order, but park conditional tasks when their evidence gates are not met — this avoids speculative runtime dependencies at the cost of leaving optional improvements unimplemented.
- Ruling: use the current worktree’s existing repository state as the baseline and do not revert unrelated changes — this preserves user work at the cost of requiring careful diff scoping.

## Task progress

- Task 1: complete with parked pre-existing typecheck finding (commit `2bc459f4`).
- Task 1 review: dependency/audit/build/tests approved; `pnpm typecheck` remains blocked by pre-existing unrelated test errors listed in `task-1-report.md`.
- Task 1 ruling: do not broaden Task 1 into unrelated test/type cleanup; carry the typecheck baseline as a final-review concern because changing dependencies did not introduce these errors.
- Task 2: complete with commits `56d1f7f8` and `f9961759`.
- Task 2 review: initial review found NSFW job label normalization losing `nsfw:analyze`; fixed surgically and re-reviewed with no significant remaining findings.
- Task 2 ruling: retain the bounded metric label allowlists and preserve exact namespaced job labels before normalization.
- Task 3: complete with commits `0b0ef949256b06bcde798e45446101a274b86405` and `640ccfc1a3ac8aa2c78f8d9e558d84995803b25e`.
- Task 3 review: initial review found RSS 1.0/RDF feeds were ignored; added RDF normalization and regression coverage, then re-reviewed with no significant remaining findings.
- Task 3 ruling: preserve the existing feed result shape while supporting RSS 2.0, RSS 1.0/RDF, and Atom roots through bounded XML parsing.
- Task 4: complete with commit `636ca412`.
- Task 4 review: no significant findings; defaults, bounds, worker wiring, and queue semantics were accepted.
- Task 5: complete with commits `644d1f21`, `0530a8d550ff44256ec5727a34f40813513cacd3`, and `633aaa1c901be0a3fd642ae41321cb297c60fefa`.
- Task 5 review: initial review found missing handler timeout and weak timing assertions; a second review found timeout cancellation could violate concurrency; cooperative cancellation and stronger regression coverage were added, then final review found no significant remaining issues.
- Task 5 ruling: benchmark handlers must accept and honor `AbortSignal`; timeout slots are not released until handlers settle.
- Task 6: complete with commits `b446c0a07cf55988065ea3c2bf47ff1f23e2cc3a`, `7cabf6050f8fb229c49ab41ba3acc749b25faf90`, `07315ad5484deddd8754c3fdc48b8a7ea1bb059f`, and `4991c973`.
- Task 6 review: lifecycle review found stale generations, reinitialization timers, persistence barriers, and finally overlapping scheduled polls; each was fixed with regression coverage. The final overlap fix was locally verified with focused tests, lint, build, and diff checks; no reviewer agent was available for the final pass after quota exhaustion.
- Task 6 ruling: each provider has one active poll batch per generation, and scheduled ticks are coalesced rather than allowed to accumulate pending limiter work.
- Task 7: complete with commit `ece36ae3`.
- Task 7 review: no separate reviewer was available after the subagent quota was exhausted; local focused tests, build, lint, typecheck baseline, audit, and diff checks were run. The implementation uses Bottleneck clustering through the existing ioredis factory when explicitly enabled and falls back to local bounded limiters.
- Task 7 ruling: provider quotas are opt-in Redis-coordinated, use bounded high-water queues, isolate provider keys, and preserve existing client circuit breakers and safe-fetch behavior.
- Task 8: complete with commit `ea7fc5c8`.
- Task 8 review: local observability tests, build, lint, diff checks, and the known-failing repository typecheck were run; direct deprecated trace SDK packages were removed and NodeSDK lifecycle/propgation tests passed.
- Task 8 ruling: use `@opentelemetry/sdk-node` as the lifecycle owner, keep endpoint export optional, and preserve the existing public tracing helper API.
- Task 9: complete with BullMQ, PostgreSQL, and ioredis instrumentation wiring and commit pending.
- Task 9 review: focused queue/observability tests, build, lint, and diff checks passed; repository typecheck remains blocked by the established unrelated generated and test errors.
- Task 9 ruling: use shared BullMQ telemetry only when an OTLP endpoint is configured, keep Apollo's existing Prometheus queue metrics authoritative, and pin datastore instrumentation to the compatible OpenTelemetry package generation.
- Task 10: complete with bearer-token Bull Board authentication, owner authorization, and pino-http diagnostics; commit pending.
- Task 10 review: admin auth, webhook, and startup tests passed; lint, build, and diff checks passed.
- Task 10 ruling: use `ADMIN_AUTH_TOKENS` userId-to-token credentials, derive identity only from the bearer token, and keep `OWNER_IDS` as the authorization source of truth.
- Task 11: complete as a no-go decision; benchmarked the existing locale cache and did not add `lru-cache`.
- Task 11 ruling: retain `LocaleCache` because it satisfies the required bounded TTL/LRU/invalidation contract at approximately 2.2 million get/set operations per second in the representative benchmark.
- Task 12: complete as a no-go decision; benchmarked Node's built-in Undici-backed fetch against a controlled local fixture and did not add direct `undici` usage.
- Task 12 ruling: retain `safeFetch` as the transport boundary and avoid exposing dispatcher configuration without production evidence for pools, proxies, custom CA, or connection limits.
- Task 13: complete as a no-go decision; no measured CPU or event-loop hotspot justified adding `0x`.
- Task 14: complete as a no-go decision; the controlled HTTP fixture benchmark was sufficient and did not justify adding `autocannon`.
