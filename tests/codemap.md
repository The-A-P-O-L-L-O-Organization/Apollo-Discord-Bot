# tests/

## Responsibility
Vitest suite for the strict TypeScript bot, about 162 files matching `tests/**/*.test.ts`. Covers unit, integration, plugin, i18n matrix, queue, and contract behavior with deterministic mocks for Discord, Redis, database, timers, and network. Setup lives in `tests/setup.ts`, shared Discord mocks in `tests/mocks/discord.ts`, fixtures under `tests/fixtures/`.

## Files

| File | Purpose |
|------|---------|
| `setup.ts` | Vitest global setup with console silencing, isolated test DB migration, and i18n init. |
| `command-payload.test.ts` | Localized command payload building and locale checks. |
| `i18n-matrix-automod.test.ts` | Automod plugin locale key coverage matrix. |
| `i18n-matrix-moderation.test.ts` | Moderation plugin locale key coverage matrix. |
| `i18n-matrix-small.test.ts` | Small plugins plus shared choke points locale coverage matrix. |
| `i18n-matrix-tickets.test.ts` | Tickets plugin locale key coverage matrix. |
| `i18n-matrix-utility.test.ts` | Utility plugin locale key coverage remainder matrix. |
| `i18n.test.ts` | Supported locales, third-party plugin locales, and i18n dictionaries. |
| `language-command.test.ts` | Language command locale switching behavior. |
| `locale-lint.test.ts` | Locale file lint for parity, empty values, interpolation, and source extraction. |
| `nsfw-fidelity.test.ts` | NSFW Rust service fidelity checks. |
| `queue-locale.test.ts` | Locale round-trip through queued command payloads. |
| `utility-i18n-matrix.test.ts` | Utility plugin i18n matrix. |
| `worker-i18n.test.ts` | Worker sandbox i18n capability plus interlink raw-locale handling. |

Subdirectories `cli/`, `commands/`, `contracts/`, `core/`, `events/`, `fixtures/`, `integration/`, `mocks/`, `plugins/`, `queue/`, `unit/`, and `utils/` hold grouped test files mirroring the source layout.

## Design
- Runner is Vitest with TypeScript ESM, configured with `tests/setup.ts` as setup file. Style follows focused unit tests plus integration tests for cross-cutting flows.
- Global setup mocks `console.log` and `console.error` to reduce noise, exposes `vi` globally, extends `EmbedBuilder` with getter properties for assertions, runs Knex migrations on an isolated temporary database via `src/db/knex.ts`, initializes i18next with plugin namespaces, and tears down with mock restore plus database close after each file.
- Organization is flat with descriptive names (`queue-locale.test.ts`, `command-payload.test.ts`, `i18n-matrix-*.test.ts`, `locale-lint.test.ts`, `nsfw-fidelity.test.ts`, `worker-i18n.test.ts`) plus `mocks/` for discord.js doubles and `fixtures/` including worker plugin stubs. No `setup.js`, no `tests/**/*.test.js` pattern, no `src/handlers` coverage target.
- Security-relevant changes require tests for auth, validation, signature verification, path containment, rate limiting, and safe error handling. Tests are never weakened to make changes pass.
- Patterns: Test Double (mocks for Discord, Redis, database, timers, network), Fixture (`tests/setup.ts` isolated database plus i18n init).

## Flow
1. Vitest loads `tests/setup.ts`: reset isolated test database, run migrations, init i18n and load namespaces (moderation, common, interlink, plugin, tickets, automod, utility, admin).
2. Each `tests/**/*.test.ts` file runs with `beforeEach` console silencing and `afterEach` mock restore plus clear for isolation.
3. Tests import from `src/**/*.ts` directly (for example `src/core/PluginManager.ts`, `src/utils/logger.ts`), using manual mocks in `tests/mocks/discord.ts` and `vi` spies for Redis, Knex, fetch, and timers.
4. `afterAll` closes the database connection. Coverage excludes `src/index.ts`, tests, binaries, scripts, generated code, and `dist/`.
5. Developers run `pnpm test` for the full suite, `pnpm vitest run <path>` for a focused file, and `pnpm coverage` for coverage.

## Integration
- Source under test: `src/**/*.ts` including core lifecycle, queue jobs, gateway leader, database adapters, i18n payloads, and all 7 plugins.
- Configuration: Vitest config references `tests/setup.ts`, test pattern `tests/**/*.test.ts`, coverage exclusions for entries, scripts, generated code, and `dist/`.
- Dependencies: Vitest, discord.js v14, Knex with isolated SQLite or Postgres test database, ioredis mocks, plus CI execution via `pnpm test` in the ci and integration-tests workflows.
