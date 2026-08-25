# Responsibility
The admin plugin provides administrative capabilities for managing other plugins, logging settings, and system operations within the application. It includes slash commands for moderation, configuration, and plugin lifecycle management, event listeners for audit logging and automated moderation (e.g., reaction roles), and a CLI interface for administrative tasks.

# Design
- **Plugin Architecture**: Extends the base `Plugin` class (`../../core/Plugin.js`) to integrate with the bot's plugin system, following the lifecycle (`onEnable`/`onDisable`).
- **Modular Subsystems**: 
  - `commands/`: Administrative slash commands using Discord.js `SlashCommandBuilder` with subcommand patterns.
  - `events/`: Discord event listeners following the `name`, `once`, `execute` pattern for audit logging and automated actions.
  - `cli/`: Command-line interface definitions for administrative tasks, consumed by the core command handler.
- **Socket Interface**: Registers RPC-style handlers over Unix socket (`admin.*`) for remote plugin management and logging configuration.
- **Dependencies**: Utilizes core utilities for logging (`logger.js`), database access (`db.js`), configuration (`config.js`), and plugin registry (`PluginRegistry.js`).

# Flow
1. **Enable**: 
   - Loads all slash commands from `commands/` via `_loadCommands()`.
   - Loads all event listeners from `events/` via `_loadEvents()`.
   - Registers socket handlers for plugin management (`admin.plugin.*`) and logging configuration (`admin.logging.set`).
2. **Runtime**:
   - Slash commands are invoked through Discord interactions, handled by the core command system.
   - Event listeners react to Discord events (e.g., `guildBanAdd`, `messageReactionAdd`) to perform logging, role assignments, or audit actions.
   - Socket handlers allow external processes (via Unix socket) to trigger plugin enable/disable/reload/install/uninstall and update logging settings.
3. **Disable**:
   - Unloads commands and events to clean up resources.
   - Socket handlers are automatically removed when the plugin is disabled.

# Integration
- **Internal Dependencies**:
  - Core Plugin system (`../../core/Plugin.js`) for lifecycle management.
  - Command handler (`../../core/CommandHandler.js`) for slash command registration and execution.
  - Event system (Discord client) for listener attachment.
  - Socket handler registry (`manager.socketHandlerRegistry`) for RPC exposure.
  - Utility modules: `logger.js` (logging), `db.js` (guild/user data), `config.js` (configuration).
  - Plugin registry (`../../core/PluginRegistry.js`) for plugin metadata in management commands.
- **External Integrations**:
  - Discord.js for command interactions and event handling.
  - Unix socket (`/tmp/apollo.sock` or `APOLLO_SOCKET_PATH`) for administrative RPC.
  - Database (via Knex) for persistent guild/user settings modified by commands.
  - Redis (indirectly via BullMQ) for queue-related admin commands.
- **Consumers**:
  - End-users via Discord slash commands (admin/moderation).
  - External scripts or admin tools via socket interface.
  - CLI tool (`bin/apollo.js`) for command-line administrative operations.