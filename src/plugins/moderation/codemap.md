# src/plugins/moderation/

## Responsibility
Hierarchy-safe guild moderation: bans, kicks, timeouts, voice moderation, warnings/strikes, cases, purge, slowmode, lock/lockdown, autorole, role persistence, blacklists, raid mode, and report triage. Backed by `moderation`, `warnings`, and `strikes` guild data plus `commands/` (40 files), `events/` (2 files), and `cli/`.

## Files

| File | Purpose |
|------|---------|
| `plugin.ts` | Defines ModerationPlugin class with moderation socket handler registration |

Subdirectories: `commands/`, `events/`, `cli/`, `locales/`.

## Design
- Class `ModerationPlugin` in `plugin.ts` extends `src/core/Plugin.ts` (`id = 'moderation'`, `version 1.0.0`, no dependencies). `onEnable` awaits `_loadCommands` and `_loadEvents` then `_registerSocketHandlers`; `onDisable` unloads both. Transitions idempotent and reversible.
- Commands default-export `{ data | name, description, options }` with `execute`. Permission gating via `PermissionsBitField` plus `canModerate` hierarchy check; null guild/member/partial handling explicit.
- Events follow `{ name, once, execute }`: `guildMemberAdd.ts`, `guildMemberRemove.ts`.
- CLI `cli/index.ts` exports `moderation` command tree; mutating actions set `needsSocket: true`, `case` lookup executes locally via `getGuildData`.
- i18n namespace `moderation`, locales in `locales/<locale>/common.json` (6 locales, `en-US` canonical, fixed translators, informal `du`).
- Patterns: Template Method (plugin lifecycle hooks), Command (command modules with `execute`), Observer (event handlers subscribed by name).

## Flow
1. Enable: load 40 commands, attach `guildMemberAdd`/`guildMemberRemove`, register `moderation.*` socket handlers.
2. Slash path: interaction validates options and hierarchy, performs Discord action (`ban`, `kick`, `timeout`, channel overwrite, voice state), creates case via `createModCase`, sends mod log via `sendModLog`, tracks analytics.
3. Socket path: `manager.registerSocketHandler('moderation.<action>', handler)` serves CLI/panel callers over `/tmp/apollo.sock`.
4. Member path: join runs raid/blacklist checks, autorole and role restore; leave persists roles for restore; both log embeds and track analytics.
5. Disable: `_unloadCommands`, `_unloadEvents`, remove socket handlers.

## Integration
- Base `src/core/Plugin.ts`; utilities `src/utils/db.ts`, `src/utils/logger.ts`, `src/utils/modLog.ts`, `src/utils/moderation.ts`, `src/utils/analyticsCollector.ts`, `src/utils/safeError.ts`, `src/utils/discordErrors.ts`.
- Coordination with automod warnings/strikes thresholds and `src/utils/raidDetection.ts` plus Redis locks in `src/utils/lock.ts`.
- Consumers: Discord slash router, `bin/apollo.ts` CLI via socket, interlink/admin callers.
