# src/plugins/utility/

## Responsibility
General utility surface: info lookups, fun commands, XP/leveling, reminders, polls, giveaways, announcements, embeds, tags, translation, analytics/stats, SLA view, reports, and privacy tools (`datadeletion`, `operatorcontact`). Backed by `commands/` (31 files plus `analytics/` subdir), `events/messageCreate.ts`, and `cli/index.ts`.

## Files

| File | Purpose |
|------|---------|
| `plugin.ts` | Defines UtilityPlugin class starting reminder, poll, and analytics schedulers |

Subdirectories: `commands/`, `events/`, `cli/`, `locales/`.

## Design
- Class `UtilityPlugin` in `plugin.ts` extends `src/core/Plugin.ts` (`id = 'utility'`, `version 1.0.0`). `onEnable` loads commands/events, registers `utility.*` socket handlers, starts reminder/poll/analytics schedulers and translation service; `onDisable` unloads and stops them. Idempotent transitions.
- Commands default-export `{ data | name, description, options }`; `analytics.ts` dispatches to `analytics/` handlers without reverse imports.
- Event `messageCreate.ts` exports `{ name, once, execute }` for XP award and level-up embeds.
- i18n namespace `utility`, locales in `locales/<locale>/common.json` plus `help.json` and `ping.json` under `en-US`; 6 locales, fixed translators, informal `du`.
- Patterns: Template Method (plugin lifecycle hooks), Command (command modules with `execute`), Observer (event handler subscribed by name).

## Flow
1. Enable: `_loadCommands`, `_loadEvents`, `_registerSocketHandlers`, `initReminderScheduler`, `initPollScheduler`, `initAnalyticsCollector`, init translation.
2. Interaction path: slash command validates input, queries `src/utils/db.ts` or scheduler utils, replies with embed.
3. Message path: XP config check, cooldown check, award XP, announce level-up.
4. Socket path: `utility.*` handlers serve CLI reads such as server/user info.
5. Disable: unload commands/events, stop schedulers.

## Integration
- Utilities: `src/utils/reminderScheduler.ts`, `src/utils/pollScheduler.ts`, `src/utils/analyticsCollector.ts`, `src/utils/translation.ts`, `src/utils/xp.ts`, `src/utils/markdownParser.ts`, `src/utils/db.ts`, `src/utils/logger.ts`.
- Consumers: Discord slash router, schedulers gated by gateway `withLock`, CLI via socket.
