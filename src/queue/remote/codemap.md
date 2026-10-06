# src/queue/remote/

## Responsibility
Worker-side replicas of discord.js objects. Reconstructs a usable interaction, guild, channel, options, and REST surface from serialized BullMQ payloads so queue workers can execute commands without a gateway connection.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Barrel re-exporting the remote interaction surface. |
| `interaction.ts` | Reconstructed interaction with reply and follow-up behavior. |
| `options.ts` | `RemoteOptions` subset of command option getters. |
| `guild.ts` | `RemoteGuild` plus members, channels, roles, and bans subsets. |
| `channel.ts` | `RemoteChannel` plus messages and permission-overwrite subsets. |
| `discordApi.ts` | `DiscordAPI` REST surface used by workers in place of the client. |

## Design
- Patterns: Proxy (each `Remote*` class stands in for its discord.js counterpart across the queue trust boundary), Adapter (translates serialized payloads into the interaction shape command handlers expect), Facade (`index.ts` barrel hides the replica internals).
- Payloads are serializable and minimal by construction in `src/queue/serializeInteraction.ts`; every reconstructed object is revalidated before use because queue data crosses a trust boundary.

## Flow
1. Gateway serializes the interaction and enqueues it via `src/queue/queue.ts` with HMAC signing.
2. Worker dequeues in `src/queue/jobs/processCommand.ts`, verifies the signature, and rebuilds the interaction through these replicas.
3. Command executes against the replicas; replies route back through the REST surface.

## Integration
- Consumed by: `src/queue/jobs/processCommand.ts` and worker role (`src/worker.ts`, `RUN_MODE=worker`).
- Depends on: serialized payloads from `src/queue/serializeInteraction.ts`, `src/queue/queue.ts` job options, discord.js types only.
