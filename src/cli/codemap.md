# src/cli/codemap.md

## Responsibility
Terminal administration for the bot: argument parsing, plugin command discovery, output formatting, and Unix-socket dispatch to the running core over `/tmp/apollo.sock` or `APOLLO_SOCKET_PATH`.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI run orchestrator routing to local execute or socket dispatch plus help generation. |
| `parse.ts` | parseArgs splitting argv into command path and flags. |
| `discover.ts` | resolveCommand scanning plugin cli modules to build the command map. |
| `format.ts` | Colored formatSuccess, formatError, formatInfo, and formatTable output helpers. |
| `socket-client.ts` | sendSocketCommand over the Unix socket with UUID correlation and 10s timeout. |
| `socket-server.ts` | SocketServer validating peer credentials and dispatching namespace.action handlers. |

No subdirectories; all modules are top-level files in `src/cli/`.

## Design
- `index.ts`: `run(argv, commandMap)` orchestrator plus `generateHelp`. Routes to local `execute` or to the socket when `needsSocket` is set.
- `parse.ts`: `parseArgs` splits argv into command path and flags object.
- `discover.ts`: `resolveCommand` scans `src/plugins/*/cli/` modules and builds the command map.
- `format.ts`: `formatSuccess`, `formatError`, `formatInfo` output helpers.
- `socket-client.ts`: `sendSocketCommand(command, args)` opens `APOLLO_SOCKET_PATH` (default `/tmp/apollo.sock`), writes newline-delimited JSON with a UUID, waits up to 10 seconds for the matching reply.
- `socket-server.ts`: `SocketServer` bound to `PluginManager`; `DEFAULT_SOCKET_PATH` is `APOLLO_SOCKET_PATH` or `data/apollo.sock`. Enforces peer-credential checks and optional `APOLLO_SOCKET_TOKEN`, parses newline-delimited JSON, and dispatches to handlers registered via `manager.registerSocketHandler('namespace.action', handler)`.
- Patterns: Command (CLI command map with local `execute` versus socket dispatch), Registry (`resolveCommand` building the command map from plugin `cli/` modules), Dispatcher (socket server routing `namespace.action` to registered handlers), Proxy (`sendSocketCommand` forwarding to the running core).

## Flow
1. `bin/apollo.ts` (`pnpm apollo`) calls `run` with `process.argv`.
2. `parseArgs` extracts the path and flags; `resolveCommand` matches against discovered plugin CLI commands.
3. Local commands execute in-process; socket commands serialize to JSON and send over the Unix socket.
4. `SocketServer` validates credentials and token, invokes the registered `namespace.action` handler, and returns `{ id, result }` or `{ id, error }`.
5. Results render through `formatSuccess`, `formatError`, or `formatInfo`.

## Integration
- Depends on `node:net`, `node:crypto`, `src/core/PluginManager.ts`, plugin `cli/` modules, `src/types/cli.ts`.
- Consumed by `bin/apollo.ts`. The socket defaults to `/tmp/apollo.sock` (client) or `APOLLO_SOCKET_PATH` override; server falls back to `data/apollo.sock` under the working directory.
