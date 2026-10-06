# src/db/migrations/codemap.md

## Responsibility
Versioned, reversible DDL for both SQLite and Postgres. Two migrations define the full shared schema.

## Files

| File | Purpose |
|------|---------|
| `20260509_001_initial.cjs` | Creates guild store, guild user store, and migration metadata tables |
| `20260702_001_interlink_bots.cjs` | Creates interlink bots registry table with key hash and scopes |

## Design
- Patterns: Versioned Migration (ordered `up`/`down` pairs with forward/backward testing on both drivers).
- `20260509_001_initial.cjs`: `up` creates `guild_store` (`store`, `guild_id`, `data`, compound primary key), `guild_user_store` (`store`, `guild_id`, `user_id`, `data`, compound primary key), and `migration_meta` (`key`, `value`); `down` drops all three. Uses `jsonb` with `'{}'` and `'[]'` defaults, compatible with both drivers.
- `20260702_001_interlink_bots.cjs`: `up` creates `interlink_bots` (`id` primary, `name` unique, `description`, `webhook_url`, `supports_redis`, `api_key_hash`, `api_key_prefix`, `scopes`, `is_active`, `last_seen_at`, `created_at`, `updated_at`); `down` drops the table.
- Both files export async `up(knex)` and `down(knex)` in CommonJS form, loaded by Knex with `extension: cjs`. No DML and no data loss; only DDL.

## Flow
1. `src/db/knex.ts` `runMigrations()` invokes `Knex.migrate.latest()` against `./migrations`.
2. `up` runs in filename order on deploy or startup; `down` runs in reverse for rollback testing.
3. Forward and backward runs must be tested on both SQLite and Postgres before merge.

## Integration
- Depends only on the injected `knex` instance. Executed by `pnpm migrate` and startup migration runner; never imported directly by application modules, which instead use `src/utils/db.ts` (`getGuildData`, `setGuildData`, `getUserData`, `setUserData`).
