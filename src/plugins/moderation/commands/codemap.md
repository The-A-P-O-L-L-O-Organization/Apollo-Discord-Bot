# src/plugins/moderation/commands/

## Responsibility
40 slash-command modules implementing hierarchy-safe moderation actions. Files present: `autorole.ts`, `ban.ts`, `blacklist.ts`, `case.ts`, `clear.ts`, `clearstrikes.ts`, `clearwarnings.ts`, `forceban.ts`, `kick.ts`, `lockdown.ts`, `masskick.ts`, `massmute.ts`, `mute.ts`, `nickname.ts`, `note.ts`, `purge.ts`, `raidmode.ts`, `reportMessage.ts`, `reports.ts`, `rolepersistence.ts`, `slowmode.ts`, `softban.ts`, `strike.ts`, `strikeconfig.ts`, `strikes.ts`, `tempban.ts`, `temprole.ts`, `timeout.ts`, `unban.ts`, `unlock.ts`, `unmute.ts`, `voicedeafen.ts`, `voicedisconnect.ts`, `voicemove.ts`, `voicemute.ts`, `voiceundeafen.ts`, `voiceunmute.ts`, `warn.ts`, `warnconfig.ts`, `warnings.ts`.

## Files

| File | Purpose |
|---|---|
| `autorole.ts` | Configures automatic role assignment for new members (set/view/reset). |
| `ban.ts` | Bans a user from the server with reason, case creation, and mod-log entry. |
| `blacklist.ts` | Manages the server join blacklist (add/remove/list, auto-ban on join). |
| `case.ts` | Views and manages moderation cases (lookup, update, delete). |
| `clear.ts` | Bulk-deletes messages in the current channel with confirmation buttons. |
| `clearstrikes.ts` | Clears some or all strikes for a user. |
| `clearwarnings.ts` | Clears some or all warnings for a user. |
| `forceban.ts` | Bans a user by ID even when they are not in the server. |
| `kick.ts` | Kicks a user from the server with reason, case, and mod-log entry. |
| `lockdown.ts` | Locks a channel to prevent `@everyone` from sending messages. |
| `masskick.ts` | Kicks multiple users in one action with per-target hierarchy checks. |
| `massmute.ts` | Times out multiple users in one action. |
| `mute.ts` | Temporarily mutes a user (timeout-backed) with duration and reason. |
| `nickname.ts` | Changes a member's nickname. |
| `note.ts` | Adds and manages internal moderator notes on users. |
| `purge.ts` | Deletes multiple messages from a channel with user and count filters. |
| `raidmode.ts` | Enables, disables, or checks raid mode (locks all channels when on). |
| `reportMessage.ts` | Message context-menu command that reports a message to moderators. |
| `reports.ts` | Lists and reviews user-submitted message reports (pending/all). |
| `rolepersistence.ts` | Configures whether roles are restored when members rejoin. |
| `slowmode.ts` | Sets a channel's slowmode rate limit. |
| `softban.ts` | Softbans a user (ban plus immediate unban to clear messages). |
| `strike.ts` | Issues a strike to a user (more severe than a warning). |
| `strikeconfig.ts` | Configures strike thresholds and automatic punishments. |
| `strikes.ts` | Shows a user's strike history with active/expired status. |
| `tempban.ts` | Temporarily bans a user with automatic unban via the scheduler. |
| `temprole.ts` | Assigns a role that expires after a set duration. |
| `timeout.ts` | Applies a Discord native timeout with duration validation. |
| `unban.ts` | Unbans a previously banned user and clears related tempban state. |
| `unlock.ts` | Unlocks a previously locked channel. |
| `unmute.ts` | Removes a mute/timeout from a previously muted user. |
| `voicedeafen.ts` | Server-deafens a member in voice. |
| `voicedisconnect.ts` | Disconnects a member from voice. |
| `voicemove.ts` | Moves a member (or members) to another voice channel. |
| `voicemute.ts` | Server-mutes a member in voice. |
| `voiceundeafen.ts` | Removes server-deafen from a member in voice. |
| `voiceunmute.ts` | Removes server-mute from a member in voice. |
| `warn.ts` | Issues a warning to a user with auto-mute escalation support. |
| `warnconfig.ts` | Configures warning thresholds and auto-mute behavior. |
| `warnings.ts` | Shows a user's warning history. |

## Design
- Each file default-exports `{ data | name, description, options }` plus `async execute(interaction)`. No invented commands beyond the directory listing.
- Validation before use: Discord options, snowflakes, durations, quantities, role/channel targets; `canModerate` hierarchy check; safe user-facing errors without stack/SQL/paths.
- Shared helpers: case creation, mod-log dispatch, analytics tracking, structured pino logging with guild/command context.
- Patterns: Command (each module encapsulates an action with `execute`), Strategy (interchangeable command handlers selected by name).

## Flow
1. Interaction routed by command name to module `execute`.
2. Extract options via `interaction.options.get*`, validate target and permissions.
3. Perform Discord action (ban/kick/timeout/mute/voice move/channel overwrite/purge).
4. Create case, send mod log, track analytics, reply with embed.
5. Errors mapped via `safeError` and `handleDiscordError` with `safeReply`/`safeFollowUp`.

## Integration
- Dependencies: `discord.js`, `src/utils/db.ts`, `src/utils/modLog.ts`, `src/utils/moderation.ts`, `src/utils/analyticsCollector.ts`, `src/utils/safeError.ts`, `src/utils/discordErrors.ts`, `src/utils/logger.ts`.
- Consumed by `ModerationPlugin._loadCommands` and `scripts/deploy-commands.ts`; socket mirrors in `moderation/cli` and `moderation/plugin.ts` handlers.
