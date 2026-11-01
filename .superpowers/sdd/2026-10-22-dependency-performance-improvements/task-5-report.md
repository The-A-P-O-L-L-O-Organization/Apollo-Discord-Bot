# Task 5 Report: Queue Throughput Benchmark

## Status

Implemented a bounded, credential-free queue throughput benchmark using in-memory workers and injectable handlers. The harness supports fixed concurrency values and reports queue wait, processing duration, throughput, failure rate, peak active jobs, and per-workload totals for command, NSFW, scheduled, and webhook workloads.

The benchmark records queue lifecycle events through the Task 2 metrics helpers and adds a shared queue benchmark failure-rate summary. Queue and job metric labels now include webhook workloads without accepting request identifiers.

## Usage

```bash
pnpm exec tsx benchmarks/queue-worker-benchmark.ts --concurrency 1,4,8
```

No Redis, Discord credentials, database, or production queues are loaded or modified.

## Verification

- `pnpm vitest run tests/core/queue/worker-throughput.test.ts`: **PASS** — 1 test.
- `pnpm vitest run tests/core/queue/worker-throughput.test.ts tests/core/queue/worker-metrics.test.ts tests/utils/performanceMetrics.test.ts tests/core/queue/metrics.test.ts tests/utils/metrics.test.ts`: **PASS** — 5 files, 32 tests.
- `pnpm exec tsx benchmarks/queue-worker-benchmark.ts --concurrency 1,4,8`: **PASS** — deterministic JSON reports generated for all three concurrency values.
- `pnpm build`: **PASS**.
- `pnpm lint`: **PASS with existing repository warnings**.
- `pnpm typecheck`: **BLOCKED by pre-existing repository-wide test/type errors**; no new benchmark source errors were reported.
- `git diff --check`: **PASS**.

## Documentation

Updated `docs/runbooks/queue-performance.md` with benchmark usage and guidance to compare concurrency against Redis latency, database pool pressure, rate-limit responses, event-loop delay, and worker memory. It explicitly cautions against increasing concurrency based on throughput alone.

## Concerns

- Throughput and timing values are machine-dependent; fixed workload counts and concurrency make before/after runs comparable, but do not make wall-clock measurements identical.
- Existing `src/utils/metrics.ts` lint warnings (file size, shadowing, and existing type assertions) remain outside this bounded task.
