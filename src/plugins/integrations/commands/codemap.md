Responsibility
Provide slash command interface for managing external service integrations (Twitch, YouTube, GitHub, RSS) including subscription creation, removal, and listing.

Design
Implements the command pattern with subcommand structure (add, remove, list). Uses a data access abstraction via getData/setData utilities for persistent storage. Follows Discord.js interaction handler pattern with async execute function.

Flow
1. Interaction received via Discord.js interactionCreate event.
2. Command handler routes to integration.js execute function.
3. execute extracts subcommand and delegates to corresponding handler (handleAdd, handleRemove, handleList).
4. Handlers interact with data layer: getData retrieves integration store, setData persists changes.
5. State transitions: add increments nextId and appends subscription; remove filters and splices; list reads and formats.
6. Handlers construct interaction replies with appropriate content/embeds and return promises.

Integration
Dependencies: discord.js (PermissionFlagsBits, Interaction), ../../../utils/db.js (getData, setData).
Consumed by: Command loader/invoker (typically via index.js in parent commands directory).
Hooks: Registered as a command module; triggered on interactionCreate when command name matches 'integration'.