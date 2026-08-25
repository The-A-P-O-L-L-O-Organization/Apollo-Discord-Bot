# src/config/codemap.md

## Responsibility
Centralizes application configuration by providing a singleton configuration object that aggregates environment variables, default values, and feature-specific settings for the Discord bot. Manages configuration for core bot functionality, plugins, database, queue, interlink, sharding, and operator agreements.

## Design
Implements a modular configuration pattern using a single exported `config` object with nested namespaces (e.g., `welcome`, `moderation`, `levels`, `database`, `queue`, `interlink`, `shard`). Includes a `parseIntSafe` utility function for robust environment variable parsing. Follows immutable singleton pattern after module initialization. Configuration is divided into logical sections:
- Core Discord settings (token, client ID, guild ID, encryption)
- Feature modules (welcome, moderation, warnings, automod, levels, tickets, logging, reminders, polls, reaction roles)
- System integrations (webhooks, GitHub, Twitch, YouTube)
- Plugin system configuration
- Database (PostgreSQL/SQLite) connection pooling
- Interlink cross-bot communication
- Queue (BullMQ/Redis) configuration
- Operator agreement and contact
- Sharding and leader election settings

## Flow
1. Module loads and defines `parseIntSafe` helper.
2. Constructs `config` object by reading `process.env` with fallbacks to hardcoded defaults.
3. Exports `config` as ES module singleton.
4. Consumer modules import `config` to access settings; no runtime mutation occurs after export.
5. Settings are accessed via property traversal (e.g., `config.discord_token`, `config.moderation.muteRoleName`, `config.database.postgres.connectionString`).
6. During bot startup, `src/index.js` and other modules consume relevant config sections:
   - Discord client initialization uses token, client ID, guild ID, activity.
   - Plugin manager reads `config.plugins` for enabled plugin list and directories.
   - Database adapter uses `config.database` for connection type and parameters.
   - Queue system reads `config.queue` for Redis connection and job processing.
   - Interlink HTTP server uses `config.interlink` for port and Redis prefix.
   - Sharding logic reads `config.shard` for leader election and task distribution.
   - Operator agreement validated via `config.operator.agreed`.

## Integration
- **Dependencies**: Node.js `process.env` for environment variables.
- **Consumers**: 
  - `src/index.js` (bot entry point) for token, client ID, guild ID, activity, operator agreement, sharding.
  - `src/db/adapter.js` for database type and connection settings.
  - `src/queue/queue.js` for BullMQ/Redis configuration.
  - `src/gateway/leader.js` for sharding leader election configuration.
  - `src/plugins/interlink/` for HTTP server and Redis settings.
  - Plugin system (`src/plugins/*`) for feature toggles and settings via `config.welcome`, `config.moderation`, etc.
  - Command files (e.g., moderation, tickets, levels) for behavior configuration.
  - Event listeners (e.g., messageDelete, memberJoin) for logging and automation.
  - Utility modules (e.g., database, queue, interlink) for connection parameters.
  - CLI (`bin/apollo.js`) for operator contact and agreement checks.