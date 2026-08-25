Responsibility
Provides Discord slash command and context menu interfaces for automatic moderation (automod) configuration and NSFW scanning. The slash command `/automod` allows administrators to enable/disable automod, manage banned words, configure filters, and set exemptions. The context menu command "Scan for NSFW" (invoked via right-click on a message) scans a single message for NSFW content using the bot's detection utilities and can optionally delete offending messages.

Design
- **Slash Command Structure**: `automod.js` implements a Discord.js slash command with multiple subcommands (enable, disable, status, addword, removeword, listwords, set, exemptchannel, exemptrole, scan). Each subcommand is handled by a dedicated async function that reads/writes guild-specific automod data via `getGuildData`/`setGuildData`.
- **Context Menu Command**: `scanMessage.js` defines a user/context menu command (`ApplicationCommandType.Message`) that processes a single target message, checks attachments for NSFW content, and reports results.
- **Shared Utilities**: Both files import logging, error handling, and NSFW detection utilities (`checkMessageAttachments`, `formatNsfwPredictions`) from `../../../utils/nsfwDetection.js` and `../../../utils/logger.js`. Database access uses the adapter pattern in `src/utils/db.js`.
- **Configuration Defaults**: Falls back to values in `config/config.js` when guild-specific data is absent.
- **Error Handling**: Uses `safeError` and `handleDiscordError` to produce user‑friendly error messages; replies are ephemeral where appropriate.

Flow
1. **Slash Command Invocation** (`automod.js`):
   - Discord interaction creates an `interaction` object.
   - `execute` extracts the subcommand via `interaction.options.getSubcommand()`.
   - Control switches to the corresponding handler (e.g., `handleEnable`, `handleSet`, `handleScan`).
   - Handlers:
     - Read current automod configuration for the guild using `getGuildData('automod', guildId)`.
     - Apply changes (toggle flags, update lists, modify settings).
     - Persist updated configuration via `setGuildData`.
     - Respond with an `EmbedBuilder` message (success/info/error).
   - The `scan` subcommand delegates to a multi‑step message‑scanning routine that fetches messages in batches, checks each for NSFW attachments, respects exemptions, and optionally deletes matches.

2. **Context Menu Invocation** (`scanMessage.js`):
   - User right‑clicks a message and selects "Scan for NSFW".
   - `execute` receives the interaction with `interaction.targetMessage` set to the clicked message.
   - The bot defers the reply, runs `checkMessageAttachments` on the message, and builds an embed with detection details.
   - If NSFW is found and deletion is permitted, the message is deleted.
   - The embed is edited to show final results (including per‑image prediction details).

Integration
- **Internal Dependencies**:
  - `src/utils/db.js` – `getGuildData`, `setGuildData` for persistent per‑guild automod settings.
  - `src/utils/nsfwDetection.js` – `checkMessageAttachments`, `formatNsfwPredictions` for image‑based NSFW scanning.
  - `src/utils/logger.js` – logger for automod actions.
  - `src/utils/safeError.js` – error sanitization.
  - `src/utils/discordErrors.js` – `handleDiscordError`, `safeReply`, `safeFollowUp`.
  - `src/config/config.js` – default automod configuration values.
- **External Dependencies**:
  - `discord.js` – `PermissionsBitField`, `EmbedBuilder`, `ChannelType`, `MessageFlags`, `ApplicationCommandType`.
- **Consumed By**:
  - The bot's command/interaction router (located in `src/handlers/` or similar) registers the slash command and context menu command via `deploy-commands.js` and dispatches interactions to the appropriate command executor.
  - The automod scanning logic is also invoked by the `scan` subcommand of the `/automod` slash command, providing a unified interface for both bulk and on‑demand scanning.