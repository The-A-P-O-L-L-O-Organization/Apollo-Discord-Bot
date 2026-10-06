# src/core/codemap.md

## Responsibility
Owns plugin lifecycle, cross-pod event distribution, and plugin integrity. Provides the `Plugin` base class, coordinates discovery/loading/enabling/disabling through `PluginManager`, distributes `plugin.action` domain events through `EventBus`, verifies manifests and Sigstore signatures, and sandboxes third-party plugins in worker child processes.

## Files

| File | Purpose |
|------|---------|
| `Plugin.ts` | Abstract Plugin base class with lifecycle hooks and command and event loading. |
| `PluginManager.ts` | Coordinator delegating load, enable, disable, reload, install, and sync to helpers. |
| `PluginLoader.ts` | Instantiation and manifest-verified loading of a single plugin. |
| `PluginEnabler.ts` | Plugin enabling with capability signing and command sync. |
| `PluginDisabler.ts` | Plugin disabling with onDisable and event unsubscription. |
| `PluginReloader.ts` | Disable-then-enable reload of a single plugin. |
| `PluginInstaller.ts` | Install from a source path with Sigstore verification and hashing. |
| `PluginDependencyResolver.ts` | Topological sortByDependencies plus parallel enable groups. |
| `CommandSync.ts` | Discord application-command REST sync per plugin and global. |
| `BuiltinPluginLoader.ts` | First-party plugin class import with manifest hash check. |
| `PluginRegistry.ts` | Manifest-backed third-party plugin registry with list, get, search, and reload. |
| `pluginDownloader.ts` | HTTPS-only plugin archive download with hash and zip traversal checks. |
| `pluginSigstore.ts` | Sigstore signature verification for plugin archives. |
| `EventBus.ts` | EventBusImpl with local handlers plus optional Redis cross-pod replication. |

Subdirectory `worker/` holds sandboxed third-party plugin execution; see `src/core/worker/codemap.md`.

## Design
- `Plugin.ts`: abstract class extending nothing external. Holds `commands`, `eventHandlers`, `schedulers` maps, lifecycle hooks `onLoad`, `onEnable`, `onDisable`, `onUnload`. Loads `commands/` and `events/` modules from its own directory. Exposes `manager.registerSocketHandler(namespace, handler)` reference for `namespace.action` socket RPC.
- `PluginManager.ts`: coordinator delegating to focused helpers: `PluginLoader.ts`, `PluginEnabler.ts`, `PluginDisabler.ts`, `PluginReloader.ts`, `PluginInstaller.ts`, `PluginDependencyResolver.ts` (`sortByDependencies`, `enablePluginsParallel`), `CommandSync.ts`, `BuiltinPluginLoader.ts`. Tracks `plugins`, `installedPlugins`, `_capabilityIndex`, `_socketHandlers`. Owns a `WorkerHost` for sandboxed third-party plugins.
- `EventBus.ts`: `EventBusImpl` with `on`, `once`, `emit`, `provide`, `call`, `provideState`, `getState`, `setState`, `watchState`. Event names use `plugin.action` form. Optional cross-pod replication via injected Redis pub/sub clients and `podId`.
- `pluginSigstore.ts`: Sigstore signature verification for plugin archives.
- `pluginDownloader.ts`: HTTPS-only download, hash check, zip extraction with traversal and symlink rejection.
- `PluginRegistry.ts`: manifest-backed registry with `listAvailable`, `get`, `search`, `reload`.
- `worker/workerHost.ts`, `worker/workerChild.ts`, `worker/rpc-schemas.ts`: sandboxed execution of installed third-party plugins. See `src/core/worker/codemap.md`.
- Patterns: Template Method (`Plugin` base class with `onLoad`/`onEnable`/`onDisable` hooks), Observer/Pub-Sub (`EventBus` on/emit with Redis fan-out), Facade (PluginManager delegating to loader/enabler/disabler helpers), Registry (`PluginRegistry` plus `_capabilityIndex`), Proxy/Sandbox (worker host/child RPC boundary).

## Flow
1. Discovery: `PluginManager` scans built-in and installed directories, `BuiltinPluginLoader` verifies file hashes against the manifest.
2. Load: instantiate plugin class, call `onLoad`, populate `commands` and `eventHandlers`.
3. Enable: dependency order via `sortByDependencies`, parallel groups via `enablePluginsParallel`, call `onEnable`, subscribe `EventBus` handlers under the plugin id.
4. Events: `bus.on(event, handler, pluginId)` then `bus.emit('plugin.action', payload)` runs local handlers and, when cross-pod is enabled, publishes over Redis pub/sub to other pods.
5. Socket RPC: plugins call `manager.registerSocketHandler('namespace.action', handler)`; `src/cli/socket-server.ts` dispatches socket messages to those handlers.
6. Installed plugins: `PluginInstaller` downloads via `pluginDownloader`, verifies via `pluginSigstore` and `worker/pluginManifest.ts`, then `WorkerHost.startPlugin` forks `workerChild.ts` with signed capabilities.

## Integration
- Consumes `src/utils/logger.ts` (pino, never console), `src/utils/manifest.ts`, `src/utils/securityLog.ts`, `src/config/config.ts` (`config.plugins`), `src/types/plugin.ts` and `src/types/shared.ts`.
- Drives `client.commands` on the discord.js v14 client and delegates Discord application-command sync to `CommandSync.ts`.
- Publishes cross-pod `plugin.action` events over Redis when `enableCrossPod` is configured.
- Spawns sandboxed third-party plugins via `worker/workerHost.ts` and `worker/workerChild.ts` with zod-validated RPC from `worker/rpc-schemas.ts`.
