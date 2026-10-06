# src/plugins/utility/cli/

## Responsibility
CLI registry in `cli/index.ts` for tag CRUD plus socket-backed info actions.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI registry for local tag CRUD plus socket-backed info actions |

## Design
- Exports command array with `{ name, description, options, subcommands? }`. `tags` subcommands (`list` and related CRUD) execute locally via `getGuildData`/`setGuildData` on the `tags` key; `serverinfo`, `userinfo`, `ping`, `embed` declare `needsSocket: true` and delegate to `utility.*` socket handlers.
- Patterns: Command (each CLI entry encapsulates an action), Strategy (local versus socket-backed execution strategies).

## Flow
1. CLI dispatcher passes `args` with `guild` plus options.
2. Tag reads mutate an in-memory map then persist via `setGuildData`; reads skip persistence.
3. Socket commands forward over `/tmp/apollo.sock` and return structured results.

## Integration
- Depends on `src/utils/db.ts`; consumed by `bin/apollo.ts` dispatcher and plugin manager socket registry.
