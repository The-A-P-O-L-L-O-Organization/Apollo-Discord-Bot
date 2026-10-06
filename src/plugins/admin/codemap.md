# src/plugins/admin/

## Responsibility
Bot administration: plugin lifecycle, logging configuration, queue inspection, migrations, system health, language, and reaction roles. Backed by `commands/` (8 files), `events/` (11 files), and `cli/`.

## Files

| File | Purpose |
|------|---------|
| `plugin.ts` | Defines AdminPlugin class with admin socket handler registration |

Subdirectories: `commands/`, `events/`, `cli/`, `locales/`.

## Design
- Class `AdminPlugin` in `plugin.ts` extends `src/core/Plugin.ts` (`id = 'admin'`, `version 1.0.0`). `onEnable` loads commands/events and registers `admin.*` socket handlers; `onDisable` unloads. Idempotent.
- Commands default-export `{ data | name, description, options }` with owner/permission guards (`requireOwner` where applicable).
- Events export `{ name, once, execute }` for audit logging and reaction-role automation.
- i18n namespace `admin`, locales in `locales/<locale>/common.json` (6 locales, `en-US` canonical, fixed translators, informal `du`).
- Patterns: Template Method (plugin lifecycle hooks), Command (command modules with `execute`), Observer (event handlers subscribed by name).

## Flow
1. Enable: `_loadCommands`, `_loadEvents`, register `admin.plugin.*` and `admin.logging.*` socket RPC.
2. Slash path: permission guard, subcommand dispatch, read `src/utils/db.ts` or service state, mutate, persist, embed reply.
3. Event path: validate partials and bot filtering, enrich via audit logs, build embed via logger helpers, persist via `logEvent`, apply role side effects.
4. Socket path: external scripts trigger enable/disable/reload and logging updates over `/tmp/apollo.sock`.
5. Disable: unload commands/events.

## Integration
- Core `src/core/Plugin.ts`, `src/core/PluginRegistry.ts`; utils `src/utils/logger.ts`, `src/utils/db.ts`, `src/config/config.ts`, `src/utils/accessControl.ts`.
- Queue metrics via `src/queue/metrics.ts`, migrations via `src/db/knex.ts`, Redis via `ioredis` for system checks.
- Consumers: Discord slash router, `bin/apollo.ts` CLI, Unix socket RPC clients.
