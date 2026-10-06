# src/plugins/moderation/events/

## Responsibility
Membership lifecycle handling: `guildMemberAdd.ts` and `guildMemberRemove.ts` for autorole, role persistence, blacklist enforcement, raid detection, welcome/farewell logging, and analytics.

## Files

| File | Purpose |
|---|---|
| `guildMemberAdd.ts` | Handles joins: raid check, blacklist ban, autorole, role restore, welcome log. |
| `guildMemberRemove.ts` | Handles leaves: persists roles for rejoin restore and logs the farewell. |

## Design
- Each file exports `{ name, once, execute }`. `guildMemberAdd` handles raid check, blacklist ban, autorole assignment, role restore, join embed; `guildMemberRemove` saves roles for persistence and logs leave embed.
- Redis-backed raid detection with in-memory fallback; `withLock` semantics where coordination is required. Bounded timeouts and safe fallbacks on external calls.
- Patterns: Observer (handlers subscribed to `guildMemberAdd`/`guildMemberRemove` by name).

## Flow
1. `guildMemberAdd`: track join, raid pattern check, blacklist check with ban on hit, assign autorole, restore persisted roles, log join embed, send welcome where configured.
2. `guildMemberRemove`: ignore bots, track leave, persist roles excluding `@everyone`, log leave embed.
3. Errors logged structurally; user-facing output kept safe.

## Integration
- Dependencies: `src/utils/logger.ts`, `src/utils/db.ts`, `src/utils/modLog.ts`, `src/utils/raidDetection.ts`, `src/utils/lock.ts`, `src/utils/analyticsCollector.ts`, `src/config/config.ts`, `discord.js`.
- Consumed by Discord client event registration via `ModerationPlugin._loadEvents`.
