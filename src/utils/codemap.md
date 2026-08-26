# Responsibility
The `src/utils` directory provides centralized utility functions and abstractions for cross-cutting concerns including data persistence, logging, error handling, moderation, NSFW detection, translation, scheduling, HTTP requests, locking, analytics, integration with external services, security, and performance monitoring used across the Apollo Discord Bot.

# Design
- **Adapter Pattern**: `db.js` abstracts PostgreSQL and SQLite backends with lazy singleton initialization.
- **Logger Pattern**: `logger.js` offers a centralized logging service that creates embeds and sends them to configured channels based on guild settings; `structuredLogger.js` provides structured logging with levels.
- **Strategy Pattern**: Moderation utilities (`moderation.js`, `nsfwDetection.js`, `openaiModeration.js`, `automod.js`) encapsulate interchangeable algorithms for permission checks and content analysis.
- **Factory/Helper Pattern**: Modules like `safeError.js`, `safeFetch.js`, `translation.js`, `markdownParser.js`, `duration.js`, `encryption.js`, `xp.js` export cohesive helper functions.
- **Scheduler Pattern**: Files such as `reminderScheduler.js`, `tempRolesScheduler.js`, `tempbanScheduler.js`, `pollScheduler.js` implement timed task execution using node‑cron or setInterval.
- **Lock Pattern**: `lock.js` provides a mutex implementation for concurrency control.
- **Cache Pattern**: `lruCache.js` implements an LRU cache for in‑memory storage.
- **Data Store**: `dataStore.js` provides a key‑value store backed by Redis or fallback.
- **Circuit Breaker**: `circuitBreaker.js` implements the circuit breaker pattern for external service calls.
- **Metrics**: `metrics.js` collects and exposes application metrics.
- **Tracing**: `tracing.js` provides distributed tracing utilities.
- **Health Server**: `healthServer.js` exposes an HTTP endpoint for liveness/readiness probes.
- **Access Control**: `accessControl.js` centralizes permission and role‑based access checks.
- **Module Pattern**: Each utility file exports a focused API, minimizing coupling.
- **Dependency Injection**: Configuration is injected via `../config/config.js`; external libraries are imported locally.
- **Observer/Pub‑Sub**: `logger.js` acts as an observer for events triggered elsewhere; `integrationPoller.js` polls external APIs and emits updates.

# Flow
1. **Initialization**: On bot startup, `startupChecks.js` validates environment and operator agreement; `db.js` initializes database adapter lazily on first use; `dataStore.js` connects to Redis if configured.
2. **Data Access**: Commands and event listeners call `db.js` functions (`getGuildData`, `setUserData`, etc.) which route to the appropriate adapter (PostgreSQL or SQLite) based on configuration; `dataStore.js` provides fast key‑value operations.
3. **Logging**: When moderation actions occur, `logger.js` functions (`logEvent`, `create*Embed`) are invoked; they fetch logging configuration via `db.js`, format embeds, and send them to the designated channel; `structuredLogger.js` logs to console/file with levels.
4. **Moderation & Content Analysis**: 
   - Permission checks use `accessControl.js.canModerate` and `moderation.js.canModerate`.
   - NSFW scanning uses `nsfwDetection.js.checkMessageAttachments` which downloads images via `safeFetch.js`, analyzes with TensorFlow model, and returns results.
   - AI‑based moderation uses `openaiModeration.js` to call OpenAI API.
   - Automod utilities in `automod.js` provide rule‑based filtering.
5. **Helper Invocation**: 
   - HTTP requests go through `safeFetch.js` (retry, timeout, size limits) with optional circuit breaker via `circuitBreaker.js`.
   - Errors are sanitized via `safeError.js` before user‑facing responses.
   - Multi‑language strings are retrieved via `translation.js`.
   - Markdown content is parsed via `markdownParser.js` for safe rendering.
   - Duration parsing/formatting via `duration.js`.
   - Encryption/hashing via `encryption.js`.
   - XP calculations via `xp.js`.
6. **Scheduling & Automation**: 
   - Scheduler files (`*Scheduler.js`) trigger at defined intervals, invoking related utilities (e.g., `exportAnalytics.js` generates reports, `reminderScheduler.js` sends reminders, `tempbanScheduler.js` unbans users).
   - `integrationPoller.js` periodically fetches data from external services (GitHub, etc.) and updates internal state via `db.js` or `dataStore.js`.
   - `healthServer.js` serves metrics and status endpoints.
