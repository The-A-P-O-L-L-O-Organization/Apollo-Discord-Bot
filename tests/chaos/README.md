# Chaos / Fault-Injection Tests

Fault-injection suite for Apollo Discord Bot v3. Each test simulates a
production failure mode and asserts the system degrades gracefully and
recovers without duplication, split-brain, or silent job loss.

## Running

These tests are gated behind an environment flag because they inject
failures deliberately and use timing-sensitive lock expiry:

```sh
CHAOS_TESTS=1 pnpm vitest run tests/chaos/
```

Without `CHAOS_TESTS=1` every suite reports skipped and the run passes.
No Docker, Redis, or network access is required. All Redis, queue, worker,
and HTTP dependencies are deterministic in-memory fakes, so the suite
stays fast and hermetic. The existing Redis-backed integration tests
under `tests/integration/` remain the place for real-container failover
coverage.

## What each test validates

| File | Failure injected | Key assertions |
|------|------------------|----------------|
| `leader-failover.test.ts` | Network partition kills the leader heartbeat mid-term; lock expires | Follower detects expiry and acquires the lock; fencing tokens increase monotonically; stale leader release is rejected; exactly one holder at all times |
| `redis-outage.test.ts` | Redis rejects every operation for a window | Leader election pauses instead of electing a phantom leader; queue jobs buffer in memory; schedulers report paused with zero executions; local EventBus delivery keeps working while cross-pod publish fails; recovery re-elects, drains the buffer with job-id dedup, and resumes single execution |
| `circuit-breaker.test.ts` | Protected endpoint fails 5 times in a row | Circuit opens at the configured threshold; further calls fail fast with `CircuitBreakerOpenError` without hitting the endpoint; state transitions are recorded on an `apollo_circuit_breaker_state` gauge; half-open probe succeeds and the breaker closes after the success threshold |
| `scheduler-duplication.test.ts` | Two gateway pods race the same `withLock` tick; one pod crashes mid-execution | Exactly one winner per contended tick across 4 rounds; crashed holder blocks the peer until lock TTL expiry; survivor picks the task up after expiry with no double execution |
| `external-service-failure.test.ts` | NSFW endpoint times out once then returns 503 | Job retries 3 times with exponential backoff delays `[20, 40]`; breaker opens after the threshold; post-open calls fail fast without extra HTTP hits; exhausted jobs land in the dead-letter set; a healthy service closes a fresh breaker |
| `worker-restart.test.ts` | Worker dies with SIGTERM mid-job; poison job always fails | Interrupted job keeps `attemptsMade` at 0 and is picked up by the restarted worker; the job-id dedup guard holds side effects to exactly 1; a permanently failing job runs exactly `QUEUE_ATTEMPTS` (3, mirroring `defaultJobOptions` in `src/queue/queue.ts`) before dead-lettering |

## Design notes

- Fakes implement only the Redis surface the production code touches
  (`SET` with `NX`/`XX`/`PX` in either argument order, `GET` with lazy
  expiry, `DEL`, `INCR`, `EVAL`/`EVALSHA` with `SCRIPT LOAD`, `QUIT`).
  The fencing fake emulates the Lua scripts in
  `src/gateway/fencing.ts`, including counter increment on failed
  acquisition, so the real `FencingTokenManager` is exercised.
- Production modules under test are imported directly:
  `src/gateway/leader.ts`, `src/gateway/fencing.ts`,
  `src/utils/lock.ts`, `src/utils/circuitBreaker.ts`, and
  `src/core/EventBus.ts`.
- `apollo_circuit_breaker_state` is asserted through a test-local
  Prometheus gauge wired to breaker `open`/`half_open`/`close` events.
  Wiring an equivalent gauge into `src/utils/metrics.ts` for production
  dashboards is a recommended follow-up.
- Retry delays, TTLs, and breaker timeouts use small constants so the
  full suite finishes in seconds. Timing margins are generous to avoid
  flakes on loaded CI runners.
