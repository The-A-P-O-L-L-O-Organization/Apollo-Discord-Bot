# 0003: BullMQ + Redis with HMAC-Signed Jobs

> **Status:** Accepted
> **Date:** 2026-09-27
> **Deciders:** Apollo maintainers
> **Technical Story:** [Master Plan](docs/superpowers/plans/2026-09-27-master-plan.md), [SECURITY.md §10,14](SECURITY.md)

## Context

Command execution must be offloaded from the gateway to prevent gateway heartbeat misses. Requirements:
- Reliable job delivery with retries
- Payload integrity across trust boundary (gateway → Redis → worker)
- Horizontal worker scaling
- Observability (queue depth, job latency, failure rates)

We evaluated:
1. **Custom Redis lists + BRPOPLPUSH** — Rejected: reinventing BullMQ; no retry/backoff/DLQ built-in
2. **RabbitMQ** — Rejected: additional infrastructure; Redis already required for leader election/EventBus
3. **BullMQ on Redis** — Selected: mature, Redis-native, retries/backoff/DLQ, metrics, TypeScript support

**Critical security requirement**: Queue payloads cross trust boundary (gateway → worker). Workers must verify payloads weren't tampered with in Redis.

## Decision

We will use **BullMQ on Redis** with the following configuration:

- **Queue names**: `process-command`, `heavy-operation`, `scheduled-task`, `nsfw:analyze` (+ analytics, moderation, webhook, email, backup, cleanup)
- **Serialization**: `msgpackr` (fast, compact, no prototype pollution)
- **Job options**: `attempts=3`, exponential backoff (1s base), `removeOnComplete` age=3600s, `removeOnFail` age=86400s count=1000
- **HMAC signing**: Every job payload signed with `QUEUE_HMAC_SECRET` (SHA256); worker verifies before deserialization
- **Payload revalidation**: `serializeInteraction` flattens only safe Discord interaction fields; `remoteInteraction` reconstructs with validation
- **Shard-aware prefixes**: `SHARD_ID` env var prefixes queue names for multi-shard deployments

## Consequences

### Positive
- **Reliability**: Built-in retries, backoff, dead-letter handling
- **Security**: HMAC prevents payload tampering in Redis; worker revalidation is defense in depth
- **Observability**: `apollo_queue_depth`, `apollo_queue_jobs_total` metrics; BullMQ dashboard compatible
- **Scalability**: Workers stateless; add pods to increase throughput

### Negative
- **Redis dependency**: Queue unavailable if Redis down (mitigated: Redis HA; gateway can still serve cached/read-only)
- **Serialization overhead**: msgpackr adds CPU cost (minimal; <1ms typical)
- **HMAC secret rotation**: Requires coordinated deploy (gateway + workers); `QUEUE_HMAC_SECRET` rotation procedure needed

### Neutral / Risks
- **At-most-once delivery**: Jobs may execute twice on worker crash mid-job; commands must be idempotent
- **No priority queues**: All jobs equal priority; `heavy-operation` separate queue for isolation

## References

- Implementation: `src/queue/queue.ts`, `src/queue/jobs/processCommand.ts`, `src/queue/serializeInteraction.ts`, `src/queue/remoteInteraction.ts`
- Security: SECURITY.md §10 (queue payloads untrusted), §14 (HMAC verification)
- Plans: Master Plan (2026-09-27)
- Related: ADR 0001 (worker role), ADR 0004 (plugin sandbox consumes queue jobs)