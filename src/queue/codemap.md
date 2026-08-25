# Responsibility
The queue module manages background job processing using BullMQ, providing job creation, serialization of Discord interactions, remote interaction mocking for workers, metrics collection, and job routing. It enqueues command executions for workers, handles shard-aware queue prefixes, and offers a handler registry for job types.

# Design
Patterns: Factory (createQueue), Registry (jobHandler), Adapter (RemoteInteraction), Decorator (serializeInteraction), Gateway (gatewayRouter). Abstractions: Queue interface, JobNames enum, MetricsNames, RemoteInteraction class mimicking Discord.js Interaction, RemoteOptions, RemoteGuild, RemoteChannel, and related remote classes. The module uses a Map to cache queues and command modules for performance. Job deduplication is configured via BullMQ options.

# Flow
Data enters via gatewayRouter.queueOrRun which checks config; if queued, creates queue (or retrieves cached) and adds job with serialized interaction data (including pluginId). Worker pulls job, jobHandler invokes registered handler (processCommand), which reconstructs RemoteInteraction from serialized data, imports command module (with caching), executes. Metrics are polled via getQueueMetrics. State transitions: job added -> waiting -> active -> completed/failed -> removed. The enqueueCommand function in jobs/processCommand.js prepares interaction data and enqueues with deduplication based on interaction ID.

# Integration
Depends on bullmq, ioredis, discord.js, @discordjs/rest, config module, utils/logger, utils/metrics, utils/redis. Consumed by command files (via enqueueCommand), worker processes (jobHandler), metrics consumers, gatewayRouter used elsewhere. Interacts with Redis for queue storage and metrics. Provides job handling for process-command, heavy-operation, scheduled-task (defined in queue.js JobNames). The remoteInteraction.js supplies a lightweight Interaction replica for workers lacking full Discord.js context.