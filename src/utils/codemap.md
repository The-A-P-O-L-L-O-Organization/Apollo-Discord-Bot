# src/utils/codemap.md

## Responsibility
Cross-cutting helpers for persistence, logging, security, scheduling, locking, external integrations, and observability. About 60 focused TypeScript modules with explicit imports and no hidden coupling.

## Files

| File | Purpose |
|------|---------|
| `accessControl.ts` | Permission and role-hierarchy checks before moderation actions. |
| `analyticsCache.ts` | In-memory analytics event cache with per-guild tracking helpers. |
| `analyticsCollector.ts` | Barrel over analytics cache, flush, and stats plus the track entry point. |
| `analyticsFlush.ts` | Periodic flush of cached analytics to the database with collector lifecycle. |
| `analyticsStats.ts` | Read-side analytics queries for commands, messages, violations, and growth. |
| `automod.ts` | Automod barrel re-exporting config, checking, and spam modules. |
| `automodChecking.ts` | Pure content checks for banned words, invites, links, mentions, and caps. |
| `automodConfig.ts` | Per-guild automod configuration loading with channel overrides. |
| `automodSpam.ts` | Burst and spam detection with in-memory and Redis-backed counters. |
| `charts.ts` | Chart rendering helpers for analytics exports. |
| `circuitBreaker.ts` | Circuit breaker wrapper for external API calls with safe fallback. |
| `commandValidator.ts` | Validation of Discord command options and inputs before execution. |
| `dataStore.ts` | Redis-backed key-value store with in-memory fallback. |
| `db.ts` | Sanctioned guild and user data-access bridge routing to the db adapter. |
| `discordErrors.ts` | Shared i18n translators and common Discord error helpers. |
| `duration.ts` | Human-readable duration parsing and formatting. |
| `encryption.ts` | AES-256-GCM field encryption with ENCRYPTION_KEY rotation support. |
| `exportAnalytics.ts` | Analytics export to CSV and embeds for admin commands. |
| `featureFlags.ts` | NSFW and feature flag evaluation helpers. |
| `guildLogging.ts` | Guild event logging config, log-channel resolution, and embed builders. |
| `healthServer.ts` | HTTP liveness and readiness probe server. |
| `integrationClients.ts` | Third-party integration API clients for GitHub, Twitch, and YouTube. |
| `integrationFormatters.ts` | Embed formatters for integration events. |
| `integrationPoller.ts` | Periodic polling of integration feeds for new events. |
| `integrationWebhook.ts` | GitHub webhook receipt with HMAC verification, HTTPS-only except local. |
| `lock.ts` | withLock single-pod scheduler coordination over Redis. |
| `logger.ts` | Pino structured logger factory used everywhere instead of console. |
| `lruCache.ts` | In-process LRU cache. |
| `manifest.ts` | Plugin manifest hash verification helpers. |
| `markdownParser.ts` | Markdown parsing and escaping for embeds and transcripts. |
| `metrics.ts` | Prometheus counters, histograms, and gauges. |
| `moderation.ts` | Shared moderation action helpers. |
| `modLog.ts` | Moderation log embed builder and sender plus member fetching. |
| `nsfwDetection.ts` | NSFW image detection orchestration with circuit breaker and queue enqueue. |
| `openaiModeration.ts` | OpenAI moderation API text checks with violation formatting. |
| `pollScheduler.ts` | Poll lifecycle scheduler with start, stop, and stats. |
| `raidDetection.ts` | Raid detection barrel over types, Redis, core, and similarity modules. |
| `raidDetectionCore.ts` | Core raid pattern checking plus raid-mode enable and disable. |
| `raidDetectionRedis.ts` | Redis-backed join tracking and raid pattern checks. |
| `raidDetectionSimilarity.ts` | Username similarity helpers using Levenshtein distance. |
| `raidDetectionTypes.ts` | Raid threshold and state type definitions. |
| `redis.ts` | Standalone ioredis client factory. |
| `redisCluster.ts` | Redis standalone and cluster client factory with env-based construction. |
| `reminderScheduler.ts` | Reminder due-check scheduler with start and stop. |
| `reportHandler.ts` | User report intake handling. |
| `safeError.ts` | Safe user-facing error summaries without stacks, SQL, paths, or secrets. |
| `safeFetch.ts` | Bounded-timeout fetch with retry and size limits. |
| `securityLog.ts` | Security event structured logging. |
| `simhash.ts` | Simhash content fingerprinting for near-duplicate detection. |
| `slaTracker.ts` | Ticket SLA tracking and breach detection. |
| `startupChecks.ts` | Boot validation of required secrets, pool caps, and plugin flags. |
| `structuredLogger.ts` | Structured log formatting helpers. |
| `tempbanScheduler.ts` | Temporary ban expiry scheduler. |
| `tempRolesScheduler.ts` | Temporary role expiry scheduler. |
| `threatScore.ts` | Threat scoring for users and content. |
| `tracing.ts` | OpenTelemetry tracing setup helpers. |
| `transcriptGenerator.ts` | Ticket transcript HTML and markdown generation. |
| `translation.ts` | Message translation helpers. |
| `xp.ts` | XP and level calculation plus award helpers. |

