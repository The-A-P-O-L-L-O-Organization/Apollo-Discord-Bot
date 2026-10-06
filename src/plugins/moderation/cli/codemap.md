# src/plugins/moderation/cli/

## Responsibility
Socket-aware CLI tree for moderation (`cli/index.ts`): `ban`, `kick`, `mute`, `warn`, `case`, `clear`, `slowmode`, `lockdown` and related sub-actions.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Socket-aware CLI tree for ban, kick, mute, warn, case, and lockdown actions |

## Design
- Exports default `{ name: 'moderation', description, commands[] }` where each entry has `{ name, description, needsSocket, options[], execute? }`. Mutating actions set `needsSocket: true`; `case` lookup executes locally via `getGuildData('moderation', guild)` and returns the matching case or safe error.
- Patterns: Command (each CLI entry encapsulates an action), Chain of Responsibility (dispatcher routes args to the matching subcommand handler).

## Flow
1. `bin/apollo.ts` parses args and dispatches to the matching CLI definition.
2. Local reads execute directly against `src/utils/db.ts`.
3. Socket actions forward to `moderation.*` handlers registered by `ModerationPlugin` over `/tmp/apollo.sock`.

## Integration
- Depends on `src/utils/db.ts`; consumed by admin CLI dispatcher and plugin manager socket registry. No direct Discord calls from this directory.
