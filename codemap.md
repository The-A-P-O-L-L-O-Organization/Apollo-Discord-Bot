# Repository Atlas: Apollo-Discord-Bot

## Project Responsibility
Modular Discord bot with plugin system, multi-instance HA, and Redis-backed queue architecture. Provides moderation, automod, tickets, integrations, interlink (bot-to-bot RPC), utility, and admin features via a sandboxed plugin runtime.

## System Entry Points
- `src/index.js`: Bot entry point. Initializes discord.js client, EventBus, PluginManager, queue, schedulers, and lifecycle hooks.
- `bin/apollo.js`: CLI entry point. Bootstraps environment, discovers commands, executes CLI interface.
- `src/cli/index.js`: CLI orchestration (parse, format, discover, socket client/server).
- `src/gateway/leader.js`: Gateway leader election for multi-instance HA.
- `src/core/worker/workerHost.js`: Master process for sandboxed plugin workers.
- `src/core/worker/workerChild.js`: Child process runtime for sandboxed plugins.
- `package.json`: Dependency manifest and scripts (start, start:gateway, start:worker, test, lint, deploy).
- `plugin-manifest.json`: Plugin registry manifest.
- `deploy-commands.js`: Slash command deployment script.

## Directory Map (Aggregated)

| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `bin/` | CLI entry point script for bootstrapping and command execution. | [View Map](bin/codemap.md) |
| `scripts/` | Build and maintenance scripts (manifest generation). | [View Map](scripts/codemap.md) |
| `src/` | Application source root. | [View Map](src/codemap.md) |
| `src/cli/` | Command-line interface: argument parsing, command discovery, output formatting, Unix socket IPC. | [View Map](src/cli/codemap.md) |
| `src/config/` | Centralized configuration singleton from environment variables. | [View Map](src/config/codemap.md) |
| `src/core/` | Plugin lifecycle, EventBus, PluginManager, PluginRegistry, worker sandboxing, plugin downloader. | [View Map](src/core/codemap.md) |
| `src/core/worker/` | Master-worker IPC for sandboxed plugin execution (workerHost, workerChild, rpc, pluginManifest). | [View Map](src/core/worker/codemap.md) |
| `src/db/` | Database connectivity via Knex.js; adapter pattern for guild/user/interlink storage; migration runner. | [View Map](src/db/codemap.md) |
| `src/db/migrations/` | Schema migrations (initial schema, interlink_bots table). | [View Map](src/db/migrations/codemap.md) |
| `src/gateway/` | Gateway leader election for multi-instance HA coordination. | [View Map](src/gateway/codemap.md) |
| `src/plugins/` | Plugin registry: admin, automod, integrations, interlink, moderation, tickets, utility. | [View Map](src/plugins/codemap.md) |
| `src/plugins/admin/` | Admin plugin: bot configuration, moderation utilities, plugin lifecycle, database ops, queue monitoring, system health. | [View Map](src/plugins/admin/codemap.md) |
| `src/plugins/admin/cli/` | Admin CLI command specifications. | [View Map](src/plugins/admin/cli/codemap.md) |
| `src/plugins/admin/commands/` | Admin slash commands (logging, migrate, plugin, queue, reactionrole, setlogchannel, system). | [View Map](src/plugins/admin/commands/codemap.md) |
| `src/plugins/admin/events/` | Admin event handlers (guildBan, guildCreate/Delete, guildMemberUpdate, messageDelete, messageReaction, messageUpdate, voiceStateUpdate). | [View Map](src/plugins/admin/events/codemap.md) |
| `src/plugins/automod/` | Automod plugin: content moderation, NSFW detection, raid detection, OpenAI moderation. | [View Map](src/plugins/automod/codemap.md) |
| `src/plugins/automod/cli/` | Automod CLI command specifications. | [View Map](src/plugins/automod/cli/codemap.md) |
| `src/plugins/automod/commands/` | Automod slash commands. | [View Map](src/plugins/automod/commands/codemap.md) |
| `src/plugins/automod/events/` | Automod event handlers (messageCreate). | [View Map](src/plugins/automod/events/codemap.md) |
| `src/plugins/integrations/` | Integrations plugin: external service connectors (GitHub, etc.) with webhook and polling support. | [View Map](src/plugins/integrations/codemap.md) |
| `src/plugins/integrations/cli/` | Integrations CLI command specifications. | [View Map](src/plugins/integrations/cli/codemap.md) |
| `src/plugins/integrations/commands/` | Integrations slash commands. | [View Map](src/plugins/integrations/commands/codemap.md) |
| `src/plugins/interlink/` | Interlink plugin: bot-to-bot RPC over HTTP/Express with Redis-backed rate limiting, message bus, registry, auth. | [View Map](src/plugins/interlink/codemap.md) |
| `src/plugins/interlink/commands/` | Interlink slash commands. | [View Map](src/plugins/interlink/commands/codemap.md) |
| `src/plugins/moderation/` | Moderation plugin: ban, kick, mute, warn, tempban, temp roles, modlog. | [View Map](src/plugins/moderation/codemap.md) |
| `src/plugins/moderation/cli/` | Moderation CLI command specifications. | [View Map](src/plugins/moderation/cli/codemap.md) |
| `src/plugins/moderation/commands/` | Moderation slash commands (ban, kick, mute, warn, etc.). | [View Map](src/plugins/moderation/commands/codemap.md) |
| `src/plugins/moderation/events/` | Moderation event handlers (guildMemberAdd, guildMemberRemove). | [View Map](src/plugins/moderation/events/codemap.md) |
| `src/plugins/tickets/` | Tickets plugin: support ticket lifecycle, templates, ratings, priorities, SLA tracking. | [View Map](src/plugins/tickets/codemap.md) |
| `src/plugins/tickets/cli/` | Tickets CLI command specifications. | [View Map](src/plugins/tickets/cli/codemap.md) |
| `src/plugins/tickets/commands/` | Ticket slash commands (assign, close, create, info, list, priority, ratings, search, setup, stats, template, transfer). | [View Map](src/plugins/tickets/commands/codemap.md) |
| `src/plugins/tickets/events/` | Ticket event handlers (interactionCreate). | [View Map](src/plugins/tickets/events/codemap.md) |
| `src/plugins/utility/` | Utility plugin: info commands, fun, XP/leveling, reminders, polls, analytics, privacy/legal, help, translate, tags, giveaways. | [View Map](src/plugins/utility/codemap.md) |
| `src/plugins/utility/cli/` | Utility CLI command specifications. | [View Map](src/plugins/utility/cli/codemap.md) |
| `src/plugins/utility/commands/` | Utility slash commands (serverinfo, userinfo, avatar, 8ball, joke, roll, embed, level, leaderboard, remind, poll, analytics, stats, sla, datadeletion, operatorcontact, apollo, announcement, giveaway, help, invite, ping, report, tag, translate). | [View Map](src/plugins/utility/commands/codemap.md) |
| `src/plugins/utility/events/` | Utility event handlers (messageCreate). | [View Map](src/plugins/utility/events/codemap.md) |
| `src/queue/` | BullMQ-based background job processing: queue creation, interaction serialization, remote interaction mocking, metrics, job routing. | [View Map](src/queue/codemap.md) |
| `src/queue/jobs/` | Job handlers (processCommand). | [View Map](src/queue/jobs/codemap.md) |
| `src/utils/` | Cross-cutting utilities: db, logger, moderation, NSFW detection, translation, schedulers, safeFetch, lock, analytics, integrations, charts, markdown parser. | [View Map](src/utils/codemap.md) |
| `tests/` | Vitest test suite setup and global configuration. | [View Map](tests/codemap.md) |
| `tests/fixtures/` | Test fixtures (worker plugin stubs). | [View Map](tests/fixtures/codemap.md) |
| `tests/fixtures/worker-plugins/` | Worker plugin test fixtures. | [View Map](tests/fixtures/worker-plugins/codemap.md) |
| `tests/fixtures/worker-plugins/demo/` | Demo worker plugin fixture. | [View Map](tests/fixtures/worker-plugins/demo/codemap.md) |
| `tests/mocks/` | Discord.js mocks for testing. | [View Map](tests/mocks/codemap.md) |
