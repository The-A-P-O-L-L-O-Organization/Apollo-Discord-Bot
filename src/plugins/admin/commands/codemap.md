# Responsibility
This directory contains administrative slash command implementations for managing bot configuration, moderation utilities, plugin lifecycle, database operations, queue monitoring, reaction roles, and system health. Each file exports a command object following the bot's command pattern, providing admin and developer-only functionality for server management and bot maintenance.

# Design
- **Pattern**: Modular command structure using `export default` with `name`, `description`, `category`, `options` (for subcommands), and `execute` async function.
- **Abstractions**: 
  - `SlashCommandBuilder` (discord.js) for defining command structure.
  - Subcommand pattern via `interaction.options.getSubcommand()`.
  - Data access layer through `getGuildData`/`setGuildData` utilities for guild-specific storage.
  - Permission checks using `PermissionFlagsBits` and role hierarchy validation.
  - Embedded responses using `EmbedBuilder` for structured output.
  - Error handling via `handleDiscordError`, `safeReply`, and `safeFollowUp` utilities.
- **Interfaces**: 
  - Input: `Interaction` object from discord.js.
  - Output: `InteractionReplyOptions` or `InteractionEditReplyOptions`.
  - Data contracts: Guild-specific JSON objects stored via database utilities.
  - Developer-only commands require bot owner verification via `requireOwner`.

# Flow
1. **Entry**: Interaction received from command handler.
2. **Permission Guard**: Early exit if user lacks required permissions (admin/developer/owner).
3. **Subcommand Dispatch**: `interaction.options.getSubcommand()` determines execution branch.
4. **Data Retrieval**: Fetch existing configuration via `getGuildData` or `getDb`.
5. **State Mutation**: Modify configuration objects based on subcommand logic.
6. **Persistence**: Store updated state via `setGuildData` or migration runner.
7. **Response Construction**: Build reply content (text, embeds) with operation results.
8. **Exit**: Return reply object to interaction handler.

# Integration
- **Dependencies**: 
  - `discord.js` (SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType)
  - `../../../utils/db.js` (getGuildData, setGuildData)
  - `../../../config/config.js` (bot configuration)
  - `../../../utils/safeError.js` (error formatting)
  - `../../../utils/discordErrors.js` (error handling)
  - `../../../utils/accessControl.js` (requireOwner)
  - `../../../core/PluginRegistry.js` (plugin command only)
  - `../../../queue/metrics.js` (queue command only)
  - `../../../db/knex.js` (migrate command only)
  - `ioredis` (system command optional)
- **Consumers**: 
  - Command handler in `src/core/CommandHandler.js`
  - Plugin system for developer-only commands
  - Event logging subsystem (logging command)
  - Reaction role system (reactionrole command)
  - Database migration system (migrate command)
  - Queue monitoring system (queue command)
  - Health check system (system command)
  - Plugin management system (plugin command)
  - Logging channel configuration (setlogchannel command)