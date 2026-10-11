# Architecture Fitness Functions

Automated tests validating Apollo's architectural invariants on every CI build.
Run: `pnpm vitest run tests/architecture/`

## Fitness Functions

| Function | ADR/SLO Reference | Metric/Check |
|----------|-------------------|--------------|
| command_latency_p99 <= 5s | ADR-0007, slos.md | apollo_command_duration_seconds_bucket |
| command_success_ratio >= 99% | slos.md | apollo_commands_total{status} |
| gateway_availability >= 99.5% | ADR-0001, slos.md | apollo_gateway_connected |
| queue_job_reliability >= 99% | ADR-0003, slos.md | apollo_queue_jobs_total{outcome} |
| error_rate < 1% | ADR-0007, slos.md | apollo_errors_total / apollo_commands_total |
| Plugin sandbox: no unverified in prod | ADR-0004 | ALLOW_UNVERIFIED_PLUGINS guard, manifest verification, capability checks |
| Leader election: fencing monotonic | ADR-0001 | FencingTokenManager token sequence |
| Leader election: no split-brain | ADR-0001 | single lock holder, SET NX semantics |
| Leader election: failover < 30s | slos.md | lock TTL + heartbeat window |
| Circuit breaker: open/half-open/close | ADR-0003 | CircuitBreakerRegistry state machine |
| Circuit breaker state metric | ADR-0003 | test-local equivalent of apollo_circuit_breaker_state |
| Data isolation: guild/user separation | ADR-0002 | getGuildData/setGuildData/getUserData/setUserData scoping |
| Queue: HMAC verified on dequeue | threat-model.md | verifyJobData, timingSafeEqual, nonce replay guard |
| Queue: interaction revalidated | ADR-0003 | RemoteInteraction reconstruction + resolvedLocale |
| Queue: dead-letter after 3 attempts | ADR-0003 | BullMQ attempts:3, removeOnFail |
| Queue: depth alert threshold | slos.md | apollo_queue_depth > 100 |

## CI Integration

`pnpm test` runs all Vitest suites including `tests/architecture/`. No separate CI step needed.

## Files

- `helpers.ts` — isolated metric registries, SLI computation (`getMetrics`, `getSLIValue`, `assertSLI`)
- `slo-fitness.test.ts` — latency, success ratio, availability, queue reliability, error rate
- `plugin-sandbox-fitness.test.ts` — unverified-plugin guard, manifest verification, capabilities, boot-path imports
- `leader-election-fitness.test.ts` — fencing monotonicity, split-brain prevention, failover window
- `circuit-breaker-fitness.test.ts` — open threshold, half-open probe, state gauge
- `data-isolation-fitness.test.ts` — guild/user scoping, scoped atomic upserts
- `queue-reliability-fitness.test.ts` — HMAC, revalidation, retries, depth alerts
