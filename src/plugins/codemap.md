# src/plugins/

## Responsibility
Container for the 7 first-party plugins: admin, automod, integrations, interlink, moderation, tickets, utility. Each subdirectory is a self-contained plugin with `plugin.ts`, `commands/`, `events/` (except integrations which has no `events/`), optional `cli/`, and `locales/` covering 6 locales.

## Files

No top-level source files; this directory is a container for the 7 first-party plugin subdirectories.

Subdirectories: `admin/`, `automod/`, `integrations/`, `interlink/`, `moderation/`, `tickets/`, `utility/`.

## Design
- Plugin contract: each `plugin.ts` exports a class extending `src/core/Plugin.ts` with static `id`, `version`, `dependencies` and idempotent `onLoad`/`onEnable`/`onDisable`/`onUnload`. Base class auto-loads `commands/*.ts` and `events/*.ts` via `_loadCommands`/`_loadEvents`.
- Command contract: each command file default-exports `{ data | name, description, options }` plus `execute`. Registered with Discord via `scripts/deploy-commands.ts`.
- Event contract: each event file default-exports `{ name, once, execute }` attached to the Discord client.
- CLI contract: optional `cli/index.ts` exports socket-aware command tree (`needsSocket` for mutating actions, local `execute` for reads via `src/utils/db.ts`).
- i18n: locales live at `src/plugins/<name>/locales/<locale>/common.json` for `de`, `el`, `en-US`, `es-ES`, `it`, `pl`. Namespace equals plugin id, canonical `en-US` complete, `t('plugin:key')` with fixed translators for concurrency, German informal `du`, placeholders and plural suffixes preserved.
- Patterns: Template Method (plugin lifecycle hooks), Command (command modules with `execute`), Observer (event handlers subscribed by name), Registry (PluginManager discovery).

## Flow
1. `PluginManager.scanPlugins` discovers `src/plugins/*/plugin.ts`.
2. `loadPlugin` dynamically imports `plugin.ts`, instantiates `(client, manager)`, calls `onLoad`.
3. Dependency sort then `enablePlugin` calls `onEnable` which runs `_loadCommands`, `_loadEvents`, `_registerSocketHandlers`, and starts schedulers/monitors where needed.
4. Runtime: slash commands handle interactions, event handlers react to gateway events, socket handlers serve `manager.registerSocketHandler('namespace.action', handler)` RPC on `/tmp/apollo.sock` (`APOLLO_SOCKET_PATH`).
5. `onDisable` unloads commands/events, stops schedulers, removes socket handlers; `onUnload` releases resources. Regenerate integrity with `pnpm manifest`.

## Integration
- `src/core/Plugin.ts` and `src/core/PluginManager.ts` for lifecycle, `src/core/worker/workerHost.ts` for sandboxed third-party plugins, `plugin-manifest.json` for SHA-256 integrity.
- `src/utils/db.ts` (`getGuildData`, `setGuildData`, `getUserData`) for persistence, `src/utils/logger.ts` pino child loggers, `src/config/config.ts` for feature flags.
- `src/queue/queue.ts` BullMQ plus `src/core/EventBus.ts` Redis bus (`plugin.action` events) for cross-pod work; gateway leader in `src/gateway/leader.ts` gates schedulers with `withLock`.
- `services/interlink/` Go relay plus `protos/interlink/` contracts for interlink transport.
