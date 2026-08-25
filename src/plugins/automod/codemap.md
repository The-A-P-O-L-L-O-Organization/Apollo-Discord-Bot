Responsibility
Provides the Automod plugin that extends the base Plugin class to manage automatic moderation functionality, including lifecycle handling for command and event subsystems. The plugin implements a comprehensive set of moderation features such as banned word filtering, link and invite blocking, spam detection (message, caps, mention), raid detection, AI-based moderation (OpenAI), NSFW image filtering, and configurable exemptions for channels and roles. It also provides both slash commands and a CLI interface for server administrators to configure automod settings per guild.

Design
- Inherits from src/core/Plugin.js, implementing standard lifecycle methods (onEnable, onDisable) that load/unload commands and events via inherited helper methods.
- Defines static metadata: id = 'automod', version = '1.0.0', dependencies = [].
- Includes static resourceLimits to increase memory allocation for TensorFlow/NSFW detection workloads.
- Command structure uses discord.js SlashCommandBuilder with numerous subcommands for configuration (enable/disable/status, word management, setting toggles, exemptions, scanning).
- Context menu command (src/plugins/automod/commands/scanMessage.js) allows right‑click scanning of individual messages for NSFW content.
- Event handling is centered on src/plugins/automod/events/messageCreate.js, which processes every guild message and runs a series of moderation checks.
- Heavy reliance on utility modules:
  * src/utils/automod.js – core check functions (banned words, invites, links, mentions, caps, spam, raid, account age, phishing).
  * src/utils/nsfwDetection.js – image‑based NSFW scanning.
  * src/utils/raidDetection.js – coordinated attack detection.
  * src/utils/openaiModeration.js – AI moderation API wrapper.
  * src/utils/logger.js, src/utils/db.js, src/utils/config.js, src/utils/safeError.js, src/utils/discordErrors.js.
  * Uses Redis via src/utils/lock.js for distributed spam tracking when config.automod.useRedisSpamTracking is enabled.
- Plugin commands and CLI commands both modify guild‑specific configuration stored via getGuildData/setGuildData under the 'automod' key.
- Violations are tracked via the warnings system, with auto‑punishment (ban/kick/mute) based on thresholds defined in warnings‑config or default config.
- Mod‑log integration via src/utils/modLog.js to record automod actions.

Flow
1. Plugin lifecycle:
   - PluginManager calls onEnable() → awaits this._loadCommands() then this._loadEvents().
   - onDisable() → this._unloadCommands() then this._unloadEvents().
2. Command flow (slash command):
   - Interaction creates AutomatodCommand instance (src/plugins/automod/commands/automod.js).
   - execute() dispatches to subcommand handlers (enable, disable, status, addword, removeword, listwords, set, exemptchannel, exemptrole, scan).
   - Handlers read/modify guild automod config via getGuildData/setGuildData and respond with embeds.
3. Context menu flow:
   - User right‑clicks a message → "Scan for NSFW".
   - src/plugins/automod/commands/scanMessage.js executes, checks attachments via checkMessageAttachments, optionally deletes, and returns results.
4. Event flow (messageCreate):
   - On each messageCreate event (src/plugins/automod/events/messageCreate.js):
     - Ignore DMs.
     - Fetch automod config for guild.
     - Exit if automod disabled or channel/member exempt.
     - Run checks in order: account age, banned words, invites, links, phishing links, mention spam, caps spam, message spam (Redis or in‑memory), raid detection, AI moderation, NSFW attachments.
     - On first violation, call handleViolation() which:
         * Tracks violation analytically.
         * Sets per‑user cooldown (5 seconds).
         * Optionally deletes the offending message.
         * Adds a warning to the user.
         * Checks auto‑punishment thresholds (ban/kick/mute) and applies if warranted.
         * Sends a temporary warning embed to the channel.
         * Logs the action to mod‑log.
5. CLI flow:
   - src/plugins/automod/cli/index.js provides a command‑line interface mirroring many slash‑command subcommands (enable, disable, status, listwords, addword, removeword, set, exemptchannel, exemptrole) for administrative scripting or automation.

Integration
- Depends on src/core/Plugin.js for base plugin functionality.
- Consumes command modules from src/plugins/automod/commands/ (automod.js, scanMessage.js) and CLI commands from src/plugins/automod/cli/index.js.
- Consumes event module from src/plugins/automod/events/messageCreate.js.
- Integrates with numerous utility modules:
  * Logging: src/utils/logger.js
  * Database: src/utils/db.js (getGuildData, setGuildData, getUserData, appendToUserArray, generateId)
  * Configuration: src/utils/config.js
  * Error handling: src/utils/safeError.js, src/utils/discordErrors.js
  * NSFW detection: src/utils/nsfwDetection.js (checkMessageAttachments, formatNsfwPredictions)
  * RAID detection: src/utils/raidDetection.js (checkRaidPattern, handleRaidDetected)
  * AI moderation: src/utils/openaiModeration.js (checkMessageModeration, formatViolations)
  * Analytics: src/utils/analyticsCollector.js (trackMessage, trackViolation, flushAnalyticsCritical)
  * Moderation logs: src/utils/modLog.js (sendModLog)
  * Locking/Redis: src/utils/lock.js (getLockRedis)
- Stores guild‑specific configuration in the database under the 'automod' key (enabled, bannedWords, filterInvites, filterLinks, filterPhishingLinks, raidDetection, maxMentions, maxCapsPercent, minAccountAge, spamThreshold, spamInterval, aiModeration, nsfwFilter, exemptChannels, exemptRoles).
- Interacts with the warnings system (getUserData/appendToUserArray for 'warnings' and 'warnings‑config') to track user violations and apply auto‑punishments.
- No external API endpoints; all interaction is via Discord gateway, internal database, and optional Redis for spam tracking.