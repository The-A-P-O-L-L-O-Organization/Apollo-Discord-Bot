# src/queue/codemap.md

## Responsibility
Transports Discord command work from the gateway to BullMQ workers with signed, serializable payloads. Owns queue creation, interaction serialization, worker-side interaction reconstruction, routing, and queue metrics.

## Files

| File | Purpose |
|------|---------|
| `queue.ts` | BullMQ createQueue factory with msgpackr serializer and shard-aware prefix. |
| `serializeInteraction.ts` | Flattens discord.js interactions to minimal serializable payloads. |
| `remoteInteraction.ts` | Barrel re-export of the remote RemoteInteraction replica. |
| `gatewayRouter.ts` | queueOrRun decision between inline execution and enqueue. |
| `jobHandler.ts` | Job-name to worker-handler registry with duplicate protection. |
| `nonceStore.ts` | Redis-backed HMAC nonce store with atomic Lua check-and-set. |
| `nsfwClient.ts` | gRPC client for the Rust NSFW detection service. |
| `metrics.ts` | Queue depth, latency, and failure gauges for health and Prometheus. |

Subdirectories `jobs/` (worker job handlers) and `remote/` (RemoteInteraction replica pieces) have their own modules; `jobs/` is documented in `src/queue/jobs/codemap.md`.

## Design
- `queue.ts`: `createQueue(name)` factory with `Map` cache, msgpackr serializer, shard-aware prefix (`config.shard.queuePrefixBase` plus `shard-<id>` when `SHARD_ID` is set, else `config.queue.prefix`). `JobNames` covers `process-command`, `heavy-operation`, `scheduled-task`, `nsfw:analyze`. Default job options use 3 attempts with exponential backoff. Returns a noop queue when `config.queue.enabled` is false.
- `serializeInteraction.ts`: flattens a discord.js interaction to `SerializedInteraction` (id, token, commandName, commandId, guild, channel, user, member roles and permissions, options). Keeps the payload minimal and serializable.
- `remoteInteraction.ts`: barrel re-exporting `remote/index.ts` for the previous import path.
- `remote/interaction.ts`, `remote/options.ts`, `remote/guild.ts`, `remote/channel.ts`, `remote/discordApi.ts`, `remote/index.ts`: lightweight `RemoteInteraction` replica (`RemoteOptions`, `RemoteGuild` with members/channels/roles/bans helpers, `RemoteChannel`, `DiscordAPI` REST wrapper) for workers without full discord.js context.
- `gatewayRouter.ts`: `queueOrRun` decides whether a command runs inline or is enqueued.
- `jobHandler.ts`: registry mapping job names to worker handlers.
- `nonceStore.ts`: Redis-backed nonce store for HMAC replay protection.
- `nsfwClient.ts`: gRPC client for the Rust NSFW service.
- `metrics.ts`: queue depth, latency, and failure gauges for health commands and Prometheus.
- Patterns: Factory (`createQueue(name)` with Map cache and msgpackr serializer), Registry (`jobHandler` job-name to handler map), Proxy (`RemoteInteraction` replica for workers without discord.js context), Strategy (`gatewayRouter queueOrRun` choosing inline versus enqueue).

## Flow
1. Gateway receives an interaction; `gatewayRouter.queueOrRun` checks `config.queue`.
2. `serializeInteraction` flattens the interaction, `jobs/processCommand.ts` signs it with `QUEUE_HMAC_SECRET` and adds a `process-command` job under `QUEUE_PREFIX`.
3. A worker pulls the job, verifies HMAC and nonce, rebuilds a `RemoteInteraction` from the payload, and revalidates fields because queue data crosses a trust boundary.
4. The registered handler executes the command module and records metrics. Failures follow BullMQ retry and removal policy.

## Integration
- Depends on `bullmq`, `ioredis`, `msgpackr`, `src/config/config.ts` (`config.queue`, `QUEUE_HMAC_SECRET`, `QUEUE_PREFIX`), `src/utils/redis.ts`, `src/utils/logger.ts`, `src/utils/metrics.ts`.
- Consumed by command modules (enqueue path) and `src/worker.ts` / `RUN_MODE=worker` processes (consume path). Queue names, prefixes, and failure semantics feed queue health commands and dashboards; do not rename without updating workers, docs, and tests.
