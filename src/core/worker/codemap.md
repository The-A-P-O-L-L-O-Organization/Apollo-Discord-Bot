# src/core/worker/codemap.md

## Responsibility
Isolates third-party plugins in forked child processes with capability-based security, crash supervision, and zod-validated RPC between host and child.

## Files

| File | Purpose |
|------|---------|
| `workerHost.ts` | Forks and supervises child processes with signed capabilities and crash backoff |
| `workerChild.ts` | Child entry verifying capabilities and routing lifecycle and command RPC |
| `rpc.ts` | Message helpers with correlation ids and oversize payload guard |
| `rpc-schemas.ts` | Zod RPC request and response schemas with factory validators |
| `pluginManifest.ts` | Parses and validates plugin manifest capabilities against known set |
| `capabilitySignature.ts` | HMAC signing and verification for granted capability sets |

## Design
- `workerHost.ts`: supervisor owning `WorkerInfo` (child, granted capabilities, manifest) and per-plugin circuit state (`crashes`, `lastCrashAt`, `state`, `nextAttemptAt`). Uses `node:child_process` `fork`, signs granted capabilities via `capabilitySignature.ts`, logs high-risk grants (`HIGH_RISK_CAPABILITIES`) through `securityLog.ts`. Restarts with backoff, disables after `MAX_CRASHES` (5), recovers after `HEALTHY_WINDOW_MS`.
- `workerChild.ts`: `runChild({ pluginDir, env, processLike, loader })` verifies signed capabilities against `PLUGIN_CAPABILITY_SECRET` or `QUEUE_HMAC_SECRET`, exposes capability-checked `host.call(capability, payload)`, routes lifecycle and command/event RPC to the plugin instance, supports `api:i18n` translation forwarding.
- `rpc-schemas.ts`: zod schemas `RPCRequestSchema`, `RPCResponseSchema`, `RPCMessageSchema` with `createRequest`, `createResponse`, `isRequest`, `isResponse`, `validateRequest`, `validateResponse`, `validateMessage`. `MAX_PAYLOAD_BYTES` is 1 MiB.
- `rpc.ts`: low-level message helpers including `isOversize` payload guard.
- `pluginManifest.ts`: parses and validates `plugin.json` capabilities against the known set.
- `capabilitySignature.ts`: HMAC sign and verify for granted capability sets.
- Patterns: Proxy (`host.call(capability, payload)` capability-checked RPC), Sandbox (forked child with signed capabilities and resource limits), Factory (`createRequest`/`createResponse` validators), Circuit Breaker (crash counting with backoff disable and healthy-window recovery).

## Flow
1. `PluginManager` calls `WorkerHost.startPlugin` with plugin id, directory, and manifest.
2. Host signs capabilities, forks `workerChild.ts` with `PLUGIN_CAPABILITIES`, `PLUGIN_CAPABILITY_SECRET`, and resource limits in env.
3. Child verifies signatures, dynamically imports the plugin class, awaits `lifecycle:load` then `lifecycle:enable`.
4. Runtime calls travel as zod-validated RPC requests with correlation ids over IPC; child returns RPC responses.
5. Child exit triggers crash accounting, backoff restart, or disable after threshold. `lifecycle:unload` precedes orderly shutdown.

## Integration
- Consumed by `src/core/PluginManager.ts` for installed third-party plugins only; built-in plugins run in-process.
- Depends on `node:child_process`, `zod`, `src/utils/logger.ts`, `src/utils/securityLog.ts`, `src/i18n/index.ts`.
- Capability names (`api:sendMessage`, `api:commandReply`, `events:messageCreate`, and others) are shared with the `PluginManager` capability index.
