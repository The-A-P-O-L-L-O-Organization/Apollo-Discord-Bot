# Apollo Discord Bot v3 — Threat Model

> **Maintenance:** Update when adding new plugins, external integrations, or trust boundaries. Review quarterly.
> **Methodology:** Lightweight STRIDE per trust boundary. Based on SECURITY.md and architecture decisions.
> **Out of Scope:** Nation-state APT, physical host access, side-channel attacks, Discord infrastructure compromise.

## System Context (Data Flow Diagram)

```mermaid
flowchart LR
    subgraph Operator["Operator / CI"]
        O1[Deploy / Secrets]
        O2[Admin CLI]
    end

    subgraph Discord["Discord Platform"]
        D1[Discord API]
        D2[Gateway / Events]
        D3[Interactions / Webhooks]
    end

    subgraph Apollo["Apollo Bot Cluster"]
        subgraph Gateway["Gateway Pod (Leader)"]
            G1[Discord Client]
            G2[Plugin Manager]
            G3[Command Router]
            G4[Scheduler (withLock)]
        end

        subgraph Workers["Worker Pods"]
            W1[Queue Processor]
            W2[Plugin Sandbox]
        end

        subgraph Infra["Shared Infrastructure"]
            R1[(Redis\nQueues / Locks / EventBus)]
            R2[(PostgreSQL /\nSQLite)]
            R3[Socket /tmp/apollo.sock]
        end
    end

    subgraph External["External Services"]
        E1[Interlink Relay\n(Go, per-group secrets)]
        E2[NSFW Service\n(Rust, local)]
        E3[OpenAI API]
        E4[GitHub / Twitch / YouTube APIs]
        E5[Webhook Sources\n(GitHub, etc.)]
    end

    O1 -->|Secrets / Config| G1
    O2 -->|Socket RPC| R3
    D1 -->|REST| G1
    D2 -->|WebSocket| G1
    D3 -->|HTTP| G1
    G1 -->|Commands/Events| G3
    G3 -->|Queue Jobs| R1
    G3 -->|DB Read/Write| R2
    G4 -.->|Locks| R1
    R1 -->|Job Payloads| W1
    W1 -->|Execute| W2
    W2 -->|RPC| R3
    W1 -->|Results| R1
    G1 -->|Events| E1
    E1 -->|Protobuf| Peers[Other Apollo Instances]
    G3 -->|NSFW Check| E2
    G3 -->|AI| E3
    G3 -->|Integrations| E4
    E5 -->|Webhook| G1
```

## Trust Boundaries

| ID | Boundary | Description |
|----|----------|-------------|
| TB-01 | Discord API ↔ Gateway | Discord REST/WebSocket ingress, token handling, payload validation |
| TB-02 | Gateway/Leader ↔ Redis | Queue jobs, leader locks, EventBus, fencing tokens |
| TB-03 | Gateway ↔ Worker | BullMQ job payloads, HMAC verification, interaction revalidation |
| TB-04 | Plugin Sandbox | Third-party plugin isolation, manifest verification, capabilities |
| TB-05 | Interlink Relay ↔ Peers | Protobuf messages, per-group shared secrets, at-most-once delivery |
| TB-06 | Webhook Ingress | GitHub HMAC, raw body preservation, signature verification |
| TB-07 | External SaaS APIs | OpenAI, Twitch, YouTube, GitHub — auth, rate limits, data handling |
| TB-08 | Operator/CI ↔ Secrets | ENCRYPTION_KEY, startup validation, filesystem/DB access |

---

## TB-01: Discord API ↔ Gateway

**Boundary:** Discord REST/WebSocket → Apollo Gateway Pod
**Assets:** Discord bot token, user PII in interactions, command payloads, guild data
**Entry Points:** Discord WebSocket gateway, REST API callbacks, interaction endpoints

### STRIDE Analysis

