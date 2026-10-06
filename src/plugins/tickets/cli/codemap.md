# src/plugins/tickets/cli/

## Responsibility
CLI registry in `cli/index.ts` for ticket administration: `list` locally plus socket-backed `create`, `close`, `add`, `remove`.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI registry for local ticket listing plus socket-backed mutations |

## Design
- Exports default `{ name, description, commands[] }` with `{ name, description, needsSocket, options, execute? }`. `list` executes via `getGuildData('tickets', guild)` returning open/closed counts and details; mutating commands set `needsSocket: true`.
- Patterns: Command (each CLI entry encapsulates an action), Strategy (local-read versus socket-mutation execution strategies).

## Flow
1. Dispatcher passes `args` with `guild` and ids/reason.
2. `list` transforms stored records without mutation.
3. Mutations forward to `tickets.*` socket handlers for validation and persistence.

## Integration
- Depends on `src/utils/db.ts`; consumed by `bin/apollo.ts` dispatcher and plugin manager socket registry.
