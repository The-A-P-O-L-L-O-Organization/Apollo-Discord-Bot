Responsibility
The integrations plugin manages external service integrations (Twitch, YouTube, GitHub, RSS) by allowing users to subscribe to updates from these services and post notifications to Discord channels. It provides both polling-based and webhook-based mechanisms for receiving updates, along with a slash command for managing subscriptions and a CLI interface for administrative tasks.

Design
- Extends the base Plugin class (`src/core/Plugin.js`).
- Uses `initIntegrationPoller` and `stopIntegrationPoller` from `src/utils/integrationPoller.js` for periodic polling of external services.
- Uses `startWebhookServer` and `stopWebhookServer` from `src/utils/integrationWebhook.js` for handling incoming webhooks (currently configured for GitHub).
- Registers socket handlers for 'integrations.add' and 'integrations.remove' to allow remote management via Unix socket.
- Stores subscription data in the database via `src/utils/db.js` (getData/setData) under the key 'integrations'.
- The slash command (`src/plugins/integrations/commands/integration.js`) provides subcommands to add, remove, and list integrations.
- The CLI (`src/plugins/integrations/cli/index.js`) exposes integration management over the socket interface for administrative use.

Flow
onEnable:
  1. Loads the integration slash command.
  2. Registers socket handlers for 'integrations.add' and 'integrations.remove'.
  3. Initializes the integration poller with the client configuration.
  4. If webhookPort and githubSecret are configured in the client config, starts the webhook server.

onDisable:
  1. Unloads the integration slash command.
  2. Stops the integration poller.
  3. Stops the webhook server.

Socket Handlers:
  - 'integrations.add': Returns a success message indicating the integration type was added (note: this handler currently does not persist data; data persistence is handled via the slash command).
  - 'integrations.remove': Returns a success message indicating the integration ID was removed (note: similarly, this handler does not persist data).

Slash Command Flow:
  - /integration add: Validates input, generates a new ID, stores subscription data (guild, channel, type, target), and replies with confirmation.
  - /integration remove: Finds subscription by ID and guild, removes it, and replies with confirmation.
  - /integration list: Retrieves all subscriptions for the guild and displays them in an embed.

CLI Flow:
  - The CLI commands are executed over the socket and interact with the database directly to list, add, or remove integrations (with add/remove requiring socket enabled).

Integration
Dependencies:
  - core/Plugin: Base class for plugin lifecycle.
  - utils/integrationPoller: Provides polling mechanism for external services.
  - utils/integrationWebhook: Provides webhook server for receiving external notifications.
  - utils/db: Database abstraction for storing subscription data.
  - utils/logger: Logging utility.
  - utils/discordErrors: Error handling for Discord interactions.
  - discord.js: For command permissions and message flags.

Consumed by:
  - Socket events: 'integrations.add' and 'integrations.remove' (for remote administrative actions).
  - Slash command: `/integration` (for user-facing management in Discord).
  - CLI: `apollo integrations` (for administrative tasks via socket).
  - External services: 
      * Polling: Twitch, YouTube, RSS (via integrationPoller).
      * Webhooks: GitHub (via integrationWebhook).

Data Flow:
  - Subscriptions are stored in the database (key: 'integrations') with fields: id, guild_id, channel_id, type, target_id, config, last_checked, created_at.
  - The integration poller periodically checks each subscription for updates from the respective service and posts notifications to the associated channel.
  - Webhook server (when configured) receives POST requests from GitHub (secured by secret) and processes them to generate notifications.