| Threat | STRIDE | Likelihood | Impact | Existing Mitigation | Residual Risk |
|--------|--------|------------|--------|---------------------|---------------|
| Token theft from memory/logs | Information Disclosure | Medium | Critical | Token never logged (SECURITY.md §11); structured logging excludes secrets; ENCRYPTION_KEY for stored tokens | Low |
| Malicious interaction payload | Spoofing / Tampering | High | High | Discord signature verification (Ed25519) in discord.js v14; all interactions validated before processing (SECURITY.md §5) | Low |
| Replay attack on interactions | Spoofing | Medium | Medium | Discord includes timestamp + nonce; discord.js validates; idempotency keys for mutations (SECURITY.md §13) | Low |
| Gateway hijack via malicious payload | Elevation of Privilege | Low | Critical | Input validation at command router; parameterized DB; no eval/exec (SECURITY.md §6,9) | Low |
| DoS via flood of interactions | Denial of Service | Medium | High | Discord rate limits at API level; spam tracker per-guild (automod plugin); queue backpressure (BullMQ) | Medium |
| PII leakage in logs/transcripts | Information Disclosure | Medium | High | Structured pino logs exclude message content (SECURITY.md §11); transcript sanitization; LOG_SAMPLE_RATE | Low |
| Malicious webhook from Discord | Spoofing | Low | Medium | Discord signs webhooks; verification in integrations plugin (SECURITY.md §7) | Low |
| Command injection via options | Injection | Medium | High | Zod/discord.js validation; no shell exec with user input (SECURITY.md §6,9) | Low |

### Key Controls Summary
- **Authentication**: Discord Ed25519 signature verification (discord.js v14 built-in)
- **Authorization**: Plugin permission checks + Discord hierarchy checks per command
- **Input Validation**: Zod schemas for all command options; discord.js option validation
- **Secrets**: `DISCORD_TOKEN` only in memory; never persisted; rotation via Discord developer portal
- **Observability**: `apollo_commands_total{status}`, `apollo_errors_total` for anomaly detection

---

## TB-02: Gateway/Leader ↔ Redis

**Boundary:** Gateway pod (leader) + Worker pods ↔ Redis (queues, locks, EventBus, fencing)
**Assets:** Queue job payloads, leader lock/fencing tokens, EventBus messages, scheduler state
**Entry Points:** Redis protocol (TCP), ioredis client, BullMQ, custom Lua scripts

### STRIDE Analysis

| Threat | STRIDE | Likelihood | Impact | Existing Mitigation | Residual Risk |
|--------|--------|------------|--------|---------------------|---------------|
| Queue job payload tampering | Tampering | Medium | High | HMAC-SHA256 on all queue payloads (QUEUE_HMAC_SECRET); worker revalidates (SECURITY.md §10,14) | Low |
| Leader lock theft/race | Spoofing / Tampering | Medium | Critical | Redis SET NX PX + Lua release script; fencing tokens with monotonic counter; TTL heartbeat (src/gateway/leader.ts) | Low |
| Fencing token replay | Spoofing | Low | High | Monotonic counter stored in Redis; worker checks token > last seen (src/gateway/leader.ts) | Low |
| EventBus message injection | Spoofing / Tampering | Medium | Medium | EventBus internal only; no external producers; plugin.action naming convention | Low |
| Redis connection hijack | Information Disclosure | Low | High | TLS for managed Redis; password auth; network policies (SECURITY.md §10) | Low |
| Queue backlog DoS | Denial of Service | Medium | High | BullMQ removeOnComplete/removeOnFail limits; max job size; worker concurrency limits | Medium |
| Scheduler duplicate execution | Tampering | Medium | Medium | `withLock` coordination via Redis; only one pod holds lock (src/core/lock.ts) | Low |
| Data exfiltration via keys | Information Disclosure | Low | High | Keys prefixed `apollo:`; no PII in queue payloads (serialized interactions only) | Low |

### Key Controls Summary
- **Authentication**: Redis password + TLS (production); localhost only (dev)
- **Integrity**: HMAC on all queue payloads (`QUEUE_HMAC_SECRET`); Lua atomic lock release
- **Authorization**: Fencing tokens for leader actions; worker capability checks
- **Availability**: TTL-based locks with heartbeat; automatic failover; queue TTL cleanup
- **Observability**: `apollo_redis_connections`, `apollo_queue_depth`, leader election metrics

---