# src/plugins/admin/cli/

## Responsibility
CLI registry in `cli/index.ts` for system info, plugin management, and logging configuration.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI registry for local system info plus socket-backed plugin actions |

## Design
- Exports command tree with `{ name, description, options, subcommands }`. Read-only `system` actions execute locally via Node process APIs; plugin/logging mutations set `needsSocket: true` and delegate to `admin.*` socket handlers.
- Patterns: Command (each CLI entry encapsulates an action), Facade (socket handlers present a unified admin surface to the CLI).

## Flow
1. CLI dispatcher routes by command name and parses options.
2. Local executes return structured info objects.
3. Socket actions forward over `/tmp/apollo.sock` to `AdminPlugin` handlers.

## Integration
- Depends on Node process APIs; consumed by `bin/apollo.ts` dispatcher and plugin manager socket registry.
