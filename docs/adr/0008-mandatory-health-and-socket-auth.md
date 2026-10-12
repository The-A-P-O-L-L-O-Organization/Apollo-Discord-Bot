# 0008 - Mandatory Health Endpoint and Socket Authentication in Production

- Status: Accepted
- Date: 2026-10-11
- Supersedes: none

## Context

The health server exposes `/health`, `/ready`, `/metrics`, and `/metrics/json` on `HEALTH_PORT` (default 9090) bound to `0.0.0.0`. Authentication via Bearer `HEALTH_AUTH_TOKEN` existed as an opt-in runtime feature, but the token was never required, so default production deployments exposed queue depth, guild counts, and latency histograms to anyone with network reach. The admin Unix socket had the same gap: `APOLLO_SOCKET_TOKEN` enabled authentication but was optional, and the startup check for it was defined in `src/utils/startupChecks.ts` without ever being wired into the boot sequence. A self-generated technical debt report (TECHNICAL_DEBT_REPORT.md, 2026-09-27) flagged both as P0 security gaps.

## Decision

- Startup fails (fatal) in production when `HEALTH_AUTH_TOKEN` is unset, enforced by `assertHealthAuthToken()` in the gateway boot path.
- Startup fails (fatal) in production when `APOLLO_SOCKET_TOKEN` is unset, enforced by wiring the existing `validateSocketToken()` into the gateway boot path.
- When set, `HEALTH_AUTH_TOKEN` gates all four health server endpoints; behavior in non-production remains unauthenticated for developer convenience.
- Workers do not start the health server and are not subject to the health-token guard.

## Consequences

- Existing production deployments must set `HEALTH_AUTH_TOKEN` and `APOLLO_SOCKET_TOKEN` before upgrading; the bot refuses to start otherwise, which is intentional fail-closed behavior.
- Orchestrator health probes must send the Bearer token or run on a network segment where they authenticate with it configured.
- The socket check now executes consistently; previously it was dead code and production sockets could run unauthenticated despite the documented contract.
- Non-production environments retain zero-configuration ergonomics.

## Alternatives Considered

- Gate only `/metrics` and leave `/health` and `/ready` open for orchestrator probes. Rejected: readiness and health endpoints still reveal topology, and the added probe configuration is a one-time cost.
- Fail only at request time when unauthenticated. Rejected: fail-fast at startup gives operators a deterministic signal before the pod accepts traffic.
- Require the token in all environments. Rejected: local development relies on zero-configuration startup.
