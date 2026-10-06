# src/plugins/automod/commands/automod/

## Responsibility
Subcommand handlers behind the `/automod` dispatcher. Each module implements one wordlist or configuration action: viewing status, enabling or disabling modules, managing the wordlist, setting exemptions, tuning thresholds, and running scans.

## Files

| File | Purpose |
|------|---------|
| `status.ts` | Shows automod enabled state and current filter thresholds as an embed. |
| `enable.ts` | Enables automod protection for the guild. |
| `disable.ts` | Disables automod protection for the guild. |
| `addword.ts` | Adds a word to the automod blocklist. |
| `removeword.ts` | Removes a word from the automod blocklist. |
| `listwords.ts` | Lists blocked words for the guild. |
| `set.ts` | Updates automod thresholds and filter toggles. |
| `exemptchannel.ts` | Exempts a channel from automod checks. |
| `exemptrole.ts` | Exempts a role from automod checks. |
| `scan.ts` | Runs a context-menu scan of a message against automod rules. |

## Design
- Patterns: Command (one exported handler per subcommand, invoked by the `automod` dispatcher), Strategy (each file encapsulates one configuration mutation or inspection).
- Handlers read and write guild automod config through `src/utils/automod.ts` (`getAutomodConfig` and related setters); locale strings resolve via fixed translators in the `automod` namespace.
- Permission guards restrict mutation subcommands to moderators; validation precedes every config write.

## Flow
1. `/automod <subcommand>` arrives at the dispatcher in `src/plugins/automod/commands/`, which routes to the handler here.
2. Handler validates options and caller permissions, loads guild config, applies the mutation or builds the status embed.
3. Config persists via the db bridge; confirmation reply uses locale strings, never raw config dumps.

## Integration
- Consumed by: automod command dispatcher in `src/plugins/automod/commands/`.
- Depends on: `src/utils/automod.ts`, `src/utils/db.ts`, `src/i18n/`, `src/utils/logger.ts`.
- Sibling CLI mirror lives in `src/plugins/automod/cli/`.
