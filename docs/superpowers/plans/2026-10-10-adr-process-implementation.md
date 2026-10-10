# ADR Process Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish lightweight ADR (Architecture Decision Record) process using MADR format, create 7 retroactive ADRs from existing superpowers plans, and set up documentation structure.

**Architecture:** Create `docs/adr/` directory with MADR template, 7 retroactive ADRs distilled from existing dated plans, README index, and contribution guide. No tooling initially — plain markdown maintained by hand per surveyed Discord bot patterns.

**Tech Stack:** Markdown, MADR format (Markdown Architectural Decision Records), existing plan files in `docs/superpowers/plans/` as source material.

**Spec:** Librarian research (proportional scaling: small frameworks use ADRs, large bots don't; MADR format common; no CI validation until >20 ADRs) + existing superpowers plans as decision history.

## Global Constraints

- pnpm only; Node 22+; TypeScript strict mode
- ADR directory: `docs/adr/`
- Format: MADR (Status, Context, Decision, Consequences)
- Naming: `NNNN-short-title.md` (4-digit sequence)
- No CI validation, no adr-tools initially — all surveyed bots use plain markdown
- 7 retroactive ADRs from existing plans
- README.md index in `docs/adr/`
- Contribution guide in `docs/adr/CONTRIBUTING.md`

## Review Focus

1. **Decision traceability** — Each ADR must map to specific plan file(s) and code locations; no vague decisions
2. **MADR compliance** — All 4 sections present: Status, Context, Decision, Consequences; no extra sections
3. **Proportional scope** — 7 ADRs covering load-bearing decisions only; not every plan becomes an ADR
4. **No tooling lock-in** — Plain markdown; easy to migrate if tooling added later
5. **Currency mechanism** — CONTRIBUTING.md must define when to write new ADR (new boundary, new tech, irreversible change)

---

### Task 1: Create ADR directory structure and MADR template

**Files:**
- Create: `docs/adr/0000-template.md`
- Create: `docs/adr/README.md`
- Create: `docs/adr/CONTRIBUTING.md`

**Interfaces:**
- Consumes: Librarian research on MADR format
- Produces: Template and index for all future ADRs

- [ ] **Step 1: Create ADR directory**

```bash
mkdir -p docs/adr
```

- [ ] **Step 2: Create MADR template (0000-template.md)**

```markdown
# NNNN: [Short Title]

> **Status:** [Proposed | Accepted | Superseded | Deprecated]
> **Date:** YYYY-MM-DD
> **Deciders:** [Names/roles]
> **Technical Story:** [Link to issue/PR/plan if applicable]

## Context

[What is the issue that we're seeing that is motivating this decision or change?
Describe the forces at play: technical, organizational, political, legal, etc.
These forces are probably in tension, and should be called out as such.
Use neutral language — this is a description of the situation, not a justification for a particular response.]

## Decision

[What is the change that we're proposing or have agreed to implement?
Use active voice: "We will..." or "We decided to..."]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Drawback 1]
- [Drawback 2]

### Neutral / Risks
- [Risk or unknown 1]
- [Risk or unknown 2]

## References

- [Link to plan, issue, PR, or external resource]
- [Related ADR numbers if applicable]
```

- [ ] **Step 3: Create README.md index**

```markdown
# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for Apollo Discord Bot v3.
We use the [MADR format](https://adr.github.io/madr/) (Markdown ADRs).

## Index

| # | Title | Status | Date | Supersedes |
|---|-------|--------|------|------------|
| 0001 | Monolith with Gateway/Worker Role Split | Accepted | 2026-09-27 | — |
| 0002 | Dual Database Adapters (SQLite/PostgreSQL) | Accepted | 2026-09-27 | — |
| 0003 | BullMQ + Redis with HMAC-Signed Jobs | Accepted | 2026-09-27 | — |
| 0004 | Plugin Sandbox with Manifest Verification | Accepted | 2026-09-27 | — |
| 0005 | Interlink At-Most-Once Protobuf Relay | Accepted | 2026-09-19 | — |
| 0006 | i18n Contract (Namespace=Plugin, en-US Canonical) | Accepted | 2026-09-22 | — |
| 0007 | Observability Stack (OTel+Prometheus+Pino) | Accepted | 2026-09-27 | — |

## Process

See [CONTRIBUTING.md](CONTRIBUTING.md) for when and how to create new ADRs.

## Tooling

Currently **no tooling** — ADRs are plain markdown files maintained by hand.
This matches practice in surveyed Discord bot projects (shardix, trophy-bot, caraka).
We will evaluate `adr-tools` or similar only if ADR count exceeds 20.
```

- [ ] **Step 4: Create CONTRIBUTING.md**

```markdown
# ADR Contribution Guide

## When to Write an ADR

Create an ADR when a decision meets **any** of these criteria:

1. **New trust boundary** — Adding a new external dependency, service, or integration point
2. **Irreversible technology choice** — Database, queue, RPC framework, language runtime
3. **Architectural pattern adoption** — CQRS, event sourcing, plugin architecture changes
4. **Security model change** — New threat boundary, capability system, encryption scheme
5. **Cross-team/cross-process impact** — Changes affecting gateway/worker contract, plugin API, interlink protocol

**Do NOT** create ADRs for:
- Bug fixes
- Refactoring within existing patterns
- Configuration changes
- Dependency version bumps (unless major version with breaking changes)

## How to Create an ADR

1. Copy `0000-template.md` to `NNNN-short-title.md` (next sequential number)
2. Fill in all four MADR sections: Status, Context, Decision, Consequences
3. Set Status to `Proposed` initially
4. Link related issues/PRs/plans in References
5. Update `README.md` index table
6. Submit PR for review
7. On merge, update Status to `Accepted` and Date to merge date

## ADR Lifecycle

| Status | Meaning |
|--------|---------|
| `Proposed` | Under discussion; not yet agreed |
| `Accepted` | Agreed and implemented (or will be) |
| `Superseded` | Replaced by newer ADR (link in References) |
| `Deprecated` | No longer relevant; not replaced |

## Superseding an ADR

1. Create new ADR with `Status: Proposed`
2. In new ADR References: `Supersedes: NNNN`
3. In old ADR: Update Status to `Superseded`, add `Superseded by: NNNN` in References
4. Update README index

## Style Notes

- Keep Context factual — describe forces, not opinions
- Decision uses active voice: "We will use X" not "X should be used"
- Consequences must include at least one negative/neutral entry (no perfect decisions)
- One ADR per decision; don't bundle unrelated choices
- Target <500 words per ADR
```

- [ ] **Step 5: Commit structure**

```bash
git add docs/adr/0000-template.md docs/adr/README.md docs/adr/CONTRIBUTING.md
git commit -m "docs(adr): add MADR template, index, and contribution guide"
```

---

### Task 2: Create ADR 0001 — Monolith with Gateway/Worker Role Split

**Files:**
- Create: `docs/adr/0001-monolith-gateway-worker-split.md`
- Modify: `docs/adr/README.md` (update index)

**Interfaces:**
- Consumes: `docs/superpowers/plans/2026-09-27-master-plan.md`, `docs/superpowers/plans/2026-09-27-phase2-critical-security-architecture.md`, `src/index.ts`, `src/gateway/leader.ts`, `src/worker.ts`
- Produces: ADR documenting role-based architecture decision

- [ ] **Step 1: Create ADR 0001**

```markdown
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
```

- [ ] **Step 2: Update README.md index (already done in template, verify)**

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0001-monolith-gateway-worker-split.md docs/adr/README.md
git commit -m "docs(adr): add ADR 0001 - Monolith with Gateway/Worker Role Split"
```

---

### Task 3: Create ADR 0002 — Dual Database Adapters (SQLite/PostgreSQL)

**Files:**
- Create: `docs/adr/0002-dual-database-adapters.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `src/utils/db.ts`, `src/db/migrations/`, `knexfile.cjs`, master plan
- Produces: ADR documenting dual DB strategy

- [ ] **Step 1: Create ADR 0002**

```markdown
# 0002: Dual Database Adapters (SQLite/PostgreSQL)

> **Status:** Accepted
> **Date:** 2026-09-27
> **Deciders:** Apollo maintainers
> **Technical Story:** [Master Plan](docs/superpowers/plans/2026-09-27-master-plan.md)

## Context

Apollo needs to support two deployment modes:
- **Single-instance / development**: Zero-config, file-based, no external dependencies
- **Multi-instance / production**: Concurrent writers, HA, shared state across pods

SQLite excels at the first; PostgreSQL at the second. Supporting both without code duplication requires an abstraction layer.

We evaluated:
1. **Single DB (PostgreSQL only)** — Rejected: raises barrier for development/single-instance; SQLite is sufficient for <100 guilds
2. **Single DB (SQLite only)** — Rejected: cannot support concurrent writers in multi-pod production
3. **Adapter pattern with Knex** — Selected: Knex supports both; adapter centralizes JSON serialization, atomic updates

## Decision

We will use **Knex.js** with a **database adapter** (`src/utils/db.ts`) that provides a unified interface:

- **Adapter methods**: `getGuildData`, `setGuildData`, `getUserData`, `setUserData`, `updateGuildData`, `appendToGuildArray`, etc.
- **JSON serialization**: Centralized in adapter; guild/user data stored as JSON blobs
- **Atomic updates**: Read-modify-write via transactions or conditional updates
- **Selection**: `config.database.type` / `DB_TYPE` env var (`sqlite` | `postgres`)

**SQLite config** (dev/single): WAL mode, `busy_timeout=5000`, connection pool max=1
**PostgreSQL config** (prod/multi): Pool capped at 80% of `max_connections` (startup validation), TLS required

Migrations in `src/db/migrations/*.cjs` must be **reversible and tested on both dialects**.

## Consequences

### Positive
- **Zero-config dev**: `pnpm dev` works immediately with SQLite file
- **Production ready**: Same code runs on PostgreSQL with `DB_TYPE=postgres`
- **Single migration source**: Migrations apply to both dialects
- **Test isolation**: Tests use temp SQLite databases via `tests/setup.ts`

### Negative
- **JSON blob limitations**: Guild/user data not queryable via SQL; no indexes on nested fields
- **Dialect differences**: SQLite `jsonb` vs PostgreSQL `jsonb`; migration testing required on both
- **No dev/prod parity**: SQLite and PostgreSQL have different concurrency/locking behavior

### Neutral / Risks
- **Schema evolution**: Adding queryable fields requires migration + adapter update
- **PostgreSQL upgrade**: Major version upgrades require dump/restore (Postgres 18 data path change)

## References

- Implementation: `src/utils/db.ts` (adapter), `knexfile.cjs` (config), `src/db/migrations/` (migrations)
- Tests: `tests/setup.ts` (temp DB), `tests/utils/db.test.ts`
- Plan: Master Plan (2026-09-27)
- Related: ADR 0001 (role split requires shared DB)
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0002-dual-database-adapters.md docs/adr/README.md
git commit -m "docs(adr): add ADR 0002 - Dual Database Adapters (SQLite/PostgreSQL)"
```

---

### Task 4: Create ADR 0003 — BullMQ + Redis with HMAC-Signed Jobs

**Files:**
- Create: `docs/adr/0003-bullmq-redis-hmac-jobs.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `src/queue/queue.ts`, `src/queue/jobs/processCommand.ts`, `src/queue/serializeInteraction.ts`, `src/queue/remoteInteraction.ts`, SECURITY.md §10,14
- Produces: ADR documenting queue architecture

- [ ] **Step 1: Create ADR 0003**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0003-bullmq-redis-hmac-jobs.md docs/adr/README.md
git commit -m "docs(adr): add ADR 0003 - BullMQ + Redis with HMAC-Signed Jobs"
```

---

### Task 5: Create ADR 0004 — Plugin Sandbox with Manifest Verification

**Files:**
- Create: `docs/adr/0004-plugin-sandbox-manifest-verification.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `src/core/Plugin.ts`, `src/core/worker/workerHost.ts`, `src/core/worker/workerChild.ts`, `src/core/pluginManifest.ts`, `plugin-manifest.json`, phase5-worker-sandbox-hardening.md, plugin-security-audit-fixes.md, GHSA-87jf-gf75-wwfm
- Produces: ADR documenting plugin security architecture

- [ ] **Step 1: Create ADR 0004**

```markdown
# 0004: Plugin Sandbox with Manifest Verification

> **Status:** Accepted
> **Date:** 2026-09-27
> **Deciders:** Apollo maintainers
> **Technical Story:** [Phase 5 Worker Sandbox Hardening](docs/superpowers/plans/2026-09-27-phase5-worker-sandbox-hardening.md), [Plugin Security Audit Fixes](docs/superpowers/plans/2026-10-08-plugin-security-audit-fixes.md)

## Context

Apollo supports third-party plugins. The GHSA-87jf-gf75-wwfm (CVE-2025-26604) incident in the Discord bot ecosystem demonstrated that **unvetted plugin code with full host access is a critical supply chain risk**. A compromised plugin can steal `DISCORD_TOKEN`, `ENCRYPTION_KEY`, access filesystem, and make network calls.

First-party plugins (admin, automod, integrations, interlink, moderation, tickets, utility) are trusted and load in-process. Third-party plugins must be isolated.

We evaluated:
1. **WASM sandbox** — Rejected: immature tooling; limited Node API access; performance unknown
2. **vm2 / isolated-vm** — Rejected: escape vulnerabilities; not actively maintained
3. **Separate Node process with capability allowlist** — Selected: strong isolation; standard Node; capability model; cgroup limits

## Decision

**Third-party plugins run in a separate Node child process** (`workerChild.ts`) with:

- **Communication**: Unix socket (`/tmp/apollo.sock` or `APOLLO_SOCKET_PATH`) via JSON-RPC
- **Capability allowlist**: `pluginManifest.ts` declares required capabilities; host grants subset
- **No host secrets**: `DISCORD_TOKEN`, `ENCRYPTION_KEY`, `QUEUE_HMAC_SECRET` NOT passed to child (audit finding 2 fix)
- **Resource limits**: `--max-old-space-size`, cgroup PID/memory limits via `execArgv` (phase5)
- **Manifest verification**: `plugin-manifest.json` with SHA256 hashes; `pnpm manifest` regenerates; CI verifies
- **Sigstore verification**: `verifySignature: true` enforced on install; VITEST/test- keyid bypass REMOVED (audit finding 6 fix)
- **Lifecycle via RPC**: `onLoad`/`onEnable`/`onDisable`/`onUnload` dispatched over socket with ready handshake (audit finding 3)
- **Uninstall safety**: Worker terminated before plugin removed from map (audit finding 5)

**First-party plugins** load in-process (no sandbox) — trusted code, full API access.

## Consequences

### Positive
- **Supply chain resilience**: GHSA-87jf-gf75-wwfm class attacks contained to sandbox
- **Clear trust boundary**: Host secrets never leave host process
- **Resource control**: Runaway plugin cannot OOM host
- **Capability model**: Least privilege; plugins declare needs; host approves

### Negative
- **RPC latency**: Cross-process calls add ~1-2ms per command
- **Complexity**: Two plugin loading paths (in-process vs sandboxed)
- **Debugging harder**: Child process logs separate; socket protocol adds failure modes

### Neutral / Risks
- **Capability granularity**: Current capabilities coarse; may need refinement
- **Socket security**: Unix socket permissions; `APOLLO_SOCKET_TOKEN` for auth
- **Manifest drift**: `plugin-manifest.json` must stay in sync; CI fails on drift

## References

- Implementation: `src/core/Plugin.ts`, `src/core/worker/workerHost.ts`, `src/core/worker/workerChild.ts`, `src/core/pluginManifest.ts`
- Security audit: `docs/superpowers/plans/2026-10-08-plugin-security-audit-fixes.md` (6 findings fixed)
- GHSA-87jf-gf75-wwfm (CVE-2025-26604) — Discord bot plugin supply chain compromise
- Plans: Phase 5 (2026-09-27), Security Audit Fixes (2026-10-08)
- Related: ADR 0001 (worker role runs sandbox), ADR 0003 (queue feeds sandbox)
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0004-plugin-sandbox-manifest-verification.md docs/adr/README.md
git commit -m "docs(adr): add ADR 0004 - Plugin Sandbox with Manifest Verification"
```

---

### Task 6: Create ADR 0005 — Interlink At-Most-Once Protobuf Relay

**Files:**
- Create: `docs/adr/0005-interlink-at-most-once-protobuf-relay.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `protos/interlink/`, `services/interlink/`, interlink-go-service plan, SECURITY.md §15
- Produces: ADR documenting interlink architecture

- [ ] **Step 1: Create ADR 0005**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0005-interlink-at-most-once-protobuf-relay.md docs/adr/README.md
git commit -m "docs(adr): add ADR 0005 - Interlink At-Most-Once Protobuf Relay"
```

---

### Task 7: Create ADR 0006 — i18n Contract

**Files:**
- Create: `docs/adr/0006-i18n-contract.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `src/i18n/`, `docs/i18n.md`, i18n-l10n-implementation-plan.md
- Produces: ADR documenting i18n architecture

- [ ] **Step 1: Create ADR 0006**

```markdown
# 0006: i18n Contract (Namespace=Plugin, en-US Canonical)

> **Status:** Accepted
> **Date:** 2026-09-22
> **Deciders:** Apollo maintainers
> **Technical Story:** [i18n/l10n Implementation Plan](docs/superpowers/plans/2026-09-22-i18n-l10n-implementation-plan.md)

## Context

Apollo supports 6 locales with `en-US` as canonical. Requirements:
- Plugin-localized strings (no global namespace collisions)
- Canonical locale completeness enforcement
- Placeholder/pluralization preservation across locales
- Concurrent request locale isolation (no leakage)

We evaluated:
1. **Custom i18n** — Rejected: reinventing ICU/pluralization; maintenance burden
2. **i18next** — Selected: mature, ICU support, namespace support, TypeScript types, plugin ecosystem

## Decision

We will use **i18next** with the following contract:

- **Namespace = Plugin ID**: `t('moderation:ban.success')` — prevents collisions
- **Canonical locale**: `en-US` must be complete; CI fails if keys missing (`pnpm lint:locales`)
- **Placeholders**: `{{variable}}` preserved exactly across locales; no translation-time interpolation
- **Pluralization**: ICU format preserved; suffixes (`_zero`, `_one`, `_other`) maintained
- **Fixed translators**: `i18n.getFixedT(locale)` for concurrent operations; no global locale mutation
- **German**: Informal `du` (not formal `Sie`) per community preference
- **Locale files**: `src/i18n/<locale>/<plugin>.json` (per-plugin, per-locale)

## Consequences

### Positive
- **Scalable**: Adding plugin = adding locale files; no core changes
- **Validator**: `pnpm lint:locales` catches missing keys, placeholder drift, pluralization issues
- **Concurrency safe**: Fixed translators prevent locale leakage in async handlers
- **Standards-based**: ICU pluralization; industry-standard tooling

### Negative
- **Bundle size**: i18next + locales adds ~50KB (acceptable)
- **Translation workflow**: Manual JSON editing; no integrated translation management

### Neutral / Risks
- **Key drift**: New keys added to `en-US` must propagate to 5 other locales; CI enforces
- **Pluralization complexity**: Some languages have 6+ forms; ICU handles but translators must know

## References

- Implementation: `src/i18n/`, `src/utils/i18n.ts` (fixedT helper)
- Config: `docs/i18n.md` (translator guidance)
- Plans: i18n/l10n Implementation Plan (2026-09-22)
- CI: `pnpm lint:locales` script
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0006-i18n-contract.md docs/adr/README.md
git commit -m "docs(adr): add ADR 0006 - i18n Contract (Namespace=Plugin, en-US Canonical)"
```

---

### Task 8: Create ADR 0007 — Observability Stack

**Files:**
- Create: `docs/adr/0007-observability-stack.md`
- Modify: `docs/adr/README.md`

**Interfaces:**
- Consumes: `src/observability/otel.ts`, `src/utils/metrics.ts`, `src/utils/logger.ts`, `src/utils/healthServer.ts`, phase6-typescript-hygiene-observability.md
- Produces: ADR documenting observability decisions

- [ ] **Step 1: Create ADR 0007**

```markdown
# 0007: Observability Stack (OTel+Prometheus+Pino)

> **Status:** Accepted
> **Date:** 2026-09-27
> **Deciders:** Apollo maintainers
> **Technical Story:** [Phase 6 TypeScript Hygiene & Observability](docs/superpowers/plans/2026-09-27-phase6-typescript-hygiene-observability.md)

## Context

Apollo needs production-grade observability for a distributed system (gateway + workers + Redis + DB + external APIs). Requirements:
- Distributed tracing across process boundaries
- Metrics for SLI/SLO definition (latency, error rate, queue depth, business KPIs)
- Structured logging with correlation IDs
- Health/readiness endpoints for orchestration
- Low overhead in hot paths

We evaluated:
1. **Custom metrics/logging** — Rejected: no standardization; hard to integrate with Grafana/Prometheus ecosystem
2. **OpenTelemetry + Prometheus + Pino** — Selected: industry standard; vendor-neutral; rich ecosystem; TypeScript support

## Decision

**Three-pillar observability stack:**

1. **Tracing**: OpenTelemetry (`src/observability/otel.ts`)
   - `NodeTracerProvider` + OTLP HTTP exporter
   - W3C Trace Context propagation
   - HTTP instrumentation (auto)
   - Span helpers: `createSpan`/`endSpan` for manual instrumentation
   - Tracer namespaced: `interlink` tracer for cross-service traces

2. **Metrics**: Prometheus via `@prometheus-io/client` (`src/utils/metrics.ts`)
   - Default labels: `app=apollo-bot`, `pod=config.podId`
   - Node metrics collected with `apollo_` prefix
   - Custom metrics: commands (counter + histogram), queue, DB, plugins, workers, Redis, spam, HTTP, errors, gateway latency
   - **Critical**: `guild` label on `commandsTotal` removed (cardinality) per ADR 0001 SLO work

3. **Logging**: Pino (`src/utils/logger.ts`)
   - Structured JSON with service context (pid, hostname, traceId from OTel)
   - Child loggers for plugin/command/guild context
   - Sampling via `LOG_SAMPLE_RATE` (default 1.0)
   - Never `console.*` in runtime code

**Health Server** (`src/utils/healthServer.ts`): HTTP on port 9090
- `/health` — full checks (Redis, DB, Discord gateway)
- `/ready` — lightweight (for k8s readiness probe)
- `/metrics` — Prometheus exposition format
- Optional Bearer auth via `HEALTH_AUTH_TOKEN`

## Consequences

### Positive
- **Vendor neutral**: OTel exports to any backend (Jaeger, Tempo, Datadog, etc.)
- **Ecosystem**: Grafana dashboards, Prometheus alerting, standard tooling
- **Correlation**: Trace IDs link logs, metrics, traces across gateway/worker/interlink
- **Low overhead**: Sampling, async export, minimal allocations in hot path

### Negative
- **Complexity**: Three systems to configure/operate
- **Cardinality risk**: Metrics labels must be controlled (guild label removed from commandsTotal)
- **OTel maturity**: Node SDK stable but some instrumentations experimental

### Neutral / Risks
- **SLO layer missing**: Metrics exist but no recording rules/alerts/SLOs yet (separate initiative)
- **Log volume**: `LOG_SAMPLE_RATE` tuning needed for high-traffic guilds

## References

- Implementation: `src/observability/otel.ts`, `src/utils/metrics.ts`, `src/utils/logger.ts`, `src/utils/healthServer.ts`
- Plans: Phase 6 (2026-09-27)
- SLO work: ADR 0001 (gateway availability), separate SLO implementation plan
- Related: ADR 0001 (gateway metrics), ADR 0003 (queue metrics)
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/0007-observability-stack.md docs/adr/README.md
git commit -m "docs(adr): add ADR 0007 - Observability Stack (OTel+Prometheus+Pino)"
```

---

### Task 9: Update AGENTS.md with ADR process reference

**Files:**
- Modify: `AGENTS.md` (add ADR reference in Documentation section)

**Interfaces:**
- Consumes: Completed ADR structure
- Produces: Agent contract awareness of ADR process

- [ ] **Step 1: Add ADR reference to AGENTS.md**

```markdown
# In AGENTS.md, Section 17 "Documentation and Codemap Duties" - add bullet:
- Update `docs/adr/` for architectural decisions: create ADR per CONTRIBUTING.md when adding trust boundaries, irreversible tech choices, architectural patterns, security model changes, or cross-process impacts. Use MADR format; update README index.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add ADR process reference to documentation duties"
```

---

### Task 10: Final verification

**Files:**
- Test: Verify all 7 ADRs exist, index accurate, template usable

**Interfaces:**
- Consumes: All previous tasks
- Produces: Verified ADR process ready for use

- [ ] **Step 1: Verify ADR count and format**

```bash
ls docs/adr/*.md | grep -E '^[0-9]{4}-' | wc -l
# Expected: 7 (0001-0007)
```

- [ ] **Step 2: Verify each ADR has MADR sections**

```bash
for f in docs/adr/000[1-7]-*.md; do
  echo "=== $f ==="
  grep -E '^## (Context|Decision|Consequences)' "$f"
done
```

- [ ] **Step 3: Verify README index matches files**

```bash
# Manual check: README.md table rows = 7 ADR files
```

- [ ] **Step 4: Run lint and typecheck**

```bash
pnpm lint && pnpm typecheck
```

- [ ] **Step 5: Commit any final changes**

```bash
git add -A
git commit -m "chore: final verification for ADR process implementation"
```