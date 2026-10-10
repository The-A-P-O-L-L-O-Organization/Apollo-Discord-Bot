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

## TB-03: Gateway ↔ Worker

**Boundary:** Gateway pod → BullMQ/Redis → Worker pod (command execution)
**Assets:** Serialized Discord interactions, command execution results, user data
**Entry Points:** BullMQ job processing, msgpackr deserialization, remoteInteraction reconstruction

### STRIDE Analysis

| Threat | STRIDE | Likelihood | Impact | Existing Mitigation | Residual Risk |
|--------|--------|------------|--------|---------------------|---------------|
| Malicious job payload | Tampering / Spoofing | Medium | High | HMAC verification on enqueue; worker verifies before deserialization (SECURITY.md §10) | Low |
| Interaction reconstruction attack | Tampering | Medium | High | `serializeInteraction` flattens only safe fields; `remoteInteraction` reconstructs with validation; partial objects handled (src/queue/serializeInteraction.ts) | Low |
| Worker compromise → gateway | Elevation of Privilege | Low | Critical | Workers stateless; no direct gateway RPC; results via queue only; plugin sandbox isolates third-party | Low |
| Job replay | Spoofing | Medium | Medium | Job IDs unique; BullMQ deduplication; idempotency keys for mutating commands | Low |
| Resource exhaustion in worker | Denial of Service | Medium | High | Worker concurrency limits; Node `--max-old-space-size`; cgroup limits (phase5 plan) | Medium |
| msgpackr deserialization vuln | Remote Code Execution | Low | Critical | msgpackr safe mode; no prototype pollution; schema validation on reconstruct | Low |

### Key Controls Summary
- **Authentication**: HMAC on every job payload (shared `QUEUE_HMAC_SECRET`)
- **Integrity**: Serialization allows only known-safe interaction fields; reconstruction validates
- **Isolation**: Workers separate process; third-party plugins in child process with capabilities
- **Availability**: Job TTL, retry limits (3), exponential backoff, dead-letter after max retries

---

## TB-04: Plugin Sandbox

**Boundary:** Host process ↔ Third-party plugin worker child process
**Assets:** Host secrets (DISCORD_TOKEN, ENCRYPTION_KEY), filesystem, network, Discord client
**Entry Points:** Socket RPC (`/tmp/apollo.sock`), `pluginManifest.ts` capabilities, `workerChild.ts` message handlers

### STRIDE Analysis

| Threat | STRIDE | Likelihood | Impact | Existing Mitigation | Residual Risk |
|--------|--------|------------|--------|---------------------|---------------|
| Plugin escapes sandbox | Elevation of Privilege | Medium | Critical | Child process isolation; capability allowlist in manifest; no direct Discord client access (phase5, phase2) | Low |
| Malicious plugin steals secrets | Information Disclosure | Medium | Critical | Secrets NOT passed to worker child; host-side secret unset after spawn (audit finding 2 fix); only capabilities granted (phase5) | Low |
| Plugin installs unverified code | Tampering | Medium | High | `plugin-manifest.json` with pinned hashes; `pnpm manifest` verification; `ALLOW_UNVERIFIED_PLUGINS=1` dev-only (SECURITY.md §14) | Low |
| Sigstore bypass (supply chain) | Tampering | Low | Critical | `verifySignature: true` enforced in installPlugin; VITEST/test- keyid bypass REMOVED (audit finding 6 fix) | Low |
| Plugin DoS via resource exhaustion | Denial of Service | Medium | High | Worker `--max-old-space-size`; cgroup PID/memory limits; execArgv restrictions (phase5) | Medium |
| Plugin command injection | Injection | Medium | High | Command registration validated; SlashCommandBuilder only; no raw string execution | Low |
| Lifecycle hook bypass | Tampering | Low | Medium | RPC handshake required; `onLoad`/`onEnable`/`onDisable`/`onUnload` dispatched via socket with ready ack (audit finding 3) | Low |
| Manifest hash collision | Tampering | Very Low | High | SHA256 hashes; `pnpm manifest` regenerates; CI verifies manifest drift | Very Low |

