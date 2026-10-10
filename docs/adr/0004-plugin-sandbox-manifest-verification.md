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