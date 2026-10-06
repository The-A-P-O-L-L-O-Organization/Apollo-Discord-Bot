# src/plugins/utility/events/

## Responsibility
Single handler `messageCreate.ts` for XP award and level-up announcements.

## Files

| File | Purpose |
|---|---|
| `messageCreate.ts` | Awards XP per message and announces level-ups. |

## Design
- Exports `{ name: 'messageCreate', once: false, execute }`. Uses `getLevelsConfig`, `isOnCooldown`, `awardXp` from `src/utils/xp.ts` and `EmbedBuilder` for level-up output. Skips DMs and bots, respects per-guild enable flag.
- Patterns: Observer (handler subscribed to `messageCreate` by name).

## Flow
1. `messageCreate` fires with `(message, client)`.
2. Load guild levels config; exit if disabled or on cooldown.
3. Award random XP in configured range; if `leveledUp` and announcements enabled, send embed.
4. Log structurally; swallow no rejections.

## Integration
- Dependencies: `src/utils/xp.ts`, `src/utils/logger.ts`, `discord.js`.
- Consumed by `UtilityPlugin._loadEvents` via Discord client registration.
