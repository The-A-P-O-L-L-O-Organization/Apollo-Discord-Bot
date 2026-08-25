# Responsibility
Contains the test suite for the Apollo Discord Bot, including unit, integration, and contract tests. Configures the Vitest environment via setup.js, mocks external dependencies, and provides utilities for testing Discord interactions, plugins, core systems, and CLI functionality.

# Design
- **Test Framework**: Uses Vitest as the test runner with ES modules.
- **Global Setup**: `setup.js` is configured via Vitest's `setupFiles` option to:
  - Provide `vi` globally for mocking and spying.
  - Mock `console.log` and `console.error` to reduce test noise.
  - Extend `Discord.js EmbedBuilder.prototype` with getter properties for test assertions on embed fields.
  - Manage database lifecycle: run migrations before tests and close connections after.
  - Restore and clear mocks after each test for isolation.
- **Test Organization**: 
  - `unit/`: Isolated tests for individual utility functions.
  - `core/`: Tests for core bot systems (PluginManager, worker, EventBus, etc.).
  - `events/`: Tests for Discord event handlers (messageCreate, interactionCreate, etc.).
  - `commands/`: Tests for slash command implementations.
  - `cli/`: Tests for the bot's command-line interface.
  - `contracts/`: Tests verifying plugin API compliance.
  - `integration/`: Tests for cross-process interactions (worker isolation).
  - `fixtures/`: Contains test fixtures, including sample worker plugins.
  - `mocks/`: Manual mocks for external libraries (e.g., discord.js).
  - `plugins/`: Tests for bundled plugins (e.g., interlink).
  - `utils/`: Additional utility tests (may overlap with unit/ but organized by concern).
- **Mocking Strategy**: Uses Vitest's `vi` for spying and mocking; manual mocks in `__mocks__` or `mocks/` directory for whole modules.
- **Database Testing**: Uses a test database (SQLite in-memory or PostgreSQL) with Knex migrations run via `setup.js`.

# Flow
1. **Test Initialization**: Vitest automatically imports `setup.js` before any test files.
2. **Setup Execution**:
   - Imports Vitest utilities, Discord.js EmbedBuilder, and database helpers.
   - Assigns `vi` to global scope for access in tests.
   - Sets up `beforeEach` hooks to mock console methods.
   - Runs `beforeAll` hooks to reset the test database and apply Knex migrations.
   - Defines EmbedBuilder property getters for test assertions.
3. **Test Execution**: Individual test files run, utilizing:
   - Global `vi` for mocking.
   - Extended EmbedBuilder getters to inspect embed properties.
   - Database helpers (if needed) for DB-related tests.
   - Mocks for external services (Redis, Discord API, etc.).
4. **Teardown**:
   - `afterEach` restores and clears all mocks.
   - `afterAll` closes the database connection after all tests complete.

# Integration
- **Source Code**: Tests import and test modules from `src/` (e.g., `src/core/PluginManager.js`, `src/utils/logger.js`).
- **Configuration**: Vitest configuration (`vitest.config.js` in project root) specifies:
  - `setupFiles: ['./tests/setup.js']`
  - Test file pattern: `tests/**/*.test.js`
  - Coverage excludes: `src/index.js` and `src/handlers/**`
- **Dependencies**: Relies on Vitest, Discord.js, Knex, and other dev dependencies.
- **CI Integration**: Test suite runs via `pnpm test` in CI pipelines (GitHub Actions).
- **Plugin System**: Tests for plugins (in `tests/plugins/`) follow the same patterns as core tests, ensuring plugin compatibility.
- **Worker Isolation**: Integration tests in `tests/integration/` verify BullMQ job processing and worker communication.