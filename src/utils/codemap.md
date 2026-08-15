# Responsibility
The `src/utils` directory provides centralized utility functions and abstractions for cross-cutting concerns including data persistence, logging, error handling, moderation, NSFW detection, translation, scheduling, HTTP requests, locking, analytics, and integration with external services used across the Apollo Discord Bot.

# Design
- **Adapter Pattern**: `db.js` abstracts PostgreSQL and SQLite backends with lazy singleton initialization.
- **Logger Pattern**: `logger.js` offers a centralized logging service that creates embeds and sends them to configured channels based on guild settings.
- **Strategy Pattern**: Moderation utilities (`moderation.js`, `nsfwDetection.js`, `openaiModeration.js`) encapsulate interchangeable algorithms for permission checks and content analysis.
- **Factory/Helper Pattern**: Modules like `safeError.js`, `safeFetch.js`, `translation.js`, `markdownParser.js` export cohesive helper functions.
- **Scheduler Pattern**: Files such as `reminderScheduler.js`, `tempRolesScheduler.js`, `tempbanScheduler.js`, `pollScheduler.js` implement timed task execution using node‑cron or setInterval.
- **Lock Pattern**: `lock.js` provides a mutex implementation for concurrency control.
- **Module Pattern**: Each utility file exports a focused API, minimizing coupling.
- **Dependency Injection**: Configuration is injected via `../config/config.js`; external libraries are imported locally.
- **Observer/Pub‑Sub**: `logger.js` acts as an observer for events triggered elsewhere; `integrationPoller.js` polls external APIs and emits updates.

# Flow
1. **Initialization**: On bot startup, `startupChecks.js` validates environment; `db.js` initializes database adapter lazily on first use.
2. **Data Access**: Commands and event listeners call `db.js` functions (`getGuildData`, `setUserData`, etc.) which route to the appropriate adapter (PostgreSQL or SQLite) based on configuration.
3. **Logging**: When moderation actions occur, `logger.js` functions (`logEvent`, `create*Embed`) are invoked; they fetch logging configuration via `db.js`, format embeds, and send them to the designated channel.
4. **Moderation & Content Analysis**: 
   - Permission checks use `moderation.js.canModerate`.
   - NSFW scanning uses `nsfwDetection.js.checkMessageAttachments` which downloads images via `safeFetch.js`, analyzes with TensorFlow model, and returns results.
   - AI‑based moderation uses `openaiModeration.js` to call OpenAI API.
5. **Helper Invocation**: 
   - HTTP requests go through `safeFetch.js` (retry, timeout, size limits).
   - Errors are sanitized via `safeError.js` before user‑facing responses.
   - Multi‑language strings are retrieved via `translation.js`.
   - Markdown content is parsed via `markdownParser.js` for safe rendering.
6. **Scheduling & Automation**: 
   - Scheduler files (`*Scheduler.js`) trigger at defined intervals, invoking related utilities (e.g., `exportAnalytics.js` generates reports, `reminderScheduler.js` sends reminders).
   - `integrationPoller.js` periodically fetches data from external services (GitHub, etc.) and updates internal state via `db.js`.
7. **State Persistence**: After processing, utilities persist changes via `db.js` setters; cached data may be updated in memory.
8. **Cleanup**: On shutdown, `db.js.close()` releases database connections; scheduler timers are cleared.

# Integration
- **Consumers**: 
  - Command modules in `src/plugins/*/commands/` import utilities directly (e.g., `db.js`, `logger.js`, `moderation.js`).
  - Event listeners in `src/plugins/*/events/` use `logger.js` and `safeFetch.js` for audit logging and webhook handling.
  - Plugin core files (`src/plugins/*/index.js`) may initialize schedulers or load integration clients.
- **Dependencies**: 
  - `db.js`: `../config/config.js`, `better-sqlite3`, `pg` (via adapter).
  - `logger.js`: `discord.js`, `db.js`, `../config/config.js`.
  - `safeFetch.js`: Node.js `undici` (global fetch), retry logic.
  - `nsfwDetection.js`: `@tensorflow/tfjs-node`, `nsfwjs`, `safeFetch.js`, `db.js`.
  - `openaiModeration.js`: `openai` API client, `safeFetch.js`.
  - `translation.js`: `i18next` or custom JSON files.
  - `markdownParser.js`: `markdown-it` or similar.
  - Scheduler files: `node-cron` or native `setInterval`.
  - `lock.js`: minimal dependency, implements Promise‑based mutex.
  - `integrationClients.js`: API-specific SDKs (e.g., `octokit` for GitHub).
  - `integrationWebhook.js`: `discord.js` for sending webhooks, `safeFetch.js` for receiving.
- **Hooks/Events**: No formal hook system; utilities are invoked imperatively by callers. The logger acts as an implicit observer of moderation events.
- **API Endpoints**: 
  - `integrationWebhook.js` exposes outgoing webhook endpoints for services like Discord, GitHub, and Trello.
  - `integrationClients.js` encapsulates clients for external REST APIs (GitHub, Reddit, etc.) used by commands.
  - `openaiModeration.js` calls the OpenAI Moderation API endpoint.