7. **State Persistence**: After processing, utilities persist changes via `db.js` setters or `dataStore.js`; cached data may be updated in `lruCache.js`.
8. **Cleanup**: On shutdown, `db.js.close()` releases database connections; `dataStore.js` disconnects Redis; scheduler timers are cleared.

# Integration
- **Consumers**: 
  - Command modules in `src/plugins/*/commands/` import utilities directly (e.g., `db.js`, `logger.js`, `accessControl.js`, `moderation.js`).
  - Event listeners in `src/plugins/*/events/` use `logger.js`, `safeFetch.js`, `integrationWebhook.js` for audit logging and webhook handling.
  - Plugin core files (`src/plugins/*/index.js`) may initialize schedulers or load integration clients.
- **Dependencies**: 
  - `db.js`: `../config/config.js`, `better-sqlite3`, `pg` (via adapter).
  - `dataStore.js`: `ioredis` (Redis), fallback to in‑memory.
  - `logger.js`: `discord.js`, `db.js`, `../config/config.js`.
  - `structuredLogger.js`: `pino` or similar.
  - `safeFetch.js`: Node.js `undici` (global fetch), retry logic, `circuitBreaker.js`.
  - `circuitBreaker.js`: implements circuit breaker pattern.
  - `nsfwDetection.js`: `@tensorflow/tfjs-node`, `nsfwjs`, `safeFetch.js`, `db.js`.
  - `openaiModeration.js`: `openai` API client, `safeFetch.js`.
  - `translation.js`: `i18next` or custom JSON files.
  - `markdownParser.js`: `markdown-it` or similar.
  - Scheduler files: `node-cron` or native `setInterval`.
  - `lock.js`: minimal dependency, implements Promise‑based mutex.
  - `lruCache.js`: simple LRU implementation.
  - `accessControl.js`: role and permission utilities, uses `db.js`.
  - `automod.js`: rule‑engine for auto‑moderation.
  - `integrationClients.js`: API‑specific SDKs (e.g., `octokit` for GitHub).
  - `integrationWebhook.js`: `discord.js` for sending webhooks, `safeFetch.js` for receiving.
  - `integrationPoller.js`: uses `integrationClients.js` and `safeFetch.js`.
  - `exportAnalytics.js`: generates reports, uses `db.js` and `metrics.js`.
  - `metrics.js`: collects metrics, may expose via `healthServer.js`.
  - `tracing.js`: OpenTelemetry or similar.
  - `healthServer.js`: `express` or `undici` based HTTP server.
  - `raidDetection.js`: detects raid patterns, uses `accessControl.js` and `logger.js`.
  - `modLog.js`: moderation logging helper.
  - `redis.js`: wrapper around ioredis.
  - `encryption.js`: crypto utilities with key rotation support (comma-separated ENCRYPTION_KEYS, v1 format: version:salt:iv:authTag:ciphertext), decrypt tries all keys, reEncryptIfNeeded() for migration.
  - `duration.js`: human‑readable time parsing.
  - `xp.js`: experience point calculations for leveling.
  - `manifest.js`: plugin manifest utilities.
  - `chart.js`: chart generation utilities (if present).
  - `analyticsCollector.js`: collects analytics data.
  - `transcriptGenerator.js`: generates transcripts of conversations.
  - `reportHandler.js`: handles report submissions.
  - `tracing.js`: distributed tracing.
  - `redis.js`: Redis client wrapper.
  - `securityLog.js`: security event logging.
  - `slaTracker.js`: SLA violation tracking.
- **Hooks/Events**: No formal hook system; utilities are invoked imperatively by callers. The logger acts as an implicit observer of moderation events.
- **API Endpoints**: 
  - `integrationWebhook.js` exposes outgoing webhook endpoints for services like Discord, GitHub, and Trello.
  - `integrationClients.js` encapsulates clients for external REST APIs (GitHub, Reddit, etc.) used by commands.
  - `openaiModeration.js` calls the OpenAI Moderation API endpoint.
  - `healthServer.js` exposes `/health`, `/metrics`, `/ready` endpoints.