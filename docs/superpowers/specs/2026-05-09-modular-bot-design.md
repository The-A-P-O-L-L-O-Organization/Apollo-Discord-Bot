# Modular Bot Architecture Design

**Date:** 2026-05-09
**Status:** Approved

## Overview

Refactor the Apollo Discord Bot from a flat type-based file organization (all commands in `src/commands/`, all events in `src/events/`) into a **feature-based plugin system** with a **class-based plugin lifecycle** and an **event bus** for cross-plugin communication. Plugins support full hot-reload (install, remove, enable, disable at runtime).

## Goals

- Group code by feature domain (not by type) — each plugin owns its commands, events, and logic
- Formal plugin system with lifecycle hooks (`onLoad`, `onUnload`, `onEnable`, `onDisable`)
- Event bus for decoupled cross-plugin communication
- Full hot-reload at runtime without bot restart
- Simplified organization: clear boundaries, smaller focused files
- Backward compatibility during migration (flat files coexist temporarily)

## Design (Approved Sections)

### High-Level Architecture

```
src/
├── plugins/                    # All plugins live here
│   ├── moderation/             # Plugin directory
│   │   ├── plugin.js           # Plugin class (extends Plugin base)
│   │   ├── commands/           # Commands scoped to this plugin
│   │   ├── events/             # Events scoped to this plugin
│   │   └── utils/              # Utils scoped to this plugin
│   ├── tickets/
│   │   └── ...
│   ├── automod/
│   │   └── ...
│   ├── utility/
│   │   └── ...
│   └── admin/
│       └── ...
├── core/
│   ├── PluginManager.js        # Loads/unloads/enables/disables plugins
│   ├── Plugin.js               # Base plugin class
│   ├── EventBus.js             # Cross-plugin event bus
│   └── index.js                # Bootstrap (was src/index.js)
├── commands/                   # Stays temporarily for migration
├── events/                     # Stays temporarily for migration
└── utils/                      # Shared utils stay (modLog, db, logger)
```

### Plugin Lifecycle

Each plugin is a class extending a base `Plugin` class:

```js
export default class Plugin {
  constructor(client, manager) {
    this.client = client
    this.manager = manager
    this.commands = new Map()
    this.eventHandlers = []
    this.schedulers = []
    this._loaded = false
    this._enabled = false
  }

  static get id() { /* unique name */ }
  static get dependencies() { return [] }
  static get version() { return '1.0.0' }

  async onLoad() {}
  async onUnload() {}
  async onEnable() {}
  async onDisable() {}
}
```

Lifecycle flow:
1. `load()` → imports plugin, instantiates, calls `onLoad()`, dependency check
2. `enable()` → calls `onEnable()`, registers commands with Discord API, attaches event listeners
3. `disable()` → calls `onDisable()`, unregisters commands, removes listeners, stops schedulers
4. `unload()` → calls `onUnload()`, clears references for garbage collection

Hot-reload = `disable()` → `unload()` → cache-bust import → `load()` → `enable()`

### Event Bus

An internal event bus for cross-plugin communication. Plugins emit and listen for events instead of importing each other directly.

```js
class EventBus {
  on(event, handler)       // returns unsubscribe function
  emit(event, payload)     // async, all handlers run in parallel
  once(event, handler)
  removeAll(pluginId)      // cleanup on disable
}
```

Example:
```js
// moderation plugin
this.bus.emit('moderation:action', { type: 'ban', userId, guildId, moderatorId, reason })

// logging plugin
this.bus.on('moderation:action', (payload) => { this.logToChannel(payload) })
```

The event bus is only for cross-plugin communication. Commands within a plugin call each other directly.

### PluginManager

Central orchestrator that manages all plugin lifecycle:

```js
class PluginManager {
  constructor(client)

  async loadPlugin(id)         // Import + instantiate + onLoad
  async unloadPlugin(id)       // onUnload + GC
  async enablePlugin(id)       // onEnable + register commands/events with Discord
  async disablePlugin(id)      // onDisable + unregister commands/events
  async reloadPlugin(id)       // disable + unload + cache-bust + load + enable

  async loadAll(config)        // Load + enable all configured plugins
  getPlugin(id)                // Get loaded plugin instance
  isEnabled(id)                // Check if plugin is enabled
  listPlugins()                // List all discovered plugins
  scanPlugins()                // Scan src/plugins/ for plugin directories
}
```

