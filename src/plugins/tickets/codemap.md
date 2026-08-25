Responsibility
The tickets plugin manages the full lifecycle of support tickets, including creation via panel/button, closure, user addition/removal, SLA monitoring with breach alerts, transcript generation, and administrative CLI commands. It provides real-time ticket operations over socket interfaces and persists ticket data per guild.

Design
- Extends the base `Plugin` class, implementing `onEnable` and `onDisable` lifecycle methods.
- Uses the plugin manager to register and unregister socket handlers for ticket-related operations.
- Loads commands and events submodules via `_loadCommands`/`_loadEvents` and cleans them on disable.
- Starts an SLA monitor background process (`startSlaMonitor`) that periodically polls open tickets across guilds for SLA breaches and sends alerts via mod logs and ticket channels.
- Follows a modular architecture with separate `commands/`, `events/`, and `cli/` directories.
- Persists ticket data using the `utils/db` adapter (`getGuildData`, `updateGuildData`) with structures for `openTickets` and `closedTickets`.
- Utilizes utility modules for logging, SLA tracking, moderation logs, and configuration.

Flow
1. `onEnable`:
   - awaits `_loadCommands()` to register all ticket-related commands (e.g., `/ticket`, `/closeticket`, `/ticketadd`).
   - awaits `_loadEvents()` to load Discord event listeners (primarily `interactionCreate` for button interactions).
   - registers socket handlers under the `tickets` namespace:
     - `tickets.create`: creates a ticket for a given user.
     - `tickets.close`: closes a ticket by ID.
     - `tickets.add`: adds a user to a ticket.
     - `tickets.remove`: removes a user from a ticket.
   - invokes `startSlaMonitor(this.client)` to begin periodic SLA checks.
2. SLA Monitor (`events/slaMonitor.js`):
   - On start, performs an initial check of all tickets.
   - Sets a recurring interval (5 minutes) to poll all guilds with ticket configuration.
   - For each guild, fetches open tickets and evaluates them against configurable SLA thresholds.
   - On breach, sends alerts to moderation log and ticket channel, logs to mod log system, and respects cooldowns to avoid spam.
   - Provides `clearSlaAlert` and `getAlertedTickets` functions for external reset/introspection.
3. Button Interactions (`events/interactionCreate.js`):
   - Listens for `interactionCreate` events, filters for button clicks.
   - `create_ticket`: validates user doesn't have an open ticket, creates a private channel with appropriate permission overwrites, sends an embed with a close button, stores ticket data in guild DB.
   - `close_ticket`: verifies permissions (ticket owner, support role, or admin), fetches channel messages for transcript, saves transcript JSON to `data/transcripts/`, updates ticket stats, notifies ticket creator via DM, deletes channel after delay.
4. CLI (`cli/index.js`):
   - Exposes ticket management over socket for admin scripts or inter‑bot communication:
     - `list`: returns open/closed ticket counts and details.
     - `create`, `close`, `add`, `remove`: each requires `needsSocket: true` and appropriate options (user ID, ticket ID, reason).
   - These commands are invoked via the plugin manager's socket interface and map directly to the registered socket handlers.

Integration
- Depends on:
  - Core `Plugin` class (`../../core/Plugin.js`).
  - Database utilities (`../../utils/db.js`) for guild‑scoped ticket persistence.
  - Logger (`../../utils/logger.js`).
  - SLA tracker utilities (`../../utils/slaTracker.js`) for breach evaluation and formatting.
  - Moderation log utility (`../../utils/modLog.js`) for breach logging.
  - Configuration (`../../config/config.js`) for ticket prefixes, welcome messages, moderation channel names.
  - Discord.js (`discord.js`) for channel/button/interaction handling.
- Integrates with:
  - Other plugins via socket handlers (e.g., interlink or admin bots can trigger ticket creation/closure).
  - Frontend or admin tools that send socket requests to the `tickets.*` namespace.
  - Data layer: stores ticket information in guild‑specific JSON via `getGuildData`/`updateGuildData`; transcripts are written to `data/transcripts/` via `writeToSubDir`.
  - No direct dependencies on other plugins; all communication occurs through socket interfaces or shared utilities.