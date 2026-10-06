# src/plugins/utility/commands/

## Responsibility
31 slash-command modules plus `analytics/` dispatcher helpers. Files present: `8ball.ts`, `analytics.ts`, `announcement.ts`, `apollo.ts`, `apolloActions.ts`, `avatar.ts`, `banner.ts`, `cancelreminder.ts`, `channelinfo.ts`, `datadeletion.ts`, `embed.ts`, `giveaway.ts`, `help.ts`, `invite.ts`, `joke.ts`, `leaderboard.ts`, `level.ts`, `operatorcontact.ts`, `ping.ts`, `poll.ts`, `remind.ts`, `reminders.ts`, `report.ts`, `roleinfo.ts`, `roll.ts`, `serverinfo.ts`, `sla.ts`, `stats.ts`, `tag.ts`, `translate.ts`, `userinfo.ts`; subdir `analytics/` holds `activityStats.ts`, `commandStats.ts`, `exportStats.ts`, `moderationStats.ts`, `serverStats.ts`, `userStats.ts`.

## Files

| File | Purpose |
|---|---|
| `8ball.ts` | Answers a question with a random magic 8-ball response. |
| `analytics.ts` | Dispatcher for the `/analytics` subcommands (server/commands/activity/moderation/user/export). |
| `analytics/activityStats.ts` | Reports message activity statistics over a day window. |
| `analytics/commandStats.ts` | Reports command usage statistics by command. |
| `analytics/exportStats.ts` | Exports analytics data to a file in the requested format. |
| `analytics/moderationStats.ts` | Reports moderation team action statistics. |
| `analytics/serverStats.ts` | Reports server-wide statistics for the guild. |
| `analytics/userStats.ts` | Reports per-user activity and command statistics. |
| `announcement.ts` | Schedules an announcement to be sent at a later time. |
| `apollo.ts` | Shows information about The A.P.O.L.L.O Organization (info/docs). |
| `apolloActions.ts` | Owner-only message context actions (e.g. Global Ban). |
| `avatar.ts` | Displays a user's avatar. |
| `banner.ts` | Displays a user's banner image (requires Nitro). |
| `cancelreminder.ts` | Cancels a scheduled reminder by ID. |
| `channelinfo.ts` | Displays detailed information about a channel. |
| `datadeletion.ts` | Handles user requests to delete all bot-stored data about them. |
| `embed.ts` | Creates a custom embed message from options or a Markdown file. |
| `giveaway.ts` | Creates and manages giveaways (create/reroll/end). |
| `help.ts` | Lists available commands with descriptions and usage. |
| `invite.ts` | Generates an invite link or creates a server invite. |
| `joke.ts` | Sends a random joke. |
| `leaderboard.ts` | Shows the top users by level or XP. |
| `level.ts` | Shows a user's current level and experience points. |
| `operatorcontact.ts` | Shows the bot operator's contact information. |
| `ping.ts` | Checks the bot's latency and response time. |
| `poll.ts` | Creates a poll with options and vote tracking. |
| `remind.ts` | Sets a reminder delivered after a duration. |
| `reminders.ts` | Lists the caller's active reminders. |
| `report.ts` | Message context-menu command that reports a message to moderators. |
| `roleinfo.ts` | Displays detailed information about a role. |
| `roll.ts` | Rolls dice and returns random numbers (e.g. 2d6). |
| `serverinfo.ts` | Displays information about the server. |
| `sla.ts` | Shows SLA metrics and response-time statistics. |
| `stats.ts` | Displays bot statistics (uptime, guilds, users). |
| `tag.ts` | Creates and manages custom text commands (tags). |
| `translate.ts` | Message context-menu command that translates message content. |
| `userinfo.ts` | Displays information about a user. |

## Design
- Each file default-exports `{ data | name, description, options }` plus `async execute`. `analytics.ts` is a thin dispatcher importing the six `analytics/` handlers; handlers do not import the dispatcher.
- Validation before use for options, snowflakes, durations, channel/role targets; safe embeds with escaped user content; owner-only gating for `apolloActions`.
- Patterns: Command (each module encapsulates an action with `execute`), Strategy (interchangeable handlers selected by command/subcommand name).

## Flow
1. Interaction routed by command name; `analytics` further switches on subcommand to the matching handler.
2. Handler reads `src/utils/db.ts` or scheduler/collector state, builds `EmbedBuilder` reply.
3. Responds via `reply`/`editReply`/`followUp`; errors sanitized via `safeError` and `handleDiscordError`.

## Integration
- Dependencies: `src/utils/xp.ts`, `src/utils/reminderScheduler.ts`, `src/utils/pollScheduler.ts`, `src/utils/analyticsCollector.ts`, `src/utils/translation.ts`, `src/utils/db.ts`, `src/utils/logger.ts`, `src/utils/discordErrors.ts`, `discord.js`.
- Consumed by `UtilityPlugin._loadCommands` and `scripts/deploy-commands.ts`.
