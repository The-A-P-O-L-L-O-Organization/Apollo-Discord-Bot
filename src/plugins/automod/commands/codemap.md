# src/plugins/automod/commands/

## Responsibility
Slash dispatcher `automod.ts`, context-menu `scanMessage.ts`, and 10 subcommand handlers in `automod/`: `addword.ts`, `disable.ts`, `enable.ts`, `exemptchannel.ts`, `exemptrole.ts`, `listwords.ts`, `removeword.ts`, `scan.ts`, `set.ts`, `status.ts`.

## Files

| File | Purpose |
|---|---|
| `automod.ts` | Defines the `/automod` command and delegates each subcommand to its handler. |
| `automod/addword.ts` | Adds a word to the banned-words list. |
| `automod/disable.ts` | Disables automod for the server. |
| `automod/enable.ts` | Enables automod for the server. |
| `automod/exemptchannel.ts` | Adds or removes a channel from automod exemptions. |
| `automod/exemptrole.ts` | Adds or removes a role from automod exemptions. |
| `automod/listwords.ts` | Lists all banned words. |
| `automod/removeword.ts` | Removes a word from the banned-words list. |
| `automod/scan.ts` | Scans recent channel messages for NSFW content, optionally deleting hits. |
| `automod/set.ts` | Configures an automod setting (toggles, limits, thresholds). |
| `automod/status.ts` | Shows the current automod configuration. |
| `scanMessage.ts` | Message context-menu command that runs an NSFW scan on the target message. |

## Design
- `automod.ts` defines the `/automod` command and delegates by `getSubcommand()` to the matching handler in `automod/`; handlers read/write `getGuildData`/`setGuildData` on the `automod` key and fall back to `src/config/config.ts` defaults. `scanMessage.ts` uses `ApplicationCommandType.Message` for right-click NSFW scans.
- Patterns: Command (each module encapsulates an action), Chain of Responsibility (dispatcher delegates each subcommand to its handler).

## Flow
1. Slash invocation extracts subcommand and delegates to `automod/<sub>.ts`.
2. Handler updates enabled flags, word lists, filter toggles, thresholds, or exemption lists, persists, and replies with embed; `scan` batches message fetches, respects exemptions, optionally deletes NSFW matches.
3. Context invocation defers, runs `checkMessageAttachments` on the target message, reports predictions, deletes where permitted.

## Integration
- Dependencies: `src/utils/db.ts`, `src/utils/nsfwDetection.ts`, `src/utils/logger.ts`, `src/utils/safeError.ts`, `src/utils/discordErrors.ts`, `src/config/config.ts`, `discord.js`.
- Consumed by `AutomodPlugin._loadCommands` and `scripts/deploy-commands.ts`.
