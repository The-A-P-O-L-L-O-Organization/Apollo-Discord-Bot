# src/plugins/automod/

## Responsibility
Automatic moderation: banned-word filtering, invite/link/phishing blocking, mention/caps/spam detection, raid detection, OpenAI moderation, NSFW image filtering, and channel/role exemptions. Backed by `commands/automod.ts`, `commands/scanMessage.ts`, `commands/automod/` handlers, `events/messageCreate.ts`, and `cli/`.

## Files

| File | Purpose |
|------|---------|
| `plugin.ts` | Defines AutomodPlugin class with TensorFlow resource limits |

Subdirectories: `commands/`, `events/`, `cli/`, `locales/`.

## Design
- Class `AutomodPlugin` in `plugin.ts` extends `src/core/Plugin.ts` (`id = 'automod'`, `version 1.0.0`, plus `resourceLimits` for TensorFlow/NSFW workloads). `onEnable` loads commands/events; `onDisable` unloads. Idempotent.
- Slash dispatcher plus context-menu scanner; event pipeline runs ordered checks with centralized `handleViolation`.
- Redis spam/raid tracking via `src/utils/lock.ts` with in-memory fallback; violations feed warnings system for auto-punish (ban/kick/mute).
- i18n namespace `automod`, locales in `locales/<locale>/common.json` (6 locales, `en-US` canonical, fixed translators, informal `du`).
- Patterns: Template Method (plugin lifecycle hooks), Chain of Responsibility (ordered automod check pipeline with centralized `handleViolation`), Observer (event handler subscribed by name).

## Flow
1. Enable: `_loadCommands`, `_loadEvents`.
2. Slash path: subcommand handler reads `getGuildData('automod', guild)`, mutates flags/lists, persists via `setGuildData`, replies with embed.
3. Context path: right-click scan checks attachments via `checkMessageAttachments` and optionally deletes.
4. Message path: ignore DMs/exempts, run account-age, word, invite, link, phishing, mention, caps, spam, raid, AI, NSFW checks; first violation triggers warn, delete, threshold punishment, mod-log.
5. Disable: unload commands/events.

## Integration
- Utilities: `src/utils/automod.ts`, `src/utils/nsfwDetection.ts`, `src/utils/raidDetection.ts`, `src/utils/openaiModeration.ts`, `src/utils/db.ts`, `src/utils/modLog.ts`, `src/utils/analyticsCollector.ts`, `src/utils/lock.ts`, `src/utils/logger.ts`, `src/config/config.ts`.
- Consumers: Discord slash, context-menu, and message routers; CLI mirrors slash subcommands.
