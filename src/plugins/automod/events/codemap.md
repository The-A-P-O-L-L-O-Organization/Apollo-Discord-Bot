# src/plugins/automod/events/

## Responsibility
Single handler `messageCreate.ts` running the ordered automod check pipeline with centralized violation handling.

## Files

| File | Purpose |
|---|---|
| `messageCreate.ts` | Runs the ordered automod check pipeline on every guild message. |

## Design
- Exports `{ name: 'messageCreate', once: false, execute }`. Modular checks imported from `src/utils/automod.ts` plus AI, NSFW, raid, and Redis spam helpers. Per-user 5-second violation cooldown; account-age and raid patterns warn without delete on first pass.
- Patterns: Observer (handler subscribed to `messageCreate` by name), Chain of Responsibility (ordered check pipeline ending in centralized violation handling).

## Flow
1. Ignore DMs, track analytics, load guild automod config, exit if disabled or exempt.
2. Run checks in order: account age, banned words, invites, links, phishing, mentions, caps, spam (Redis or memory), raid, AI moderation, NSFW attachments.
3. On violation: track, set cooldown, delete where flagged, append warning, evaluate auto-punish thresholds, send temporary embed, write mod log.

## Integration
- Dependencies: `src/utils/automod.ts`, `src/utils/db.ts`, `src/utils/modLog.ts`, `src/config/config.ts`, `src/utils/analyticsCollector.ts`, `src/utils/openaiModeration.ts`, `src/utils/nsfwDetection.ts`, `src/utils/raidDetection.ts`, `src/utils/lock.ts`, `discord.js`.
- Consumed by `AutomodPlugin._loadEvents`.
