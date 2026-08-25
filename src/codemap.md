# src/

## Responsibility
The src/ directory is the application source root containing the main entry points and core modules of the Apollo Discord Bot. It initializes the Discord client, loads plugins, manages sharding, processes queue jobs, and provides core services such as event bus, database access, logging, and configuration. This folder coordinates all high-level bot functionality and serves as the central hub for system integration.

## Design
- **Modular Architecture**: Separation of concerns via distinct modules (index.js for main bot, shard.js for sharding management, worker.js for queue processing, config/ for configuration, core/ for plugin system, utils/ for shared utilities, db/ for database abstraction, queue/ for BullMQ integration, plugins/ for extensible functionality).
- **Plugin System**: Core/pluginManager.js dynamically loads and manages plugins, exposing capabilities via an EventBus and worker-host RPC for sandboxed execution of third-party plugins.
- **Sharding Support**: Uses discord.js ShardingManager to spawn multiple shard workers; src/shard.js handles leader election and cross-shard communication via Unix socket RPC.
- **Queue-Based Job Processing**: BullMQ workers (src/worker.js) process commands and background jobs serialized from Discord interactions, ensuring safe execution across processes.
- **Event-Driven Communication**: Core/EventBus.js facilitates loose-coupling between modules; events are forwarded to plugins via worker host for isolated handling.
- **Configuration Management**: Centralized config/config.js provides environment-driven settings with validation and defaults for all subsystems.
- **Dependency Injection**: Key services (database adapter, logger, plugin manager) are instantiated and passed where needed, promoting testability and modularity.

## Flow
1. **Startup**: 
   - src/index.js loads environment variables, validates configuration, and creates Discord client with base intents.
   - Instantiates EventBus and PluginManager, attaching them to the client.
   - On `clientReady`, loads plugins via PluginManager.loadAll(), starts health and socket servers, and registers event forwarders to plugins.

2. **Sharding (if enabled)**:
   - src/shard.js validates sharding config, creates ShardingManager, and spawns shard workers (each running src/index.js with --shard flag).
   - Workers register for leader election and execute per-shard tasks (reminders, polls, etc.) while global tasks run on the elected leader.

3. **Worker Mode**:
   - When RUN_MODE=worker, src/worker.js initializes database, registers job handlers, and connects to Redis-backed BullMQ queues.
   - Jobs (e.g., command processing) are pulled from queues and executed via handleJob(), with results reported back.

4. **Request Handling**:
   - Discord interactions (slash commands, buttons, etc.) are received by the client in index.js.
   - Interactions are serialized (via src/queue/serializeInteraction.js) and sent as jobs to the command queue.
   - Workers deserialize and execute commands, potentially calling plugin commands or core utilities.
   - Plugins emit events via EventBus, which are forwarded to worker-hosted plugin instances for isolated processing.

5. **Graceful Shutdown**:
   - SIGTERM/SIGINT triggers cleanup: closing queues, database connections, Redis locks, health servers, and shard broadcast eval (if sharding).

## Integration
- **Internal Modules**: 
  - index.js integrates with config/, core/, utils/, db/, queue/, and plugins/.
  - shard.js coordinates multiple index.js instances via ShardingManager.
  - worker.js consumes jobs from queues and uses db/ and utils/ for execution.
  - core/PluginManager manages plugin lifecycle and capability routing.
  - queue/ defines BullMQ connections and job serialization/deserialization utilities.
- **External Systems**:
  - Discord API via discord.js library (gateway and REST).
  - Redis for BullMQ queuing, inter-bot communication (Interlink), locking, and event forwarding.
  - PostgreSQL/SQLite via Knex for persistent storage (managed through db/ and utils/db.js).
  - Filesystem for plugin storage, logs, and runtime data (src/data/ is gitignored).
  - Unix domain sockets (/tmp/apollo.sock or shard-specific) for RPC between gateway and worker plugins.
  - HTTP interface (Interlink plugin) for bot-to-bot communication (optional).