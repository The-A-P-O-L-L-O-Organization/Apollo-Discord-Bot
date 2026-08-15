Responsibility
Provides CLI-based integration management commands for listing, adding, and removing integrations via a plugin architecture.

Design
Plugin pattern: exports default object with name, description, and commands array.
Each command follows a handler interface: name, description, options, optional execute (async) or needsSocket flag.
Abstraction: command handler encapsulates argument parsing and execution logic.

Flow
Data enters via command invocation with args object.
- list command: calls getData('integrations') from db utility, maps subscription objects, returns {count, subscriptions}.
- add/remove commands: set needsSocket:true, indicating they delegate to socket layer for server communication (execution not shown).
State transitions: none; commands are stateless, returning results or triggering socket messages.

Integration
Dependencies: ../../../utils/db.js (getData function).
Consumers: main application plugin loader registers commands from this module.
Interacts with socket layer for commands flagged needsSocket:true (add, remove).