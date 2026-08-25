Responsibility
The moderation plugin provides core moderation functionality for the Discord bot, including command registration, event handling, and socket-based moderation actions (ban, kick, mute, warn, clear, slowmode, lockdown, etc.). It also supplies a CLI namespace for moderation commands and listens to guild member add/remove events for autorole and reporting.

Design
- Extends the base `Plugin` class, inheriting lifecycle methods (`onEnable`, `onDisable`).
- Uses static properties for plugin identification (`id`, `version`, `dependencies`).
- Registers socket handlers in `onEnable` for each moderation action; each handler is an async callback that interacts with Discord.js APIs.
- Loads commands and events via inherited `_loadCommands`/`_loadEvents` and cleans them on disable.
- CLI definition exports a command tree with socket‑forwarded actions (ban, kick, mute, warn, clear, slowmode, lockdown) and local executors (case lookup).
- Event listeners (`guildMemberAdd`, `guildMemberRemove`) are loaded from the `events/` directory to handle autorole, logging, and strike tracking.

Flow
1. Plugin lifecycle: `onEnable` → `_loadCommands` (loads all `.js` files from `commands/`), `_loadEvents` (loads `guildMemberAdd.js` and `guildMemberRemove.js`), `_registerSocketHandlers` (registers moderation.* socket actions).
2. Socket flow: External clients (CLI, web panel, interlink) emit `moderation.<action>` events via the manager; the handler receives `(client, args)`, validates guild/user, performs the Discord.js action (ban, kick, etc.), and returns a result object.
3. Command flow: CLI commands (e.g., `/apollo moderation ban`) forward to the socket layer if `needsSocket: true`; otherwise they execute locally (e.g., `case` command reads guild data via `getGuildData`).
4. Event flow: `guildMemberAdd`/`guildMemberRemove` events trigger logic in `events/` files (autorole assignment, strike logging, etc.).
5. `onDisable` reverses loading: `_unloadCommands`, `_unloadEvents` to clean up.

Integration
- Depends on core `Plugin` (`../../core/Plugin.js`) and logger utility.
- Uses Discord.js client via `this.manager` (or `client` in socket handlers) to interact with guilds, members, roles.
- Consumes database utilities (`getGuildData`) for local commands like `case`.
- Provides moderation.* socket events for external invocation (CLI, interlink, admin panels).
- Hooks into guild member lifecycle through `events/` files, which may interact with other plugins (e.g., autorole, strike tracking).