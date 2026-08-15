Responsibility
Provides the Automod plugin that extends the base Plugin class to manage automatic moderation functionality, including lifecycle handling for command and event subsystems.

Design
Uses the Plugin base class inheritance pattern. Implements lifecycle methods onEnable and onDisable to coordinate loading and unloading of commands and events via protected helper methods _loadCommands, _unloadCommands, _loadEvents, _unloadEvents (inherited from Plugin). Declares static metadata: id, version, and empty dependencies array.

Flow
On plugin enable, the plugin manager invokes onEnable, which asynchronously awaits _loadCommands then _loadEvents to initialize subsystems. On disable, onDisable invokes _unloadCommands then _unloadEvents to tear down subsystems. State transitions: disabled → enabled (onEnable) → disabled (onDisable). No external data flow beyond internal subsystem management.

Integration
Depends on src/core/Plugin.js for base class functionality. Consumes command and event modules located in src/plugins/automod/cli/, src/plugins/automod/commands/, and src/plugins/automod/events/ (loaded via inherited plugin mechanisms). No external API endpoints or hooks beyond the plugin interface.