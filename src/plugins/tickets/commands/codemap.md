# src/plugins/tickets/commands/

## Responsibility
13 slash-command modules. Files present: `assign.ts`, `closeticket.ts`, `ticket.ts`, `ticketadd.ts`, `ticketinfo.ts`, `ticketlist.ts`, `ticketpriority.ts`, `ticketratings.ts`, `ticketsearch.ts`, `ticketsetup.ts`, `ticketstats.ts`, `tickettemplate.ts`, `tickettransfer.ts`.

## Files

| File | Purpose |
|---|---|
| `assign.ts` | Assigns the current ticket to a staff member. |
| `closeticket.ts` | Closes the current ticket with reason and transcript generation. |
| `ticket.ts` | Opens a new ticket channel from a reason and optional category. |
| `ticketadd.ts` | Adds a user to the current ticket channel. |
| `ticketinfo.ts` | Shows detailed information about the current or numbered ticket. |
| `ticketlist.ts` | Lists open tickets with status, priority, and category filters. |
| `ticketpriority.ts` | Changes the priority of the current ticket. |
| `ticketratings.ts` | Shows ticket rating statistics. |
| `ticketsearch.ts` | Searches the ticket archive by user, category, or assigned staff. |
| `ticketsetup.ts` | Configures the ticket system (panel, category, support role, status). |
| `ticketstats.ts` | Shows comprehensive ticket statistics. |
| `tickettemplate.ts` | Creates, deletes, lists, and views ticket templates. |
| `tickettransfer.ts` | Transfers the current ticket to another staff member. |

## Design
- Each file default-exports `{ data | name, description, options }` plus `async execute`. Stateless handlers; state in `src/utils/db.ts` guild ticket store. Permission checks for ManageChannels/support roles, duplicate-ticket guards, and setup preconditions.
- Patterns: Command (each module encapsulates an action with `execute`), State Machine (handlers drive open/assigned/priority/closed ticket transitions).

## Flow
1. Extract options and guild/user ids, validate permissions and preconditions.
2. Load ticket config/data via `getGuildData('tickets', guildId)`.
3. Branch: create channel with overwrites, modify permissions/priority/assignee, query/list/search, update setup/templates, or close with transcript generation.
4. Persist via `updateGuildData` or transcript writer; reply ephemerally on errors via `safeReply`/`safeFollowUp`.

## Integration
- Dependencies: `discord.js`, `src/utils/db.ts`, `src/config/config.ts`, `src/utils/slaTracker.ts`, `src/utils/discordErrors.ts`, `src/utils/logger.ts`.
- Consumed by `TicketsPlugin._loadCommands` and `scripts/deploy-commands.ts`.
