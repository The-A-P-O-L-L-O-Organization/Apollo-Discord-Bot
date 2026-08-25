Responsibility
Provide owner-restricted Discord slash command interface for managing cross-bot communication, including bot registration, listing, messaging, broadcasting, API key rotation, and override activation.

Design
Implements the command pattern with subcommand routing; uses factory functions createRegistry and createBus for dependency injection; relies on BotRegistry for persistence and MessageBus for transport; employs guard functions isOwner/getOwnerIds for authorization; handles errors via safeError and discord error utilities; sends sensitive data (API keys) via DM to avoid exposure in channel logs.

Flow
1. Interaction received and deferred ephemerally.
2. Authorization verified via isOwner checking OWNER_IDS.
3. Subcommand extracted from interaction options.
4. Dispatch to corresponding private handler (_list, _register, _remove, _send, _broadcast, _rotateKey, _override).
5. Handlers interact with BotRegistry (CRUD operations) and MessageBus (send/broadcast) as needed.
6. Results formatted into embeds and sent via editReply/followUp.
7. Errors caught and returned as error embeds via safeError/discord error handling.

Integration
Dependencies: ../registry.js (BotRegistry), ../messageBus.js (MessageBus), ../auth.js (generateApiKey), ../../db/knex.js (getDb), ../../utils/safeError.js, ../../utils/accessControl.js (isOwner, getOwnerIds), ../../utils/discordErrors.js, ../../utils/logger.js, discord.js (MessageFlags).
Consumed by: ../plugin.js (loads command module), potentially external systems via webhook endpoints defined in registry.