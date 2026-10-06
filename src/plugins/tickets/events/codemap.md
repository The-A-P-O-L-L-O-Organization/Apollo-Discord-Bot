# src/plugins/tickets/events/

## Responsibility
Two handlers: `interactionCreate.ts` for ticket button lifecycle and `slaMonitor.ts` for periodic SLA breach polling.

## Files

| File | Purpose |
|---|---|
| `interactionCreate.ts` | Routes ticket button presses (`create_ticket`/`close_ticket`) to guarded handlers. |
| `slaMonitor.ts` | Polls open tickets on an interval and alerts on SLA breaches. |

## Design
- `interactionCreate.ts` exports `{ name, once, execute }` routing `customId` values `create_ticket` and `close_ticket` to guarded handlers with permission checks and transcript generation.
- `slaMonitor.ts` exports `startSlaMonitor` performing an immediate check then `setInterval` polling, batching guilds, tracking alert cooldowns in memory with bounded trimming.
- Patterns: Observer (button/interaction handlers subscribed by name), Strategy (customId-routed create/close handlers).

## Flow
1. Button create: validate config and duplicate, create channel with overwrites, post close control, persist ticket, confirm.
2. Button close: validate owner/support/admin, fetch messages for transcript, move open to closed, DM creator, schedule channel deletion.
3. SLA tick: list guild ids with ticket config, evaluate `hasBreachedSLA` per open ticket, emit mod-log plus channel alert once per cooldown.

## Integration
- Dependencies: `discord.js`, `src/utils/db.ts`, `src/utils/logger.ts`, `src/config/config.ts`, `src/utils/slaTracker.ts`, `src/utils/modLog.ts`.
- Consumed by `TicketsPlugin` (`_loadEvents` and `startSlaMonitor` call on enable).
