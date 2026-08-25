Responsibility
Manages database connectivity, schema migrations, and data access for persistent storage of guild, user, and interlink bot data using Knex.js. Supports both PostgreSQL and SQLite (better-sqlite3) with environment-driven configuration. Provides encrypted storage for sensitive fields and a test utility to reset the database.

Design
- Singleton Pattern: Knex instance is initialized once via `getDb()` in knex.js and reused throughout the application.
- Adapter Pattern: adapter.js abstracts table-specific CRUD operations with automatic JSON serialization/deserialization and transparent encryption/decryption of sensitive fields.
- Modular Migrations: Each migration file (in `src/db/migrations/`) defines `up` and `down` schema changes in CommonJS format, loaded via Knex migration API.
- Configuration-Driven Client Selection: Knex client ('pg' or 'better-sqlite3') and connection details are selected based on `config.database.type`.
- Testability: Includes `resetTestDb()` to wipe the SQLite file between test runs; uses in-memory SQLite when `NODE_ENV` or `VITEST` indicates testing.
- Encryption Integration: Leverages `../utils/encryption.js` to encrypt/decrypt fields listed in `SENSITIVE_GUILD_FIELDS` and `SENSITIVE_USER_FIELDS` before storage/retrieval.

Flow
1. Application imports `getDb()` from `src/db/knex.js` to obtain the Knex singleton.
2. On startup, `runMigrations()` executes pending migrations via `Knex.migrate.latest()`.
3. Modules requiring persistent state import adapter functions (e.g., `getGuildData`, `setUserData`) from `src/db/adapter.js`.
4. Adapter functions:
   - Receive store name, identifiers, and optional data payload.
   - Deserialize JSON data from the `data` column.
   - Decrypt sensitive fields using `decryptFields()` before returning to caller.
   - For write operations, encrypt sensitive fields with `encryptFields()` then serialize to JSON.
   - Perform insert/update/select on appropriate tables: `guild_store`, `guild_user_store`, `interlink_bots`.
5. `updateGuildData` combines read-modify-write by fetching current data, applying an updater function, then persisting the result.
6. On shutdown, `closeDb()` destroys the Knex connection pool.
7. In test environments, `resetTestDb()` may be called to delete the SQLite file and force a fresh in-memory database.

Integration
- Dependencies:
  - `../config/config.js` for database configuration (type, connection strings, pool settings).
  - `../utils/encryption.js` for field-level encryption/decryption.
  - `../utils/logger.js` for migration and lifecycle logging.
- Consumers: Any module (e.g., command plugins, interlink, gateway) needing persistent guild/user state imports adapter functions.
- Internal:
  - `knex.js` exports `getDb`, `runMigrations`, `closeDb`, and `resetTestDb` for lifecycle and test control.
  - `adapter.js` exports CRUD helpers for `guild_store`, `guild_user_store`, and global data (`__global__` store).
  - Migrations directory contains versioned schema files applied via Knex.
- No explicit hooks or events; data flow is synchronous promise‑based via adapter calls.