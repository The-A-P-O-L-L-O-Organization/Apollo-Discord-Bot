# src/plugins/utility/

## Responsibility
This plugin provides general utility functionality for the Apollo Discord Bot, including information commands (serverinfo, userinfo, avatar, etc.), fun commands (8ball, joke, roll, embed), XP/leveling system, reminder and poll scheduling, analytics and statistics collection, privacy/legal tools (data deletion, operator contact), and additional utility features (help, ping, invite, translate, tag, giveaway, announcement, apollo info).

## Design
The plugin follows the base Plugin contract by extending the Plugin class from src/core/Plugin.js. It implements lifecycle methods:
- onEnable(): loads commands via _loadCommands(), loads events via _loadEvents(), registers socket handlers via _registerSocketHandlers(), initializes schedulers (reminder, poll, analytics), and initializes the translation service.
- onDisable(): unloads commands and events, stops schedulers.
Command and event loading follows the pattern of scanning the respective subdirectories and registering each file with the plugin manager.
Socket handlers are registered for utility.* actions (serverinfo, userinfo, ping, embed) to provide programmatic access to utility functions.
The plugin uses dependency injection for schedulers and translation service, storing the translation service globally.

## Flow
Upon enabling, the plugin:
1. Dynamically imports all command files from src/plugins/utility/commands/ and registers them with the command handler.
2. Dynamically imports all event files from src/plugins/utility/events/ and registers them with the event handler.
3. Registers socket handlers for utility.* actions that perform synchronous operations (e.g., fetching guild/user info) or asynchronous operations (e.g., generating embeds from markdown files).
4. Initializes reminder, poll, and analytics schedulers, passing the Discord client instance.
5. Initializes the translation service and assigns it to global.translationService.
Upon disabling, the plugin reverses these steps: unloads commands/events, stops schedulers.
Command execution flow: interaction → plugin command handler → specific command function → logic (may involve utils/db) → response.
Event flow: Discord event → plugin event handler → specific event function → logic.
Socket handler flow: manager request → registered utility.* handler → logic → result returned to caller.

## Integration
The plugin imports and integrates with the following modules:
- src/utils/reminderScheduler.js: initReminderScheduler, stopReminderScheduler
- src/utils/pollScheduler.js: initPollScheduler, stopPollScheduler
- src/utils/analyticsCollector.js: initAnalyticsCollector, stopAnalyticsCollector
- src/utils/translation.js: TranslationService class
- src/utils/markdownParser.js: parseMarkdownToEmbed function (used in embed socket handler)
- src/utils/startupChecks.js: registerCommand function (imported by command files)
- src/core/Plugin.js: base Plugin class
- src/db/: database interactions (used by various commands for XP, reminders, polls, analytics, tags, etc.)
- External: discord.js, fs, path (used within socket handlers and commands)

## Directory Structure
- plugin.js: Main plugin class extending core Plugin
- commands/: Utility command implementations
  - 8ball.js, announcement.js, apollo.js, apolloActions.js, avatar.js, banner.js, cancelreminder.js, channelinfo.js, datadeletion.js, embed.js, giveaway.js, help.js, invite.js, joke.js, level.js, leaderboard.js, operatorcontact.js, ping.js, poll.js, remind.js, reminders.js, report.js, roleinfo.js, serverinfo.js, sla.js, stats.js, tag.js, translate.js, userinfo.js, analytics.js
- events/: Event listeners
  - messageCreate.js: Handles message events for XP/leveling and other utilities
- cli/: Command-line interface for utility plugin
  - index.js: CLI entry point for utility commands