Hot-reload uses ESM cache busting via dynamic `import()` with a unique URL parameter (`${path}?update=${Date.now()}`), since ESM doesn't have a built-in cache-busting mechanism.

Command registration on `enable()` registers commands with Discord REST API. The registration mode (per-guild vs global) is determined by config — if `GUILD_ID` is set, commands are registered per-guild (instant); otherwise globally (cached for ~1 hour). On `disable()`, commands are unregistered via the same REST API.

This replaces the current `deploy-commands.js` script and `commandHandler.js` — both are superseded by plugin-level registration.

The core `index.js` still handles the `interactionCreate` event at the Discord client level, but dispatches to the PluginManager to find which plugin owns a command. Button interactions (ticket create/close) are handled by the owning plugin's event handlers, registered through the plugin's event system.

### Concrete Plugin Structure

Each plugin is a directory under `src/plugins/<name>/` with this layout:

```
src/plugins/moderation/
├── plugin.js                 # Plugin class (entry point, extends Plugin)
├── commands/                 # Slash command files (same exports as today)
│   ├── ban.js
│   ├── kick.js
│   ├── mute.js
│   └── ...
├── events/                   # Discord event files (same exports as today)
│   ├── guildMemberAdd.js
│   └── guildMemberRemove.js
└── utils/                    # Plugin-scoped utilities
    └── strikeTracker.js
```

Command and event file exports remain **identical** to their current format — no rewrite needed for individual files. The plugin class groups them and handles registration/unregistration.

### Migration Path (4 Phases)

| Phase | What | Outcome |
|-------|------|---------|
| 1 | Create `core/Plugin.js`, `core/PluginManager.js`, `core/EventBus.js` | Infrastructure ready, no behavior change |
| 2 | Migrate smallest plugin first (e.g., utility/ping) | Validate system end-to-end |
| 3 | Migrate remaining plugins one at a time | Each plugin independently tested |
| 4 | Remove flat `src/commands/` and `src/events/` dirs | Clean slate, full modularity |

During migration, `src/index.js` loads plugins via PluginManager. For plugins not yet migrated, it falls back to loading from `src/commands/` and `src/events/` as today.

### Configuration

Plugin loading configured in `src/config/config.js`:

```js
plugins: {
  enabled: ['moderation', 'tickets', 'automod', 'utility', 'admin'],
  directory: './src/plugins'
}
```

### Plugin Management Commands

A built-in `plugin` command (in the admin/core plugin) provides runtime management:

- `/plugin list` — list all discovered plugins with status (loaded/enabled/disabled)
- `/plugin enable <name>` — enable a loaded plugin
- `/plugin disable <name>` — disable an enabled plugin (unregisters its commands/events)
- `/plugin reload <name>` — hot-reload a plugin (cache-bust import)
- `/plugin load <name>` — load a new plugin from disk

This replaces the existing `reload` command.

### Testing Strategy

- PluginManager and EventBus get new unit tests in `tests/core/`
- Existing command tests remain unchanged — same exports, just loaded through PluginManager
- Event tests remain unchanged
- As plugins migrate from flat directories, corresponding test directories mirror the move:

```
tests/
├── core/
│   ├── PluginManager.test.js
│   └── EventBus.test.js
├── plugins/
│   ├── moderation/
│   │   ├── commands/         # migrated from tests/commands/
│   │   └── events/           # migrated from tests/events/
│   ├── tickets/
│   └── ...
└── utils/                    # stays unchanged
```

### Plugin Grouping (Proposed)

Based on the existing 73 command files, grouped into 5 coarse plugins:

