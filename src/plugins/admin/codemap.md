Responsibility
The admin plugin provides administrative capabilities for managing other plugins and logging settings within the application.

Design
Extends the base Plugin class to inherit lifecycle hooks. Uses socket handler registration to expose administrative actions over a socket interface. Delegates command and event loading to internal private methods.

Flow
onEnable: calls _loadCommands, _loadEvents, then registers socket handlers for plugin enable/disable/reload/install/uninstall and logging set.
onDisable: calls _unloadCommands and _unloadEvents to clean up.
Socket handlers invoke corresponding methods on client.manager and return success messages.

Integration
Depends on core Plugin class (../../core/Plugin.js).
Consumes manager.socketHandlerRegistry for registering handlers.
Interacts with commands/ and events/ subdirectories via private load/unload methods (not recursed into for this codemap).