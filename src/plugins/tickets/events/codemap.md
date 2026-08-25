Responsibility
The directory contains event handlers for the ticket plugin. It processes Discord interactions (button clicks) to manage the ticket lifecycle and runs a periodic SLA monitor to track open tickets for SLA breaches and send alerts.

Design
- interactionCreate.js follows the discord.js event listener pattern with an `execute` function that routes button `customId` values to specific handlers (`handleCreateTicket`, `closeTicket`).
- slaMonitor.js implements a polling‑based scheduler (initial check + `setInterval`) that iterates over all guilds with ticket configuration, checks each open ticket against SLA thresholds, and triggers breach alerts via mod‑log, ticket channel, and direct user notifications.
- Both files use repository abstractions (`getGuildData`, `updateGuildData`, `getAllGuildIds`) for persistence, utility factories (`generateId`, `writeToSubDir`), and discord.js builders for embeds, buttons, and channel lookups.
- The SLA monitor avoids spam with an in‑memory alert cooldown map (`alertedTickets`) and batch processing of guilds.

Flow
**Interaction flow (interactionCreate.js)**
1. A Discord `interactionCreate` event is received; if it is not a button, the listener exits.
2. The `customId` is examined:
   - `create_ticket` → `handleCreateTicket`:
     * Reads guild ticket configuration.
     * Prevents duplicate user tickets.
     * Creates a text channel with permission overwrites (bot, user, support role, @everyone denied).
     * Sends an embed with a close button.
     * Persists ticket data (ID, number, channel, user, timestamps) to the database.
     * Confirms creation to the user.
   - `close_ticket` → `handleCloseTicket`:
     * Validates requester permissions (ticket owner, support role, or administrator).
     * Fetches channel messages to build a transcript.
     * Saves the transcript as a JSON file via `writeToSubDir`.
     * Updates the database: moves ticket from `openTickets` to `closedTickets`, optionally DMs the creator.
     * Schedules channel deletion after a 3‑second delay.
   State transitions: ticket moves from non‑existent → open (creation) → closed (close) with corresponding DB writes, channel creation/deletion, and transcript file generation.

**SLA monitoring flow (slaMonitor.js)**
1. On startup, `startSlaMonitor` logs and performs an immediate ticket check, then sets a recurring interval (5 minutes).
2. Each tick:
   * Retrieves all guild IDs that have ticket configuration via `getAllGuildIds('tickets')`.
   * Processes guilds in batches (size 10) to avoid blocking.
   * For each guild, loads its ticket config and iterates over `openTickets`.
   * For each ticket, `hasBreachedSLA` (from `slaTracker.js`) evaluates elapsed time against priority‑based thresholds.
   * On breach, `handleSlaBreach`:
     - Checks/updates an in‑memory alert map (`alertedTickets`) with cooldown (30 minutes) to prevent spam.
     - Builds an embed with breach details (priority, elapsed time, threshold, channel, creator).
     - Sends the embed to the guild’s moderation log channel (pinging support role if configured) and to the ticket channel itself.
     * Logs the breach via the mod‑log system (`sendModLog`).
     * Records the alert for future cooldown checks.
   * Periodically trims the alert map to keep memory bounded.

Integration
Dependencies:
- discord.js (EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags)
- Internal utilities:
  - `../../../utils/db.js`: `getGuildData`, `updateGuildData`, `writeToSubDir`, `getAllGuildIds`
  - `../../../utils/logger.js`: `logger`
  - `../../../config/config.js`: `config`
  - `../../../utils/slaTracker.js`: `hasBreachedSLA`, `DEFAULT_SLA_THRESHOLDS`, `formatTime`, `getPriorityColor`, `getPriorityEmoji`
  - `../../../utils/modLog.js`: `sendModLog`
- Consumers:
  - The Discord client registers `interactionCreate.js` as an `interactionCreate` event listener.
  - The `slaMonitor.js` module is invoked from the ticket plugin’s main entry point (e.g., `plugin.js`) via `startSlaMonitor(client)` to begin periodic SLA checks.
  - No other internal modules directly depend on these files, but they are essential parts of the ticket plugin’s functionality.