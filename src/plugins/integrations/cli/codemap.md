# src/plugins/integrations/cli/

## Responsibility
CLI registry in `cli/index.ts` for `list`, `add`, and `remove` integration management.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI registry for local integration listing plus socket-backed add and remove |

## Design
- Exports default `{ name, description, commands[] }` with `{ name, description, options, execute?, needsSocket? }`. `list` executes locally via `getData('integrations')` returning count plus subscriptions; `add`/`remove` set `needsSocket: true` and delegate to `integrations.*` socket handlers.
- Patterns: Command (each CLI entry encapsulates an action), Strategy (local-read versus socket-mutation execution strategies).

## Flow
1. Dispatcher invokes `list` with args and returns structured result.
2. Mutations forward over socket for server-side persistence.

## Integration
- Depends on `src/utils/db.ts`; consumed by `bin/apollo.ts` dispatcher and plugin manager socket registry.
