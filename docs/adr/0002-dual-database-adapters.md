# 0002: Dual Database Adapters (SQLite/PostgreSQL)

> **Status:** Accepted
> **Date:** 2026-09-27
> **Deciders:** Apollo maintainers
> **Technical Story:** [Master Plan](docs/superpowers/plans/2026-09-27-master-plan.md)

## Context

Apollo needs to support two deployment modes:
- **Single-instance / development**: Zero-config, file-based, no external dependencies
- **Multi-instance / production**: Concurrent writers, HA, shared state across pods

SQLite excels at the first; PostgreSQL at the second. Supporting both without code duplication requires an abstraction layer.

We evaluated:
1. **Single DB (PostgreSQL only)** — Rejected: raises barrier for development/single-instance; SQLite is sufficient for <100 guilds
2. **Single DB (SQLite only)** — Rejected: cannot support concurrent writers in multi-pod production
3. **Adapter pattern with Knex** — Selected: Knex supports both; adapter centralizes JSON serialization, atomic updates

## Decision

We will use **Knex.js** with a **database adapter** (`src/utils/db.ts`) that provides a unified interface:

- **Adapter methods**: `getGuildData`, `setGuildData`, `getUserData`, `setUserData`, `updateGuildData`, `appendToGuildArray`, etc.
- **JSON serialization**: Centralized in adapter; guild/user data stored as JSON blobs
- **Atomic updates**: Read-modify-write via transactions or conditional updates
- **Selection**: `config.database.type` / `DB_TYPE` env var (`sqlite` | `postgres`)

**SQLite config** (dev/single): WAL mode, `busy_timeout=5000`, connection pool max=1
**PostgreSQL config** (prod/multi): Pool capped at 80% of `max_connections` (startup validation), TLS required

Migrations in `src/db/migrations/*.cjs` must be **reversible and tested on both dialects**.

## Consequences

### Positive
- **Zero-config dev**: `pnpm dev` works immediately with SQLite file
- **Production ready**: Same code runs on PostgreSQL with `DB_TYPE=postgres`
- **Single migration source**: Migrations apply to both dialects
- **Test isolation**: Tests use temp SQLite databases via `tests/setup.ts`

### Negative
- **JSON blob limitations**: Guild/user data not queryable via SQL; no indexes on nested fields
- **Dialect differences**: SQLite `jsonb` vs PostgreSQL `jsonb`; migration testing required on both
- **No dev/prod parity**: SQLite and PostgreSQL have different concurrency/locking behavior

### Neutral / Risks
- **Schema evolution**: Adding queryable fields requires migration + adapter update
- **PostgreSQL upgrade**: Major version upgrades require dump/restore (Postgres 18 data path change)

## References

- Implementation: `src/utils/db.ts` (adapter), `knexfile.cjs` (config), `src/db/migrations/` (migrations)
- Tests: `tests/setup.ts` (temp DB), `tests/utils/db.test.ts`
- Plan: Master Plan (2026-09-27)
- Related: ADR 0001 (role split requires shared DB)