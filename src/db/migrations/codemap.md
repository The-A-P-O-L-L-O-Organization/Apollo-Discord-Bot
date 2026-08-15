Responsibility
Contains Knex.js migration scripts that define and revert database schema changes for the Apollo Discord Bot.

Design
Each migration follows the CommonJS module pattern exporting async `up` and `down` functions. The `up` function applies schema alterations using the Knex schema builder; the `down` function reverts them. Tables are defined with columns, constraints, indexes, and primary keys via the Knex fluent API.

Flow
Migration execution receives a Knex instance from the migration runner. In `up`, the builder creates tables or modifies schema; in `down`, it drops tables. No application data is read or written during migration; only DDL statements are executed against the database.

Integration
Depends on the `knex` package. Invoked by the migration CLI (e.g., `knex migrate:latest`) during deployment or startup. No other modules directly import these files; they are executed solely by the migration tool.