# src/plugins/tickets/

## Responsibility
Full ticket lifecycle: panel/button creation, assignment, priority, transfer, add/remove users, close with transcript, search/list/stats/ratings, setup and templates, plus SLA monitoring and CLI access. Backed by `commands/` (13 files), `events/` (2 files), and `cli/`.

## Files

| File | Purpose |
|------|---------|
| `plugin.ts` | Defines TicketsPlugin class starting the SLA monitor on enable |

Subdirectories: `commands/`, `events/`, `cli/`, `locales/`.

## Design
- Class `TicketsPlugin` in `plugin.ts` extends `src/core/Plugin.ts` (`id = 'tickets'`, `version 1.0.0`). `onEnable` loads commands/events, registers `tickets.*` socket handlers, starts SLA monitor; `onDisable` unloads and stops alerts. Idempotent.
- Commands default-export `{ data | name, description, options }`; events export `{ name, once, execute }`.
- Persistence via `src/utils/db.ts` (`getGuildData`, `updateGuildData`) with `openTickets`/`closedTickets`; transcripts written under gitignored runtime state, never committed.
- i18n namespace `tickets`, locales in `locales/<locale>/common.json` (6 locales, `en-US` canonical, fixed translators, informal `du`).
- Patterns: Template Method (plugin lifecycle hooks), Command (command modules with `execute`), Observer (event handlers subscribed by name), State Machine (open to closed ticket transitions with transcript).

## Flow
1. Enable: `_loadCommands`, `_loadEvents`, register `tickets.create`, `tickets.close`, `tickets.add`, `tickets.remove`, call `startSlaMonitor(client)`.
2. Interaction/button path creates private channel with overwrites, posts close control, persists metadata; close builds transcript, moves open to closed, DMs creator, deletes channel after delay.
3. SLA path polls open tickets on interval with alert cooldown to avoid spam.
4. CLI path serves `list` locally and forwards mutations over socket.
5. Disable: unload commands/events, clear SLA timer and alert map.

## Integration
- Utilities: `src/utils/db.ts`, `src/utils/logger.ts`, `src/utils/slaTracker.ts`, `src/utils/modLog.ts`, `src/config/config.ts`, `discord.js`.
- Consumers: Discord slash/button router, `bin/apollo.ts` via socket, admin/interlink callers.
