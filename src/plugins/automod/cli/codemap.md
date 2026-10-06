# src/plugins/automod/cli/

## Responsibility
CLI registry in `cli/index.ts` mirroring slash subcommands (`enable`, `disable`, `status`, `addword`, `removeword`, `listwords`, `set`, `exemptchannel`, `exemptrole`) for scripting.

## Files

| File | Purpose |
|------|---------|
| `index.ts` | CLI scripting mirror of automod subcommands via guild database config |

## Design
- Exports `{ name, description, commands[] }` with `{ name, description, options[], execute }`. Helpers read via `getGuildData('automod', guild)` and persist via `setGuildData`, updating enabled flags, word lists, thresholds, and exemptions.
- Patterns: Command (each CLI entry mirrors a slash subcommand as an encapsulated action).

## Flow
1. Dispatcher passes `args` with `guild` and parameters.
2. Load config, apply read or mutation, persist, return success plus message.

## Integration
- Depends on `src/utils/db.ts`; consumed by `bin/apollo.ts` dispatcher.
