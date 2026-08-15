# src/plugins/

## Responsibility
This directory contains all bot plugins, each implementing a distinct feature set (admin, automod, integrations, interlink, moderation, tickets, utility). Plugins are self-contained modules that extend bot functionality via the PluginManager, encapsulating commands, events, and plugin‑specific logic.

## Design
- **Plugin contract**: Each plugin exports a class extending `src/core/Plugin.js` with static `id`, `version`, `dependencies` array, and lifecycle methods `onLoad`, `onUnload`, `onEnable`, `onDisable`.
- **Plugin manager**: `src/core/PluginManager.js` discovers plugins via `scanPlugins`, loads them by dynamically importing `plugin.js`, instantiates the class, and registers it in internal maps (`_pluginRegistry`, `plugins`).
- **Lifecycle management**: Manager resolves dependencies with topological sort (`_sortByDependencies`), then calls `onEnable`/`onDisable` for loaded plugins. Plugins auto‑load commands from `./commands/` and events from `./events/` via the base `Plugin` class.
- **Extension points**: Plugins can register socket handlers through `manager.registerSocketHandler` for admin‑style RPC calls.

## Flow
1. **Discovery**: `PluginManager.scanPlugins` reads `./src/plugins/*/plugin.js` to identify available plugins.
2. **Loading**: For each plugin ID, `loadPlugin` dynamically imports `plugin.js`, stores the class in `_pluginRegistry`, creates an instance with `(client, manager)`, and calls `onLoad`.
3. **Dependency resolution**: Before enabling, manager topologically sorts plugin IDs using declared `dependencies` and invokes `visit` to order loading.
4. **Enabling**: For each plugin in sorted order, `enablePlugin` calls `onEnable`, which loads commands/events (via base class `_loadCommands`/`_loadEvents`) and registers any socket handlers.
5. **Runtime**: Enabled plugins interact with the Discord `client`, event `bus`, and `manager`; commands are added to `client.commands`; listeners are attached to the client.
6. **Disabling/Cleanup**: `disablePlugin` calls `onDisable` to remove commands, listeners, and clean up schedulers; `unloadPlugin` additionally calls `onUnload` and removes the instance from `plugins`.

## Integration
- **src/core**: Plugins import the base `Plugin` class; they may also use `pluginDownloader.js` (for install/uninstall), `manifest.js`, `workerHost.js`, and `PluginManager` (via `this.manager`).
- **src/utils**: Common utilities (logger, config helpers, db wrappers) are imported as needed for plugin logic.
- **src/db**: Plugins that persist data import Prisma models or database clients from `src/db` to perform CRUD operations.
- **Discord.js**: The `client` instance (passed to the plugin constructor) provides access to Discord API interactions (commands, events, REST).