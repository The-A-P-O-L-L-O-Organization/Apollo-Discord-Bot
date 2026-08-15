# src/queue/jobs/

## Responsibility
Defines job types and handlers for the BullMQ-based job queue system, specifically processing Discord slash commands asynchronously via worker processes.

## Design
Implements the Producer-Consumer pattern with job encapsulation. Uses a named job constant (PROCESS_COMMAND) for type safety. Abstracts queue creation via createQueue factory and handler registration via registerHandler. Encapsulates command data serialization and deserialization through serializeInteraction and RemoteInteraction.

## Flow
1. Command interaction triggers enqueueCommand (producer) in command files.
2. enqueueCommand serializes interaction data, enriches with command/plugin metadata, and adds a PROCESS_COMMAND job to the queue.
3. Worker process receives job via registered handler (consumer).
4. Handler reconstructs REST client, recreates command Collection from metadata, and builds RemoteInteraction.
5. Handler locates and imports the command module using pluginId and fallback search paths.
6. Handler validates command module execute function, then invokes it with the interaction.
7. On success, returns completion status; on error, sends error embed and returns error status.

## Integration
Depends on: @discordjs/rest, discord.js, fs, path, url, ../config/config.js, ../remoteInteraction.js, ../serializeInteraction.js, ../jobHandler.js, ../queue.js.
Consumed by: Command modules (via enqueueCommand import) in src/plugins/*/commands/.
Interfaces with: BullMQ queue system through createQueue and registerHandler abstractions.