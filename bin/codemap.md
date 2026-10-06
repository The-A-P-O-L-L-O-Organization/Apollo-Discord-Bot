# bin/

## Responsibility
CLI entry lane for the bot. Contains `bin/apollo.ts` only (plus this map), bootstrapping environment and delegating to the CLI layer in `src/cli/` for command discovery and execution.

## Files

| File | Purpose |
|---|---|
| `apollo.ts` | CLI entrypoint loading env, discovering commands, and running the selected command. |

## Design
- Strict TypeScript ESM with shebang, run via `pnpm apollo` or `node --import tsx bin/apollo.ts`. Loads `dotenv/config` first so `src/config/config.ts` validation sees required keys.
- Thin wiring layer: imports `discoverCommands` from `src/cli/discover.ts`, `run` from `src/cli/index.ts`, and `logger` from `src/utils/logger.ts`. No business logic, no direct Discord calls, no duplicated logger imports.
- Centralized error handling in async `main()` with non-zero exit on fatal errors, structured pino logging instead of console output.
- Patterns: Facade (thin wiring over `src/cli/discover.ts` and `src/cli/index.ts` with no business logic of its own).

## Flow
1. Invoke `pnpm apollo -- <args>` which executes `bin/apollo.ts`.
2. Load environment from `.env` via `dotenv/config`.
3. Await `discoverCommands()` to scan CLI command sources and build the command map.
4. Await `run(argv, commandMap)` with sliced `process.argv` to execute the selected command.
5. Log formatted output and exit 0, or log fatal error and exit 1 on exception.

## Integration
- Depends on `dotenv`, `src/cli/discover.ts`, `src/cli/index.ts`, and `src/utils/logger.ts`.
- Consumed by operators via the `pnpm apollo` script defined in `package.json` and by plugin `cli/` extensions discovered through the CLI layer.
- Uses Unix socket client path when commands target a running gateway via `/tmp/apollo.sock` or `APOLLO_SOCKET_PATH`.
