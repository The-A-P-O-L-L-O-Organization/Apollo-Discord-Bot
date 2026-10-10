# 0005: Interlink At-Most-Once Protobuf Relay

> **Status:** Accepted
> **Date:** 2026-09-19
> **Deciders:** Apollo maintainers
> **Technical Story:** [Interlink Go Service Orchestrator](docs/superpowers/plans/INTERLINK_GO_SERVICE_ORCHESTRATOR_PROMPT.md)

## Context

Apollo instances in a trust group need to share events (ban sync, message relay, cross-guild moderation) without central coordinator. Requirements:
- Low-latency event propagation
- No single point of failure
- Per-trust-group isolation (secrets not shared across groups)
- Schema evolution safety

We evaluated:
1. **Discord API fan-out** — Rejected: rate limited; high latency; no guaranteed delivery
2. **Central relay service** — Rejected: SPOF; additional infrastructure
3. **Mesh of Go relays with per-group secrets** — Selected: decentralized; Go for concurrency; protobuf for schema safety

## Decision

We will implement **Interlink** as a **Go-based relay service** running alongside Apollo:

- **Protocol**: Protocol Buffers (protobuf) defined in `protos/interlink/`; generated TypeScript in `src/generated/`
- **Transport**: gRPC/TCP between relays; TLS with mutual authentication
- **Trust groups**: Each group has a **distinct shared secret**; anyone holding it can impersonate trusted bots (SECURITY.md §15)
- **Delivery semantics**: **At-most-once** — no built-in retry/ack; application must be idempotent or accept loss
- **Schema governance**: `buf` for lint (`pnpm proto:lint`) and breaking change detection (`pnpm proto:breaking`)
- **Generated code**: `src/generated/` — never hand-edited; regenerated via buf workflow
- **TypeScript ↔ Go coordination**: Protobuf is single source of truth; both sides regenerate on change

## Consequences

### Positive
- **Decentralized**: No central coordinator; relays form mesh per trust group
- **Schema safety**: Protobuf + buf prevents accidental breaking changes
- **Language-appropriate**: Go for high-concurrency relay; TypeScript for bot logic
- **Isolation**: Per-group secrets limit blast radius of compromise

### Negative
- **At-most-once**: Events can be lost; no delivery guarantees; application must handle
- **Operational complexity**: Two services (bot + relay) to deploy/monitor
- **Secret management**: Per-group secrets require secure distribution/rotation
- **Cross-language sync**: Protobuf changes require coordinated regeneration

### Neutral / Risks
- **No replay protection**: Documented limitation; sequence numbers could be added
- **Network partition behavior**: Relays buffer locally; may lose events on extended partition

## References

- Protobuf: `protos/interlink/`, `src/generated/`
- Go service: `services/interlink/` (separate Go module)
- Plans: Interlink Go Service Orchestrator (2026-09-19)
- Security: SECURITY.md §15 (interlink secrets)
- Related: ADR 0001 (gateway produces interlink events), ADR 0003 (queue may feed interlink)