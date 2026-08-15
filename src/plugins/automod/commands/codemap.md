Responsibility
Provides a Discord slash command interface for configuring automatic moderation settings per guild, including enabling/disabling automod, managing banned words, configuring filters, and setting exemptions for channels and roles.

Design
Implements the Discord.js command pattern with subcommand structure. Uses a central execute handler that dispatches to specialized async functions per subcommand. Relies on utility modules for persistent storage (getGuildData/setGuildData) and configuration defaults. Features modular handler functions for each subcommand (enable, disable, status, addword, removeword, listwords, set, exemptchannel, exemptrole).

Flow
Data enters via Discord interaction (slash command invocation). The execute function extracts the subcommand and routes to the corresponding handler. Handlers read guild-specific automod configuration from the database via getGuildData, apply modifications, persist changes via setGuildData, and respond with an EmbedBuilder message. State transitions involve toggling boolean flags, updating numeric limits, modifying arrays of banned words, exempt channels, and exempt roles.

Integration
Depends on discord.js (PermissionsBitField, EmbedBuilder, ChannelType), utils/db.js (getGuildData, setGuildData), config/config.js, and utils/safeError.js. Consumed by the bot's command handler or interaction router that registers and invokes the automod command.