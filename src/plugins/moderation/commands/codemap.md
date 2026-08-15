# src/plugins/moderation/commands/

## Responsibility
This directory contains Discord slash command implementations for moderation actions. Each file exports a command object that defines a specific moderation operation (e.g., ban, kick, mute, warn) and its execution logic.

## Design
- **Command Pattern**: Each file encapsulates a single command as a self‑contained module exporting an object with `name`, `description`, `category`, `defaultMemberPermissions`, `dmPermission`, `options`, and an `async execute(interaction)` method.
- **Modular Utilities**: Shared cross‑cutting concerns (mod logging, case creation, analytics, permission checks, error handling) are abstracted into utility modules under `src/plugins/moderation/utils/` and imported as needed.
- **Discord.js Integration**: Command structure follows discord.js API for slash commands, using `Interaction` objects and `PermissionsBitField` for permission validation.

## Flow
1. **Invocation**: Discord sends an interaction event when a user executes a slash command.
2. **Parsing**: The command handler routes the interaction to the appropriate module based on `command.name`.
3. **Validation**: 
   - Options are extracted via `interaction.options.get*` methods.
   - Preconditions (e.g., user existence, delete‑day range, self‑bot bans) are checked.
   - Hierarchy permission is verified via `canModerate(guild, member, targetMember)`.
4. **Action Execution**: Core moderation action is performed (e.g., `guild.bans.create`, `guild.members.timeout`, `guild.members.kick`).
5. **Side Effects**: 
   - Analytics are tracked and flushed (`trackModAction`, `flushAnalyticsCritical`).
   - A moderation case is created via `createModCase`.
   - Success embed is replied to the interaction.
   - A moderation log entry is dispatched via `sendModLog`.
   - Action is logged to console.
6. **Error Handling**: Any thrown error is caught, an error embed is constructed with `safeError`, and replied via `editReply` or `reply`.

## Integration
- **Dependencies**: 
  - `discord.js` (core library)
  - `../../../utils/modLog.js` (sendModLog)
  - `../../../utils/modLog.js` (fetchMember)
  - `./case.js` (createModCase)
  - `../../../utils/analyticsCollector.js` (trackModAction, flushAnalyticsCritical)
  - `../../../utils/moderation.js` (canModerate)
  - `../../../utils/safeError.js` (safeError)
- **Consumers**: The command loader in `src/plugins/moderation/index.js` (or equivalent) dynamically imports all `.js` files in this directory and registers their exported objects with the Discord client’s command registry.
- **Events**: No custom events are emitted; side effects occur via direct utility function calls and Discord API interactions.