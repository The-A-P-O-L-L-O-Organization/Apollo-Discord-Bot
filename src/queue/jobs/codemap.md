# src/queue/jobs/

## Responsibility
Contains the job handler and enqueue utility for processing Discord slash commands asynchronously via BullMQ workers. Defines the PROCESS_COMMAND job type, serializes command interactions for queue transport, and reconstructs them in worker processes for execution.

## Design
- **Job Encapsulation**: Uses a named constant `JobNames.PROCESS_COMMAND` for type-safe job identification.
- **Producer-Consumer Pattern**: `enqueueCommand` (producer) adds jobs to the queue; registered handler (consumer) processes them.
- **Command Module Caching**: Implements a Map-based cache (`commandModuleCache`) to avoid re-importing command modules on every job.
- **Dependency Abstraction**: Relies on `createQueue` and `registerHandler` from `../queue.js` and `../jobHandler.js` for BullMQ integration.
- **Serialization/Deserialization**: Uses `serializeInteraction` to flatten interaction data and `RemoteInteraction` to rebuild it in workers.
- **Error Handling & Metrics**: Integrates with logging, metrics recording, and error embeds for observability.

## Flow
1. **Command Invocation**: A slash command interaction is received in the gateway/bot process.
2. **Enqueue**: The command file calls `enqueueCommand(interaction)` (imported from this module).
   - Serializes the interaction via `serializeInteraction`.
   - Attaches `pluginId` for plugin-aware lookup.
   - Adds a job of type `PROCESS_COMMAND` to the BullMQ queue with the interaction ID as job ID and deduplication TTL.
3. **Worker Processing**: A BullMQ worker pulls the job and invokes the registered handler.
   - Reconstructs a REST client and a `RemoteInteraction` from the serialized data.
   - Attempts to import the command module using `importCommandModule`, checking plugin-specific paths then falling back to a global scan.
   - Validates the exported module has an `execute` function.
   - Executes the command, logging success/failure and recording metrics.
   - On error, sends an error embed to the interaction (if possible) and returns an error status.
4. **Completion**: The worker returns a status object (`completed` or `error`) which BullMQ records as job result.

## Integration
- **Depends on**:
  - `@discordjs/rest` (REST client)
  - `discord.js` (Collection)
  - `node:fs`, `node:path`, `node:url` (filesystem and URL utilities)
  - `../../config/config.js` (application configuration)
  - `../remoteInteraction.js` (Interaction reconstruction)
  - `../serializeInteraction.js` (Interaction serialization)
  - `../jobHandler.js` (Handler registration abstraction)
  - `../queue.js` (Queue creation abstraction)
  - `../../utils/metrics.js` (Prometheus metrics)
  - `../../utils/logger.js` (Logging)
- **Consumed by**:
  - Command modules in `src/plugins/*/commands/` (via import of `enqueueCommand`).
- **Interfaces with**:
  - BullMQ queue system through the `createQueue` and `registerHandler` abstractions.
  - Plugin system via `pluginId` lookup in `src/plugins/<pluginId>/commands/` and `data/plugins/<pluginId>/commands/`.