# Core Module Codemap

## Responsibility
Manages plugin lifecycle, event communication, plugin registry, secure plugin downloading, and worker‑based sandboxing. Provides abstract base class for plugins, coordinates loading/enabling/disabling, handles cross‑pod messaging via Redis, and maintains plugin state, APIs, and command registration.

## Design
- **Plugin** (abstract class): base for all plugins; loads commands and events from its directory, implements lifecycle hooks (`onLoad`, `onUnload`, `onEnable`, `onDisable`), and stores internal maps for commands, event handlers, and schedulers.
- **EventBus**: publish/subscribe system with plugin‑scoped handlers; supports state keys with watchers; optional cross‑pod replication via Redis; provides `on`, `once`, `emit`, `provide`, `call`, `provideState`, `getState`, `setState`, `watchState`, `removeAll`, `enableCrossPod`.
- **PluginManager**: orchestrates plugin discovery, dependency resolution, loading, enabling/disabling, reloading, installing/uninstalling; syncs slash commands with Discord; manages `WorkerHost` for sandboxed plugins.
- **PluginRegistry**: loads/maintains plugin manifest JSON; provides `listAvailable`, `get`, `search`, and `reload` methods; seeds with default plugins.
- **WorkerHost** (master‑worker pattern): spawns child processes for plugins using Node `fork`, tracks crashes, enforces capability limits, and communicates via IPC.
- **WorkerChild**: runs inside each plugin sandbox, exposes a `host` object with capability‑checked `call` method, handles lifecycle and command/event messages via RPC.
- **RPC module**: defines request/response structures, correlation IDs, and oversize payload detection.
- **pluginDownloader**: secure download/extract utilities; validates URLs (HTTPS only, public IPs), checks hash, extracts zip archives while preventing path traversal and symlink attacks.
- **pluginManifest**: validates declared capabilities against a known set and parses `plugin.json`.

## Flow
1. **Plugin registration**: `PluginManager.loadPlugin` reads `plugin.js`, instantiates the class, calls `onLoad`, sets `_loaded = true`, and registers commands/events with the discord client.
2. **Enabling**: after dependency checks, `PluginManager.enablePlugin` calls `bus.removeAll(pluginId)`, invokes `onEnable`, sets `_enabled = true`, and registers listeners via `EventBus`.
3. **Event flow**: plugins register handlers with `bus.on(event, handler, pluginId)`; `bus.emit` invokes all handlers for an event, optionally rebroadcasting to other pods via Redis when cross‑pod is enabled.
4. **State flow**: `provideState` creates a key; `setState` updates value and notifies watchers; cross‑pod state changes are published/subscribed via Redis.
5. **API flow**: `provide` registers a namespaced function; `call` invokes it with plugin‑scoped ownership.
6. **Worker sandboxing** (for installed plugins): `PluginManager.loadInstalledPlugin` uses `WorkerHost.startPlugin` to fork a child process; the child runs `WorkerChild.runChild`, which loads the plugin, exposes a capability‑checked `host.call`, and relays lifecycle/command/event messages via IPC using the RPC module.
7. **Command sync**: `_syncDiscordCommands` reads `this.client.commands` (populated by Plugin `_loadCommands`) and updates Discord application commands.
8. **Plugin installation**: `installPlugin` downloads via `pluginDownloader`, validates directory via `validatePluginDirectory`, loads, enables, and syncs commands.
9. **Cross‑pod communication**: when `enableCrossPod` is called, the EventBus subscribes to Redis channels for events and state, forwarding messages to local handlers and watchers.

## Integration
- **discord.js client**: accesses `client.commands` for command registration, `client.rest` for API calls, and registers event listeners via `client.on/once`.
- **WorkerHost / WorkerChild / RPC**: used by `loadInstalledPlugin` to run plugins in isolated processes with capability‑based security.
- **Configuration**: reads `client.config.plugins` for enabled lists, directories, and registry file path.
- **File system**: reads plugin directories, writes registry, extracts archives, removes plugin data on uninstall.
- **Redis (optional)**: when `enableCrossPod` is called, uses pub/sub clients to forward events and state changes across pods.
- **Internal utilities**: uses `../utils/securityLog.js` for logging security events and `../utils/manifest.js` for manifest verification.