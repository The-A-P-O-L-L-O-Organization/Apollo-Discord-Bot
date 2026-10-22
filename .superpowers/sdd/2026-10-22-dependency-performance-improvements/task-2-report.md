# Task 2 Report: Bounded Queue and Runtime Performance Evidence

## Scope

Implemented reusable queue and worker performance evidence while preserving the Task 1 dependency changes. Queue wait, job processing duration, active jobs, outcomes, Redis latency, event-loop delay, and worker memory are exposed through Prometheus metrics.

## Implementation

- Added bounded metrics to `src/utils/metrics.ts` and `createMetrics`.
- Normalized queue, job, outcome, operation, and worker-memory labels to fixed allowlists.
- Added worker lifecycle instrumentation for start, completion, retry, failure, and shutdown.
- Added event-loop delay start/stop lifecycle helpers.
- Added Redis latency probes and queue health latency measurement.
- Added bounded worker settings:
  - `WORKER_CONCURRENCY`: default `4`, range `1..100`
  - `WORKER_LIMITER_MAX`: default `50`, range `1..10000`
  - `WORKER_LIMITER_DURATION_MS`: default `1000`, range `100..60000`
- Added enqueue instrumentation to gateway, command, and NSFW enqueue paths.
- Added `docs/runbooks/queue-performance.md`.
- Added focused metric and worker lifecycle tests.

## Metrics

- `apollo_queue_wait_seconds{queue,job}`
- `apollo_queue_job_duration_seconds{queue,job}`
- `apollo_queue_active_jobs{queue}`
- `apollo_queue_job_outcomes_total{queue,job,outcome}`
- `apollo_redis_operation_duration_seconds{operation}`
- `apollo_event_loop_delay_seconds`
- `apollo_worker_memory_bytes{plugin}`

Labels do not contain job IDs, guild IDs, user IDs, URLs, or command arguments.

## Verification

- `pnpm vitest run tests/core/queue/worker-metrics.test.ts tests/utils/performanceMetrics.test.ts tests/core/queue/metrics.test.ts tests/utils/metrics.test.ts`: **PASS** — 4 files, 30 tests.
- `pnpm build`: **PASS**.
- `pnpm lint`: **PASS with existing repository warnings**.
- `pnpm typecheck`: **BLOCKED by pre-existing repository-wide failures**. No errors were reported for the changed source files after fixing the `perf_hooks` type import. Existing failures remain in unrelated tests, including missing config helpers, Discord mock typing, generated NSFW types, and Redis test types.

## Concerns

- The existing `src/utils/metrics.ts` factory is already large; adding the parallel isolated-registry metrics increases its size and preserves existing factory behavior rather than undertaking an unrelated refactor.
- Worker lifecycle coverage is deterministic and registry-focused; a live Redis/BullMQ integration test remains outside this task’s bounded scope.