No subdirectories; all modules are top-level files in `src/utils/`.

## Design
- Persistence: `db.ts` routes `getGuildData`, `setGuildData`, `updateGuildData`, `getAllGuildData`, `getUserData`, `setUserData`, `getAllUserData`, `getData`, `setData` to `src/db/adapter.ts` plus `src/db/knex.ts` for Postgres or embedded `better-sqlite3` for SQLite. `dataStore.ts` is the Redis-backed key-value store with in-memory fallback. `lruCache.ts` is the in-process LRU.
- Logging: `logger.ts` (`createLogger`, pino structured logs, never `console.log`) and `structuredLogger.ts`; `securityLog.ts` (`logSecurityEvent`); `guildLogging.ts`, `modLog.ts` build moderation embeds.
- Security: `encryption.ts` (AES-256-GCM, `ENCRYPTION_KEY` rotation as comma-separated values with the first key active for encryption and all keys tried for decryption); `startupChecks.ts` (requires `DISCORD_TOKEN`, `OPERATOR_AGREEMENT=true`, `OPERATOR_CONTACT`, `ENCRYPTION_KEY`; rejects placeholder tokens; caps Postgres pool max near 80 percent of `max_connections`; warns on `ALLOW_UNVERIFIED_PLUGINS=1`); `accessControl.ts`, `commandValidator.ts`, `safeError.ts` (safe user-facing summaries), `safeFetch.ts` (bounded timeout, retry, size limits), `circuitBreaker.ts`, `threatScore.ts`, `simhash.ts`.
- Concurrency: `lock.ts` (`withLock` plus `getLockRedis`) so schedulers run on one pod only; `redis.ts` and `redisCluster.ts` client factories.
- Scheduling: `reminderScheduler.ts`, `pollScheduler.ts`, `tempbanScheduler.ts`, `tempRolesScheduler.ts`, `integrationPoller.ts`.
- Content: `automod.ts` barrel over `automodConfig.ts`, `automodChecking.ts`, `automodSpam.ts`; `raidDetection.ts` barrel over `raidDetectionTypes.ts`, `raidDetectionRedis.ts`, `raidDetectionCore.ts`, `raidDetectionSimilarity.ts`; `moderation.ts`, `nsfwDetection.ts`, `openaiModeration.ts`, `translation.ts`, `markdownParser.ts`, `duration.ts`, `xp.ts`, `transcriptGenerator.ts`, `reportHandler.ts`.
- Analytics: `analyticsCollector.ts` barrel over `analyticsCache.ts`, `analyticsFlush.ts`, `analyticsStats.ts`; `exportAnalytics.ts`, `charts.ts`.
- Integrations: `integrationClients.ts`, `integrationFormatters.ts`, `integrationWebhook.ts` (GitHub HMAC verification, HTTPS-only except local).
- Observability: `metrics.ts` (Prometheus counters, histograms, gauges), `healthServer.ts` (liveness and readiness), `tracing.ts` (OpenTelemetry), `slaTracker.ts`.
- Misc: `manifest.ts` (plugin integrity), `discordErrors.ts` (shared translators, `getCommonT`), `featureFlags.ts`.
- Patterns: Facade (`db.ts` sanctioned bridge over `src/db/adapter.ts`, barrel re-exports over automod/raid/analytics modules), Adapter (`dataStore.ts` Redis store with in-memory fallback), Circuit Breaker (`circuitBreaker.ts` with safe fallback for external calls), Distributed Lock (`lock.ts withLock` single-pod scheduler coordination).

## Flow
1. Startup: `startupChecks.ts` validates boot secrets and pool caps; `db.ts` lazily initializes the adapter; `dataStore.ts` connects Redis when configured.
2. Commands and events call `db.ts` getters and setters for guild and user state, `logger.ts` child loggers for structured logs, and `accessControl.ts` plus `commandValidator.ts` before acting.
3. External calls go through `safeFetch.ts` with circuit breaker, bounded timeouts, and safe fallbacks; user-facing errors pass through `safeError.ts` without stacks, SQL, paths, or secrets.
4. Schedulers and pollers wrap each tick in `withLock` for single-pod execution and persist via `db.ts` or `dataStore.ts`.
5. Shutdown closes database pools, disconnects Redis, and clears timers.

## Integration
- Consumed by `src/plugins/*/commands/`, `src/plugins/*/events/`, `src/core/*`, `src/queue/*`, `src/gateway/*`, `src/cli/*`, and `src/observability/*`.
- Depends on `src/config/config.ts`, `discord.js`, `ioredis`, `i18next`, and service SDKs. `db.ts` is the only sanctioned path to guild and user data; direct Knex use is limited to `src/db/` internals and migrations.
