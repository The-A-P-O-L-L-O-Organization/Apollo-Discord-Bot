Responsibility
The moderation plugin encapsulates moderation-related functionality for the Discord bot, providing command registration, event handling, and socket-based moderation actions such as ban, kick, mute, warn, clear, slowmode, and lockdown.

Design
Follows the modular plugin pattern by extending the base Plugin class. Uses inheritance to reuse lifecycle methods (onEnable, onDisable). Registers socket handlers for specific moderation actions, encapsulating each action as an asynchronous callback. No additional abstractions beyond the Plugin base class.

Flow
Data enters via the plugin lifecycle: onEnable triggers _loadCommands, _loadEvents, and _registerSocketHandlers. Socket handlers receive moderation.* events from the manager, extract arguments (guild, user, reason, etc.), interact with Discord.js APIs (guilds.cache.get, members.ban/member.kick/member.roles.add), and return success objects. onDisable triggers _unloadCommands and _unloadEvents to clean up resources. State transitions are managed by the Plugin base class enable/disable flow.

Integration
Depends on the core Plugin class (../../core/Plugin.js). Interacts with the manager instance for socket registration and command/event loading. Consumes Discord.js client via manager (client.guilds.cache, etc.). Provides moderation.* socket events for external clients (e.g., CLI, web panel) to invoke moderation actions.