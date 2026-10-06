# src/

## Responsibility
Application source root for the strict TypeScript ESM bot. Holds top-level entries `src/index.ts`, `src/shard.ts`, and `src/worker.ts`, plus subsystems `config/`, `core/`, `cli/`, `db/`, `gateway/`, `queue/`, `utils/`, `i18n/`, `observability/`, `types/`, `generated/`, and `plugins/` (admin, automod, integrations, interlink, moderation, tickets, utility). Coordinates Discord client lifecycle, plugin loading, sharding, queue execution, persistence, and telemetry.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Main bot entry wiring validation, Discord client, RUN_MODE branching, and shutdown. |
| `shard.ts` | ShardingManager entry spawning shard processes with respawn. |
| `worker.ts` | Queue worker entry registering job handlers and consuming BullMQ jobs. |

Subdirectories `config/`, `core/`, `cli/`, `db/`, `gateway/`, `queue/`, `utils/`, `i18n/`, `observability/`, `types/`, `generated/`, and `plugins/` hold the subsystems; `PERSISTENCE.md` documents persistence notes.

## Design
- Entries are TypeScript only: `src/index.ts` is the main bot entry run by tsx in dev and `node dist/index.js` in production, `src/shard.ts` is the sharding entry via ShardingManager, `src/worker.ts` is the queue worker entry. No `src/index.js`, `src/worker.js`, or `src/handlers/` paths exist.
- Modular separation: `config/` env singleton with startup validation, `core/` PluginManager plus EventBus plus worker sandbox (`workerHost.ts`, `workerChild.ts`), `queue/` BullMQ creation plus `serializeInteraction.ts` plus `remoteInteraction.ts` plus `jobs/processCommand.ts`, `db/` Knex adapters plus `migrations/*.cjs`, `gateway/leader.ts` Redis fencing, `utils/` shared helpers (logger pino, db bridge, lock, healthServer, schedulers), `i18n/` namespaced translators, `observability/` OpenTelemetry plus Prometheus.
- Plugin contract: each plugin under `src/plugins/<name>/` exports `plugin.ts` extending `src/core/Plugin.ts` with `onLoad`, `onEnable`, `onDisable`, `onUnload`, plus `commands/` and `events/` and optional `cli/`. Commands export a default object with SlashCommandBuilder `data` or `name`, `description`, `options`.
- Type safety: strict mode with `noUncheckedIndexedAccess`, `.js` suffix relative imports, `import type` for types, no explicit any in `src/`, all promises awaited or voided, 4-space single-quote semicolon style.
- Patterns: Template Method (Plugin lifecycle hooks), Command (command modules with `execute`), Observer/Pub-Sub (EventBus plus Redis fan-out), Factory (`createQueue`), Singleton (config and db instances), Proxy/Sandbox (worker host/child boundary), Leader Election (gateway lock with fencing).

## Flow
1. `src/index.ts` loads `dotenv/config`, validates `DISCORD_TOKEN`, operator agreement, operator contact, and `ENCRYPTION_KEY` via `src/utils/startupChecks.ts`, then builds a discord.js v14 client with base intents and partials.
2. Runtime branches on `RUN_MODE`: gateway acquires the global leader lock, connects to Discord, loads plugins, starts health and socket servers and schedulers; worker initializes database and BullMQ job handlers and consumes the command queue.
3. Discord interactions arrive at the gateway, are serialized to minimal JSON, enqueued, revalidated after crossing the trust boundary, and executed by workers against plugin commands and utilities.
4. `src/shard.ts` spawns shard processes when configured, each running the index entry with shard identity, coordinated through leader election and Unix socket RPC.
5. Shutdown on SIGTERM or SIGINT closes queues, Redis, database, health servers, schedulers, and OpenTelemetry in lifecycle order.

## Integration
- Internal: `src/index.ts` wires `config/`, `core/PluginManager`, `core/EventBus`, `queue/queue.ts`, `utils/db.ts`, `utils/logger.ts`, `utils/healthServer.ts`, `cli/socket-server.ts`, `i18n/`, `observability/otel.ts`, and `gateway/leader.ts`. `queue/` feeds `worker.ts`. `core/worker/` isolates third-party plugins with capability checks from `pluginManifest.ts`. Socket handlers register via `manager.registerSocketHandler('namespace.action', handler)` on `/tmp/apollo.sock` or `APOLLO_SOCKET_PATH`.
- External: Discord gateway and REST via discord.js v14, Redis via ioredis for queue plus EventBus plus locks plus schedulers, PostgreSQL or SQLite via Knex for guild and user data, filesystem for plugin storage only (`src/data/` is gitignored runtime state), interlink HTTP relay and Rust NSFW plus Go services where configured.
