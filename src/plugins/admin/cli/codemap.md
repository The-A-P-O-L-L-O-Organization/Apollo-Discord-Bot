Responsibility
This directory contains the administrative command definitions for the Discord bot, providing a structured interface for admin-level operations such as system info, plugin management, and logging configuration.

Design
Uses a modular command pattern where each top-level command is an object with name, description, options, and subcommands. Subcommands follow the same structure, with execute functions for actions needing logic. The pattern leverages composition and separation of concerns, defining command metadata declaratively.

Flow
Data enters via the Discord interaction handler which imports this module and routes based on command name. For each matched command, options are parsed and passed to the subcommand's execute function (if present). State transitions involve calling process methods for system info or emitting socket events for plugin/logging actions (needsSocket flag indicates external service interaction). Data leaves as return objects (e.g., system info) or via socket messages.

Integration
Depends on Node.js process API for system info. Consumed by the command dispatcher in src/core/commandHandler.js. Provides no hooks; the needsSocket flag signals the dispatcher to open a WebSocket to the backend plugin manager. No direct API endpoints; integration is through internal messaging.