| Plugin | Commands | Events | Key Logic |
|--------|----------|--------|-----------|
| **moderation** | ban, kick, mute, unmute, warn, warnings, clearwarnings, strike, strikes, clearstrikes, case, note, purge, clear, slowmode, lockdown, raidmode, blacklist, tempban, assign, temprole, rolepersistence, unban, unlock, unmute, report, reports, reportMessage, nickname | guildMemberAdd (welcome checks), guildMemberRemove | modLog, case system |
| **tickets** | ticket, closeticket, ticketadd, ticketinfo, ticketlist, ticketpriority, ticketratings, ticketsearch, ticketsetup, ticketstats, tickettemplate, tickettransfer | interactionCreate (button handlers), guildCreate (setup) | SLA tracking |
| **automod** | automod, logging, setlogchannel, autorole, reactionrole, sla, strikeconfig, warnconfig | messageCreate, messageUpdate, messageDelete, messageDeleteBulk, guildMemberUpdate, voiceStateUpdate | automod.js, nsfwDetection, perspectiveApi, raidDetection |
| **utility** | ping, help, userinfo, serverinfo, stats, embed, remind, reminders, cancelreminder, poll, avatar, banner, roleinfo, channelinfo, invite, joke, roll, 8ball, tag, level, leaderboard, giveaway, analytics, announcement | messageReactionAdd (poll), messageReactionRemove, ready | reminderScheduler, pollScheduler, analyticsCollector, charts |
| **admin** | reload (→ plugin command) | guildCreate, guildDelete | config management |

### Plugin-to-Plugin Dependencies

| Plugin | Depends On | Why |
|--------|-----------|-----|
| moderation | admin | Uses admin config for mod roles, log channels |
| tickets | admin | Uses admin config for ticket categories, roles |
| automod | admin | Uses admin config for automod settings, log channels |
| utility | — | Standalone, no dependencies |
| admin | — | Foundation plugin, always enabled |

### Cross-Plugin Events (Proposed Event Bus Contracts)

| Event | Emitter | Listeners | Payload |
|-------|---------|-----------|---------|
| `moderation:action` | moderation | automod (logging), utility (analytics) | `{ type, userId, guildId, moderatorId, reason, duration? }` |
| `ticket:created` | tickets | automod (logging) | `{ ticketId, guildId, userId, channelId }` |
| `ticket:closed` | tickets | automod (logging), utility (stats) | `{ ticketId, guildId, closedBy, rating? }` |
| `automod:action` | automod | moderation (auto-mute), utility (analytics) | `{ type, userId, guildId, action, reason }` |
| `guild:setup` | admin | moderation, tickets, automod | `{ guildId }` — triggers one-time init |

### Optional / Remote Plugins

Plugins can be installed on-demand from a remote source. These live outside the bot's container/code in a persistent `data/plugins/` directory.

**Plugin registry manifest** — a JSON file (`data/plugin-registry.json`) mapping plugin IDs to download sources:

```json
{
  "plugins": [
    {
      "id": "voice-moderation",
      "name": "Voice Moderation",
      "description": "Voice channel moderation tools",
      "version": "1.0.0",
      "downloadUrl": "https://github.com/example/apollo-voice-mod/archive/main.zip"
    }
  ]
}
```

**Directory layout:**

```
data/
├── plugins/
│   └── voice-moderation/         # Downloaded and extracted here
│       ├── plugin.js
│       ├── commands/
│       └── events/
├── plugin-registry.json          # Registry manifest
└── ... (existing data files)
```

**Installation flow:**
1. `/plugin install voice-moderation`
2. PluginManager looks up `voice-moderation` in the registry manifest
3. Downloads the archive from `downloadUrl`
4. Extracts to `data/plugins/voice-moderation/`
5. Validates `plugin.js` exists and exports a valid Plugin subclass
6. Loads and enables the plugin
7. Adds to `enabled` list in config for persistence across restarts

**Uninstallation flow:**
1. `/plugin uninstall voice-moderation`
2. PluginManager disables the plugin
3. Removes `data/plugins/voice-moderation/` from disk
4. Removes from config's `enabled` list

**Plugin discovery** — `PluginManager.scanPlugins()` scans both `src/plugins/` (built-in) and `data/plugins/` (installed):

```js
plugins: {
  enabled: ['moderation', 'tickets', 'automod', 'utility', 'admin'],
  directory: './src/plugins',
  optionalDirectory: './data/plugins',
  registryFile: './data/plugin-registry.json'
}
```

**PluginManager additions:**

```js
class PluginManager {
  async installPlugin(id)       // Download + extract + load + enable from registry
  async uninstallPlugin(id)     // Disable + unload + delete from disk
  searchRegistry(query)         // Search available plugins in registry manifest
}
```

**Plugin command additions:**

- `/plugin install <name>` — download and install a plugin from the registry
- `/plugin uninstall <name>` — remove an installed plugin
- `/plugin search <query>` — search available plugins in the registry
- `/plugin update <name>` — re-download and hot-reload an installed plugin
