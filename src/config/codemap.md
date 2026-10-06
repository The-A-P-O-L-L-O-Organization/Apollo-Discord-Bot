# src/config/codemap.md

## Responsibility
Builds the immutable `ApolloConfig` singleton in `config.ts` from environment variables with typed defaults. Covers discord, activity, welcome, moderation, warnings, automod, levels, tickets, logging, reminders, polls, reaction roles, webhooks, GitHub, Twitch, YouTube, plugins, database, queue, interlink, shard, operator agreement, and NSFW flags.

## Files

| File | Purpose |
|------|---------|
| `config.ts` | Immutable ApolloConfig singleton built from environment variables with typed defaults. |

No subdirectories; the singleton is the only module in `src/config/`.

## Design
- `config.ts`: single exported `config` object typed as `ApolloConfig` from `src/types/config.ts`. Helpers `parseIntSafe`, `parseBoolSafe`, `getEnv`. No runtime mutation after module init; consumers read by property traversal.
- Sections include `discord` (token, clientId, clientSecret, shardCount), `activity` (name, type), `welcome` (channelName, message), `moderation` (defaultReason, muteRoleName, muteDuration, purge limits, log channel), `warnings` thresholds, feature modules, `database` (postgres versus sqlite plus pool), `queue` (enabled, redis, prefix, hmacSecret), `interlink`, `shard` (queuePrefixBase, leader election), `operator` (agreed, contact), and `nsfw` (`NSFW_USE_RUST`, `NSFW_GRPC_ADDR`, `NSFW_THRESHOLD`, `NSFW_RUST_TIMEOUT_MS`).
- Patterns: Singleton (single frozen `config` object built once at module init with no runtime mutation).

## Flow
1. Module loads, reads `process.env` with `getEnv`, applies `parseIntSafe` and `parseBoolSafe` fallbacks.
2. Exports the frozen-shape `config` singleton.
3. `src/index.ts` uses `discord`, `activity`, `operator`, and `shard` sections at startup.
4. `PluginManager` reads `config.plugins`; `src/db/knex.ts` reads `config.database`; `src/queue/queue.ts` reads `config.queue` (`QUEUE_PREFIX`, `QUEUE_HMAC_SECRET`); `src/gateway/leader.ts` reads shard and election settings; interlink plugins read `config.interlink`.
5. `src/utils/startupChecks.ts` enforces production requirements: `DISCORD_TOKEN`, `OPERATOR_AGREEMENT`, `OPERATOR_CONTACT`, `ENCRYPTION_KEY`, socket token, Redis auth, and Postgres pool capping.

## Integration
- Depends only on `process.env` and `src/types/config.ts` (plus `discordErrors.ts` for a shared translator).
- Consumed by entry points (`src/index.ts`, `src/shard.ts`, `src/worker.ts`, `bin/apollo.ts`), `src/utils/startupChecks.ts`, `src/db/*`, `src/queue/*`, `src/gateway/*`, and every first-party plugin (`admin`, `automod`, `integrations`, `interlink`, `moderation`, `tickets`, `utility`).
