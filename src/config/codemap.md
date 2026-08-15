# src/config/codemap.md

## Responsibility
Centralizes application configuration by providing a singleton configuration object that aggregates environment variables, default values, and feature-specific settings for the Discord bot.

## Design
Implements a modular configuration pattern using a single exported `config` object with nested namespaces (e.g., `welcome`, `moderation`, `levels`). Includes a `parseIntSafe` utility function for robust environment variable parsing. Follows immutable singleton pattern after module initialization.

## Flow
1. Module loads and defines `parseIntSafe` helper.
2. Constructs `config` object by reading `process.env` with fallbacks to hardcoded defaults.
3. Exports `config` as ES module singleton.
4. Consumer modules import `config` to access settings; no runtime mutation occurs after export.
5. Settings are accessed via property traversal (e.g., `config.discord_token`, `config.moderation.muteRoleName`).

## Integration
- **Dependencies**: Node.js `process.env` for environment variables.
- **Consumers**: 
  - `src/index.js` (bot entry point) for token, client ID, guild ID, activity.
  - Plugin system (`src/plugins/*`) for feature toggles and settings.
  - Command files (e.g., moderation, tickets, levels) for behavior configuration.
  - Event listeners (e.g., messageDelete, memberJoin) for logging and automation.
  - Utility modules (e.g., database, queue, interlink) for connection parameters.