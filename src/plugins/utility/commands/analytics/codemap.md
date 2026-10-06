# src/plugins/utility/commands/analytics/

## Responsibility
Subcommand handlers behind the `/analytics` dispatcher. Each module implements one statistics view over guild activity, command usage, moderation actions, or user engagement.

## Files

| File | Purpose |
|------|---------|
| `activityStats.ts` | Reports message activity statistics over a day window. |
| `commandStats.ts` | Reports command usage statistics by command. |
| `exportStats.ts` | Exports analytics data to a file in the requested format. |
| `moderationStats.ts` | Reports moderation team action statistics. |
| `serverStats.ts` | Reports server-wide statistics for the guild. |
| `userStats.ts` | Reports per-user activity and command statistics. |

## Design
- Patterns: Command (one handler per subcommand, invoked by the `analytics.ts` dispatcher), Strategy (each file encapsulates one aggregation strategy over the shared analytics store).
- Handlers do not import the dispatcher; dependency flows one way from `analytics.ts` into this directory.
- Reads go through `src/utils/analyticsCollector.ts` aggregates; user content is escaped before rendering into embeds.

## Flow
1. `/analytics <subcommand>` arrives at `analytics.ts`, which routes to the matching handler here.
2. Handler loads aggregates for the guild and window, validates options, and builds an embed or export file.
3. Reply is sent ephemerally where the data is sensitive to the requester.

## Integration
- Consumed by: `src/plugins/utility/commands/analytics.ts` dispatcher.
- Depends on: `src/utils/analyticsCollector.ts`, `src/utils/db.ts`, `src/utils/logger.ts`, discord.js embeds.