### Key Controls Summary
- **Authentication**: Plugin manifest signature verification (Sigstore); hash pinning
- **Authorization**: Capability-based (manifest declares needed caps; host grants subset)
- **Isolation**: Separate Node process; restricted `execArgv`; cgroup limits; no host secrets
- **Integrity**: Sigstore verification mandatory; manifest hash verification on load
- **Supply Chain**: GHSA-87jf-gf75-wwfm (CVE-2025-26604) cited as justification for sandbox
- **Observability**: `apollo_plugin_load_duration`, plugin load success/failure metrics

---

## TB-05: Interlink Relay ↔ Peers

**Boundary:** Apollo Go interlink relay ↔ other trusted Apollo instances (per trust group)
**Assets:** Interlink messages (protobuf), per-group shared secrets, relay state
**Entry Points:** Interlink gRPC/TCP, protobuf deserialization, shared secret authentication

### STRIDE Analysis

| Threat | STRIDE | Likelihood | Impact | Existing Mitigation | Residual Risk |
|--------|--------|------------|--------|---------------------|---------------|
| Message tampering in transit | Tampering | Medium | High | Protobuf serialization; TLS between relays; per-group shared secret HMAC | Low |
| Replay attack | Spoofing | Medium | Medium | At-most-once delivery design; message IDs; no built-in replay protection (documented limitation) | Medium |
| Secret compromise → impersonation | Spoofing / Information Disclosure | Low | Critical | Per-trust-group secrets; rotation procedure; secrets distinct from bot tokens (SECURITY.md §15) | Low |
| Unauthorized peer joins group | Elevation of Privilege | Low | High | Shared secret required; operator controls group membership; no discovery protocol | Low |
| Protobuf parsing vulnerability | Remote Code Execution | Very Low | Critical | buf lint/breaking enforced; generated code only; no dynamic parsing | Very Low |
| DoS via message flood | Denial of Service | Medium | Medium | Rate limiting at relay; connection limits; small message size limits | Medium |
| Cross-group message leakage | Information Disclosure | Low | Medium | Per-group secrets; relay enforces group isolation; no cross-group routing | Low |

### Key Controls Summary
- **Authentication**: Per-trust-group shared secrets (distinct from Discord tokens)
- **Integrity**: TLS + HMAC on messages; protobuf schema validation via buf
- **Authorization**: Group membership controlled by operators; no anonymous peers
- **Delivery**: At-most-once (documented); application-level idempotency required
- **Observability**: Interlink-specific metrics in Prometheus; structured logging

---

## TB-06: Webhook Ingress

**Boundary:** External webhook sources (GitHub, etc.) → Apollo HTTP endpoint
**Assets:** Webhook payloads, HMAC secrets, repository/events data
**Entry Points:** HTTP POST endpoints in integrations plugin

### STRIDE Analysis

| Threat | STRIDE | Likelihood | Impact | Existing Mitigation | Residual Risk |
|--------|--------|------------|--------|---------------------|---------------|
| Forged webhook payload | Spoofing / Tampering | Medium | High | GitHub HMAC-SHA256 verification; raw body preserved for verification (SECURITY.md §7) | Low |
| Replay attack | Spoofing | Medium | Medium | GitHub includes delivery ID; idempotency handling in handler | Low |
| Secret leakage in logs | Information Disclosure | Low | High | Raw body preserved but not logged; HMAC secret never logged (SECURITY.md §11) | Low |
| DoS via webhook flood | Denial of Service | Medium | Medium | Rate limiting at reverse proxy; Discord API rate limits downstream | Medium |
| Payload parsing vulnerability | Remote Code Execution | Low | High | JSON parsing with size limits; no eval; structured validation | Low |

### Key Controls Summary
- **Authentication**: HMAC-SHA256 verification (GitHub standard); raw body required
- **Integrity**: Signature verification before parsing; idempotency keys
- **Availability**: Reverse proxy rate limiting; payload size limits

---