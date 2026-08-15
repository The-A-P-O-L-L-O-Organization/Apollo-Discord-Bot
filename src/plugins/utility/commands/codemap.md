## Responsibility

This folder contains general utility commands for the Apollo Discord Bot.

## Design

Each command follows a standard pattern:
- It exports a function with a specific signature that is handled by the plugin command handler.
- It registers a slash command using the `registerCommand` function from `src/utils/startupChecks`.

## Flow

A utility command flows through the following steps:
- The command is triggered by a user interaction (e.g., a slash command) handled by the Discord client.
- The interactionCreate event is routed to the plugin's command handler in `src/plugins/utility/index.js`.
- The handler identifies the command name and imports the corresponding module from `src/plugins/utility/commands/`.
- The handler calls the module's `execute(interaction)` async function.
- The command function processes the interaction, potentially deferring the reply, performing logic (e.g., database queries via `src/utils/db.js`, utility functions), and constructing a response.
- The command sends the response back to Discord via `interaction.editReply()` or `interaction.followUp()`.
- Any errors are caught and logged, with an error message sent to the user.

## Integration

Utility commands import various functions and modules from other parts of the bot, including:
- `src/utils/xp.js`: XP-related functions.
- `src/utils/reminderScheduler.js`: Reminder scheduling functions.
- `src/utils/pollScheduler.js`: Poll scheduling functions.
- `src/utils/analyticsCollector.js`: Analytics collection functions.
- `src/utils/translation.js`: Translation functions.
- `src/utils/charts.js`: Chart generation functions.
- `src/utils/markdownParser.js`: Markdown parsing functions.
- `src/utils/startupChecks.js`: Startup check functions.
- `src/core`: Core bot functionality.
- `src/db`: Database interactions.

## Commands

### Info Commands

- `channelinfo.js`: Display detailed information about a channel.
- `roleinfo.js`: Display detailed information about a role.
- `serverinfo.js`: Display information about the server.
- `userinfo.js`: Displays information about a user.
- `avatar.js`: Displays a user's avatar.
- `banner.js`: Displays a user's banner image (requires Nitro).

### Fun Commands

- `8ball.js`: Ask the magic 8-ball a question.
- `joke.js`: Get a random joke.
- `roll.js`: Roll dice for random numbers.
- `embed.js`: Create a custom embed message.

### XP/Leveling

- `level.js`: View your current level and experience points.
- `leaderboard.js`: Show the top users by level or XP.

### Reminders/Polls

- `remind.js`: Set a reminder.
- `reminders.js`: List your active reminders.
- `cancelreminder.js`: Cancel a reminder.
- `poll.js`: Create a poll.

### Analytics/Stats

- `analytics.js`: View server analytics and statistics.
- `stats.js`: Display bot statistics.
- `sla.js`: View SLA metrics and response time statistics.

### Privacy/Legal

- `datadeletion.js`: Request deletion of all data the bot has stored about you.
- `operatorcontact.js`: View the contact information for this bot instance's operator.

### Utility

- `apollo.js`: Get information about The A.P.O.L.L.O Organization.
- `apolloActions.js`: Globally ban a user (owner only).
- `announcement.js`: Schedule an announcement to be sent.
- `giveaway.js`: Create and manage giveaways.
- `help.js`: Shows all available commands with descriptions and usage.
- `invite.js`: Generate an invite link or create a server invite.
- `ping.js`: Check the bot's latency and response time.
- `report.js`: Report a message to the moderators.
- `tag.js`: Create and manage custom text commands.
- `translate.js`: Translate text to another language.