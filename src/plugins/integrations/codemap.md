# src/plugins/integrations/

## Responsibility
External feed subscriptions for Twitch, YouTube, GitHub, and RSS with polling plus GitHub webhook intake, backed by single command `commands/integration.ts` and `cli/index.ts` (no `events/` directory).

## Files

| File | Purpose |
|------|---------|
| `plugin.ts` | Defines IntegrationsPlugin class starting feed poller and webhook server |

Subdirectories: `commands/`, `cli/`, `locales/` (no `events/` directory).

## Design
- Class `IntegrationsPlugin` in `plugin.ts` extends `src/core/Plugin.ts` (`id = 'integrations'`, `version 1.0.0`). `onEnable` loads commands, registers `integrations.add` and `integrations.remove` socket handlers, starts `initIntegrationPoller` and optional GitHub webhook server; `onDisable` stops both and unloads. Idempotent.
- Subscription store via `src/utils/db.ts` under `integrations` key; poller posts channel notifications; webhook verifies GitHub HMAC before parsing.
- i18n namespace `integrations`, locales in `locales/<locale>/common.json` (6 locales, `en-US` canonical, fixed translators, informal `du`).
- Patterns: Template Method (plugin lifecycle hooks), Observer (feed poller and webhook fan-out notify mapped channels).

## Flow
1. Enable: `_loadCommands`, register socket handlers, init poller, conditionally start webhook when port plus secret configured.
2. `/integration add` validates input, assigns id, persists guild/channel/type/target; `remove` deletes by id and guild; `list` renders embed.
3. Poller checks each subscription for updates and posts to mapped channel; webhook receives GitHub POSTs and fans out notifications.
4. Disable: stop poller and webhook, unload commands.

## Integration
- Utilities: `src/utils/integrationPoller.ts`, `src/utils/integrationWebhook.ts`, `src/utils/db.ts`, `src/utils/logger.ts`, `src/utils/discordErrors.ts`, `discord.js`.
- Consumers: Discord slash router, `bin/apollo.ts` via socket, Twitch/YouTube/RSS poll sources and GitHub webhooks.
