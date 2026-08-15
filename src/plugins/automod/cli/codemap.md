Responsibility
Provides command-line interface definitions for the automod plugin, exposing subcommands to configure automatic moderation settings for Discord guilds.

Design
Implements a command registry pattern where the module exports an object containing metadata (name, description) and an array of command objects. Each command object follows the structure: {name, description, options[], execute(args)}. Options define CLI arguments with validation; execute is an async function performing the command logic using data access abstractions.

Flow
Data flow begins when a command is invoked with arguments (args) containing guild identifier and optional parameters. The execute function retrieves guild-specific automod configuration via getGuildData('automod', guildId) or the helper getAutomodConfig. Depending on the command, it reads or updates fields such as enabled, bannedWords, filterInvites, filterLinks, maxMentions, maxCapsPercent, minAccountAge, spamThreshold, spamInterval, exemptChannels, exemptRoles. Updates are persisted through setGuildData('automod', guildId, updatedConfig). The function returns a result object indicating success and a descriptive message.

Integration
Dependencies: src/utils/db.js (getGuildData, setGuildData). Consumed by the automod plugin's command handler (likely src/plugins/automod/index.js or similar) which maps interaction data to args and invokes the appropriate command.execute.