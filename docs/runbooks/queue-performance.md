# Queue Performance Baseline

Apollo exposes bounded Prometheus signals for queue and worker performance:

- `apollo_queue_wait_seconds{queue,job}` measures enqueue-to-worker-start time.
- `apollo_queue_job_duration_seconds{queue,job}` measures handler processing time.
- `apollo_queue_active_jobs{queue}` reports jobs currently executing.
- `apollo_queue_job_outcomes_total{queue,job,outcome}` counts `success`, `retry`, and `failure`.
- `apollo_redis_operation_duration_seconds{operation}` records bounded Redis operation latency.
- `apollo_event_loop_delay_seconds` records event-loop delay when a worker starts and stops.
- `apollo_worker_memory_bytes{plugin}` reports worker RSS with the bounded `worker` or `plugin` label.

Queue and job labels are normalized to fixed allowlists. They never contain job IDs, guild IDs, user IDs, URLs, or command arguments. Queue wait includes Redis/BullMQ scheduling delay; job duration begins when the worker invokes the handler. Compare the two signals to distinguish backlog from slow processing. Worker concurrency and limiter settings are bounded by `WORKER_CONCURRENCY`, `WORKER_LIMITER_MAX`, and `WORKER_LIMITER_DURATION_MS`, with defaults of `4`, `50`, and `1000`.

## Local throughput benchmark

Run the credential-free harness with fixed concurrency values before comparing worker changes:

```bash
pnpm exec tsx benchmarks/queue-worker-benchmark.ts --concurrency 1,4,8
```

The JSON output reports queue wait, processing duration, throughput, failure rate, peak active jobs, and per-workload totals for command, NSFW, scheduled, and webhook jobs. The harness uses in-memory deterministic handlers; it does not connect to Redis, Discord, a database, or production queues.

Do not increase concurrency based on throughput alone. Compare the result with Redis latency, database pool pressure, Discord rate-limit responses, event-loop delay, and worker memory. A throughput increase that raises queue wait, database saturation, rate limits, event-loop delay, or memory pressure is not an improvement. Keep the concurrency that meets latency and failure-rate targets without exhausting those dependencies.
