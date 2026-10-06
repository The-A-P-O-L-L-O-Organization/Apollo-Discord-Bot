# src/plugins/integrations/commands/

## Responsibility
Single slash module `integration.ts` with subcommands `add`, `remove`, `list` for Twitch, YouTube, GitHub, and RSS subscriptions.

## Files

| File | Purpose |
|---|---|
| `integration.ts` | Adds, removes, and lists Twitch/YouTube/GitHub/RSS subscriptions. |

## Design
- Default-exports `{ data | name, description, options }` plus `async execute`. Subcommand dispatch to `handleAdd`, `handleRemove`, `handleList` with `getData`/`setData` persistence, permission gating, and sanitized error replies.
- Patterns: Command (module encapsulates the integration action with `execute`), Strategy (add/remove/list handlers selected by subcommand).

## Flow
1. Interaction routed to `integration.ts` execute.
2. `add` validates target, increments id, appends subscription; `remove` filters by id and guild; `list` reads guild subscriptions and formats embed.
3. Replies via `safeReply`/`safeFollowUp`; errors via `handleDiscordError`.

## Integration
- Dependencies: `discord.js`, `src/utils/db.ts`, `src/utils/discordErrors.ts`, `src/utils/logger.ts`.
- Consumed by `IntegrationsPlugin._loadCommands` and `scripts/deploy-commands.ts`.
