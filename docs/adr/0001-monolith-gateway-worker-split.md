# 0001: Monolith with Gateway/Worker Role Split

> **Status:** Accepted
> **Date:** 2026-09-27
> **Deciders:** Apollo maintainers
> **Technical Story:** [Master Plan](docs/superpowers/plans/2026-09-27-master-plan.md), [Phase 2 Security Architecture](docs/superpowers/plans/2026-09-27-phase2-critical-security-architecture.md)

## Context

Apollo v2 ran as a single process handling Discord gateway, command execution, scheduled tasks, and plugin management. As guild count grew, several problems emerged:

- **Single point of failure**: Process crash = total bot outage
- **Resource contention**: CPU-intensive tasks (NSFW analysis, AI) blocked gateway heartbeats
- **No horizontal scaling**: Cannot add capacity for queue processing without adding gateway connections
- **Deployment coupling**: Any change requires full restart

We evaluated:
1. **Pure microservices** — Rejected: premature for guild-scoped bot (100-1000 guilds); operational overhead unjustified
2. **Monolith with role modes** — Selected: single codebase, distinct runtime roles via `RUN_MODE`
3. **External queue workers only** — Rejected: still single gateway process

## Decision

We will run Apollo as a **single deployable artifact** with **two runtime roles** controlled by `RUN_MODE` environment variable:

- **`RUN_MODE=gateway` (default)**: Leader election via Redis → connects to Discord → loads plugins → runs schedulers under `withLock` coordination
- **`RUN_MODE=worker`**: Processes BullMQ jobs from Redis queues; no Discord connection; stateless

Leader election uses Redis global lock (`apollo:gateway:leader:global`) with TTL=10s, heartbeat refresh every TTL/3, and optional fencing tokens for replay protection. Only the leader runs schedulers and connects to Discord. Workers scale independently for queue throughput.

## Consequences

### Positive
- **Failure isolation**: Worker crash doesn't affect gateway; gateway failover ~3-5s (TTL/3 heartbeat)
- **Independent scaling**: Add workers for queue backlog; gateway stays single (Discord sharding handles >2500 guilds)
- **Operational simplicity**: Single binary, single Docker image, single deploy pipeline
- **Clear trust boundaries**: Gateway holds Discord token; workers only see HMAC-signed queue payloads

### Negative
- **Leader failover window**: Brief (~3.3s) unavailability during leader election; budgeted in SLO (99.5% availability)
- **Redis dependency**: Both roles require Redis; single point of failure for coordination (mitigated: Redis HA)
- **State synchronization**: Schedulers must use `withLock`; plugins must be idempotent across failover

### Neutral / Risks
- **Sharding not yet needed**: Current guild count fits single gateway; sharding entry exists in `src/shard.ts` for future
- **Plugin loading duplication**: Plugins load in both gateway and workers (first-party in-process, third-party in worker sandbox)

## References

- Implementation: `src/index.ts` (role switch), `src/gateway/leader.ts` (election), `src/worker.ts` (worker entry)
- Plans: Master Plan (2026-09-27), Phase 2 Security Architecture (2026-09-27)
- Related: ADR 0003 (BullMQ queue design), ADR 0004 (Plugin sandbox)