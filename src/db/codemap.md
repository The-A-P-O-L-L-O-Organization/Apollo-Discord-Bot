Responsibility
Provides database connectivity, schema management, and data access layer for guild, user, and interlink bot storage using Knex.js.

Design
- Singleton pattern: Knex instance initialized once via getDb()
- Adapter pattern: adapter.js abstracts table-specific CRUD operations with JSON serialization
- Modular migrations: Each migration file defines up/down schema changes in CJS format
- Configuration-driven client selection: Supports PostgreSQL or SQLite based on config

Flow
1. Application imports getDb() from knex.js to obtain Knex singleton
2. runMigrations() executes pending migrations via Knex migrate.latest()
3. Adapter functions (e.g., getGuildData) receive store, identifiers, and data payloads
4. Data is deserialized from JSON strings on read, serialized on write via JSON.parse/stringify
5. Knex performs insert/update/select on tables: guild_store, guild_user_store, interlink_bots
6. updateGuildData combines read-modify-write using getter and setter functions
7. closeDb() destroys Knex connection pool on shutdown

Integration
- Dependencies: ../config/config.js (database configuration)
- Consumers: Modules requiring persistent state import adapter functions (e.g., command plugins)
- Internal: knex.js exports getDb, runMigrations, closeDb for lifecycle management
- No explicit hooks or events; data flow is synchronous promise-based via adapter calls