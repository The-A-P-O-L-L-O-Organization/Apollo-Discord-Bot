# src/plugins/admin/commands/

## Responsibility
8 admin slash-command modules. Files present: `language.ts`, `logging.ts`, `migrate.ts`, `plugin.ts`, `queue.ts`, `reactionrole.ts`, `setlogchannel.ts`, `system.ts`.

## Files

| File | Purpose |
|---|---|
| `language.ts` | Sets the server language (BCP47 locale code). |
| `logging.ts` | Enables, disables, or shows status of server event logging. |
| `migrate.ts` | Shows status of or runs database migrations (bot owner only). |
| `plugin.ts` | Lists, enables, or disables bot plugins (bot owner only). |
| `queue.ts` | Displays BullMQ queue statistics and status (bot owner only). |
| `reactionrole.ts` | Creates and manages reaction-role bindings. |
| `setlogchannel.ts` | Sets, removes, or views the server event log channel. |
| `system.ts` | Displays bot system status and health (bot owner only). |

## Design
- Each file default-exports `{ data | name, description, options }` plus `async execute`. Subcommand routing via `interaction.options.getSubcommand`; permission gating with `PermissionFlagsBits` and owner checks; embeds for structured output; sanitized errors.
- Patterns: Command (each module encapsulates an action with `execute`), Chain of Responsibility (subcommand dispatcher delegates to the matching handler).

## Flow
1. Permission guard exits early without rights.
2. Dispatch subcommand, fetch state via `getGuildData`/`getDb`/queue metrics/migration runner.
3. Mutate config or trigger plugin/queue/migration action, persist, build reply.

## Integration
- Dependencies: `discord.js`, `src/utils/db.ts`, `src/config/config.ts`, `src/utils/safeError.ts`, `src/utils/discordErrors.ts`, `src/utils/accessControl.ts`, `src/core/PluginRegistry.ts` (plugin), `src/queue/metrics.ts` (queue), `src/db/knex.ts` (migrate), `ioredis` (system).
- Consumed by `AdminPlugin._loadCommands` and `scripts/deploy-commands.ts`.
