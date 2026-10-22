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
