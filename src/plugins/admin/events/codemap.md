# src/plugins/admin/events/

## Responsibility
11 audit-log and automation listeners. Files present: `guildBanAdd.ts`, `guildBanRemove.ts`, `guildCreate.ts`, `guildDelete.ts`, `guildMemberUpdate.ts`, `messageDelete.ts`, `messageDeleteBulk.ts`, `messageReactionAdd.ts`, `messageReactionRemove.ts`, `messageUpdate.ts`, `voiceStateUpdate.ts`.

## Files

| File | Purpose |
|---|---|
| `guildBanAdd.ts` | Logs ban events with audit-log moderator and reason enrichment. |
| `guildBanRemove.ts` | Logs unban events with audit-log enrichment. |
| `guildCreate.ts` | Handles new-guild setup (initial config and getting-started message). |
| `guildDelete.ts` | Handles guild removal (cleanup and logging). |
| `guildMemberUpdate.ts` | Logs role-change diffs for members. |
| `messageDelete.ts` | Logs single message deletions. |
| `messageDeleteBulk.ts` | Logs bulk message deletions. |
| `messageReactionAdd.ts` | Applies reaction-role assignment on reaction add. |
| `messageReactionRemove.ts` | Removes reaction-role assignment on reaction remove. |
| `messageUpdate.ts` | Logs message edits (before/after content). |
| `voiceStateUpdate.ts` | Logs voice channel join/leave/move transitions. |

## Design
- Each file exports `{ name, once: false, execute }`. Early returns for bots and partials, audit-log enrichment for moderator/reason, embed construction delegated to logger helpers, persistence via `logEvent`.
- Patterns: Observer (handlers subscribed to Discord events by name).

## Flow
1. Discord emits event with entity plus client.
2. Validate and fetch configuration (`getGuildData`) and audit logs where needed.
3. Build embed, call `logEvent(guild, eventType, embed)`.
4. Apply side effects: reaction-role add/remove; role-change diff logging; voice transition logging.

## Integration
- Dependencies: `src/utils/logger.ts`, `src/utils/db.ts`, `src/config/config.ts`, `discord.js`.
- Consumed by `AdminPlugin._loadEvents` via Discord client registration.
