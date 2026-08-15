# Responsibility
Defines CLI command specifications for ticket management subsystem.

# Design
Command registry pattern: exports default object with `name`, `description`, and `commands` array. Each command includes `name`, `description`, optional `needsSocket` boolean, `options` array for argument schema, and for read-only commands an `execute` async function.

# Flow
Input: command dispatcher passes `args` object containing `guild` and other parameters. For `list` command, `execute` invokes `getGuildData('tickets', args.guild)`, transforms ticket records into `open` and `closed` arrays, returns counts and lists. For mutating commands (`create`, `close`, `add`, `remove`), `needsSocket: true` indicates handling via WebSocket layer; no local execute; socket consumer validates options and performs state mutation via backend services.

# Integration
Dependencies: `../../../utils/db.js` (getGuildData). Consumers: command dispatcher (e.g., `src/plugins/base/commandHandler.js`), socket processor (e.g., `src/plugins/tickets/socketHandler.js`).