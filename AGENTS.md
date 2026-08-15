## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.

## Stack & Conventions

- **pnpm only** — this project uses pnpm workspaces. Do not use npm or yarn. Install with `pnpm install`, run scripts with `pnpm <script>`.
- **ESM only** (`"type": "module"` in `package.json`). Use `import`/`export`, not `require`.
- **Node.js**, **discord.js v14**, **BullMQ** + **ioredis** for queue, **Knex** for DB (PostgreSQL or SQLite via `config.db`).
- **pnpm** workspace. `pnpm-workspace.yaml` declares `bot` as a workspace package and whitelists native builds (`better-sqlite3`, `@tensorflow/tfjs-node`, `core-js`, `msgpackr-extract`).
- **Lint**: `pnpm lint` runs ESLint flat config (`eslint.config.js`). Style: 4-space indent, single quotes, semicolons, no trailing commas, `eqeqeq`, `curly: all`. Unused args prefixed with `_` are allowed.
- **Test**: `pnpm test` runs Vitest. Tests live in `tests/**/*.test.js`. Setup file: `tests/setup.js` (mocks console, extends `EmbedBuilder` with getters). Coverage excludes `src/index.js` and `src/handlers/**`.
- **No emojis** in source or docs. No code comments unless explicitly requested.

## Entry Points & Run Modes

- `src/index.js` — main bot. `pnpm start` runs it.
- `RUN_MODE=gateway pnpm start` — gateway leader-election mode (`src/gateway/leader.js`).
- `RUN_MODE=worker pnpm start` — worker mode (processes BullMQ jobs).
- `bin/apollo.js` — CLI entry. `pnpm apollo` or `node bin/apollo.js`.
- `deploy-commands.js` — registers slash commands with Discord. Requires `DISCORD_TOKEN` and `CLIENT_ID` in `.env`. If `GUILD_ID` is set, deploys to that guild (instant); otherwise global (up to 1h propagation).

## Plugin System

- Plugins live in `src/plugins/<name>/` with `plugin.js` (exports class extending `src/core/Plugin.js`), `commands/`, `events/`, optional `cli/`.
- `PluginManager` (`src/core/PluginManager.js`) discovers, loads, and enables plugins. Lifecycle: `onLoad` → `onEnable` → `onDisable` → `onUnload`.
- Installed (third-party) plugins run sandboxed in worker processes via `src/core/worker/workerHost.js` + `workerChild.js`. Capability checks via `pluginManifest.js`.
- Socket handlers: `manager.registerSocketHandler('namespace.action', handler)` for admin-style RPC over Unix socket `/tmp/apollo.sock` (or `APOLLO_SOCKET_PATH`).

## Queue & Interlink

- BullMQ queues created in `src/queue/queue.js`. Jobs processed by `src/queue/jobs/processCommand.js`.
- `serializeInteraction.js` flattens Discord interactions for queue transport; `remoteInteraction.js` reconstructs them in workers.
- Interlink (`src/plugins/interlink/`) is a separate HTTP/Express server for bot-to-bot RPC with Redis-backed rate limiting and auth.

## Database

- Knex migrations in `src/db/migrations/` (`.cjs` files). Run via `pnpm run migrate` or admin `/migrate` command.
- Adapter pattern in `src/db/adapter.js` provides `getGuildData`/`setGuildData`/`getUserData`/`setUserData` with JSON serialization.
- `src/utils/db.js` is the high-level wrapper used by commands.

## Environment

- `.env` required. Copy from `.env.example`. `dotenv/config` is imported at the top of `src/index.js` and `bin/apollo.js`.
- `src/utils/startupChecks.js` validates `DISCORD_TOKEN` and operator agreement on boot.
- Redis required for queue + interlink + cross-pod EventBus.

## CI & Deploy

- `.github/workflows/`: `ci.yml` (lint + test), `docker.yml`, `deploy.yml`, `release.yml`, `security.yml`, `setup.yml`.
- Docker: `Dockerfile` (dev), `Dockerfile.prod` (production). `docker-compose.yml` orchestrates bot + Redis + Postgres.
- `pnpm manifest` regenerates `plugin-manifest.json` (SHA-256 hashes of source files for integrity verification).

## Gotchas

- `src/data/` is gitignored — runtime data (SQLite DB, logs) lives there.
- `tests/mocks/` is ESLint-ignored — mock files don't need to pass lint.
- `src/handlers/` is excluded from coverage — legacy/auto-generated handlers.
- `pnpm rebuild better-sqlite3` runs in `postinstall` — required for native binding.
- Plugin commands must `export default` an object with `data` (SlashCommandBuilder) or `name`/`description`/`options` for `deploy-commands.js` to pick them up.
