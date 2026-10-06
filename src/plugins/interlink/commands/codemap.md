# src/plugins/interlink/commands/

## Responsibility
Single owner-only slash module `interlink.ts` with subcommands `list`, `register`, `remove`, `send`, `broadcast`, `rotate-key` (retired guidance), and `override`.

## Files

| File | Purpose |
|---|---|
| `interlink.ts` | Owner-only cross-bot management (list/register/remove/send/broadcast/rotate-key/override). |

## Design
- Default-exports `{ data | name, description, options }` plus `async execute`. Owner gating via `isOwner`/`getOwnerIds`; Go-backed RPCs via `getInterlinkClient`; sensitive output directed to ephemeral replies/DMs; errors sanitized with `safeError`.
- Patterns: Command (module encapsulates the cross-bot action with `execute`), Facade (single command surface over `InterlinkConnectClient` RPCs).

## Flow
1. Defer ephemerally, verify owner against `OWNER_IDS`.
2. Extract subcommand and dispatch to list/register/remove/send/broadcast/rotate-key/override handler.
3. Call `InterlinkConnectClient` (`listBots`, `registerBot`, `unregisterBot`, `send`); `broadcast` and `override` use target `*` fan-out.
4. Format embed result via `editReply`/`followUp`.

## Integration
- Dependencies: `./connectClient.ts`, `src/db/knex.ts`, `src/utils/safeError.ts`, `src/utils/accessControl.ts`, `src/utils/discordErrors.ts`, `src/utils/logger.ts`, `discord.js`.
- Consumed by `InterlinkPlugin` command loader.
