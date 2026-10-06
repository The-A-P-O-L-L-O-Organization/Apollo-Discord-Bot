# src/db/codemap.md

## Responsibility
Provides Knex connectivity and the guild/user data bridge. Supports PostgreSQL (`pg`) for shared deployments and SQLite (`better-sqlite3`) for single instance, selected by `config.db`, with field-level encryption and reversible migrations.

## Files

| File | Purpose |
|------|---------|
| `knex.ts` | Knex getDb singleton, runMigrations, closeDb, and resetTestDb for Postgres and SQLite. |
| `adapter.ts` | Guild and user data bridge with JSON serialization and field-level encryption. |

Subdirectory `migrations/` holds reversible `*.cjs` migration scripts; see `src/db/migrations/codemap.md`.

## Design
- `knex.ts`: `getDb()` singleton, `runMigrations()` via `Knex.migrate.latest()`, `closeDb()`, `resetTestDb()` for isolated tests. Postgres path uses `config.database.postgres` host, port, database, user, password, ssl, and pool; SQLite path uses a file under `src/data/` (gitignored) or `:memory:` when `NODE_ENV=test` or `VITEST=true`. Migration directory is `./migrations` with `cjs` extension.
- `adapter.ts`: `createAdapter(db)` plus `getGuildData`, `setGuildData`, `updateGuildData`, `getAllGuildData`, `getUserData`, `setUserData`, `getAllUserData`, `getData`, `setData`. JSON serialization is central; sensitive guild fields (`interlink_api_key`, `webhook_url`, `api_key`, `secret`, `token`, `password`) and user fields (`access_token`, `refresh_token`, `api_key`, `secret`, `token`, `password`) pass through `encryptFields` and `decryptFields` in `src/utils/encryption.ts`. Tables are `guild_store`, `guild_user_store`, and `interlink_bots`.
- Patterns: Singleton (`getDb()` shared Knex instance), Adapter/Facade (`adapter.ts` bridge with JSON serialization and field encryption over Knex), Factory (`createAdapter(db)` initializing the bridge).

## Flow
1. Startup calls `getDb()` then `runMigrations()` to apply pending `migrations/*.cjs`.
2. Callers use `src/utils/db.ts` (`getGuildData`, `setGuildData`, `getUserData`, `setUserData`), which routes to this adapter for Postgres or to embedded `better-sqlite3` for SQLite.
3. Reads deserialize the `data` column and decrypt sensitive fields; writes encrypt then upsert on the compound primary key.
4. `updateGuildData` performs read-modify-write; concurrent writers require Postgres transactions or conditional updates because SQLite does not support concurrent writers.
5. Shutdown calls `closeDb()`; tests call `resetTestDb()` against temporary databases only.

## Integration
- Depends on `knex`, `pg`, `better-sqlite3`, `src/config/config.ts`, `src/utils/encryption.ts`, `src/utils/logger.ts`.
- Consumed exclusively through `src/utils/db.ts` except inside the bridge itself and migrations. Migration scripts live in `src/db/migrations/`; see `src/db/migrations/codemap.md`.
