# Responsibility
The queue module manages background job processing using BullMQ, providing job creation, serialization of Discord interactions, remote interaction mocking for workers, metrics collection, and job routing.

# Design
Patterns: Factory (createQueue), Registry (jobHandler), Adapter (RemoteInteraction), Decorator (serializeInteraction), Gateway (gatewayRouter). Abstractions: Queue interface, JobNames enum, MetricsNames, RemoteInteraction class mimicking Discord.js Interaction, RemoteOptions, RemoteGuild, RemoteChannel, and related remote classes.

# Flow
Data enters via gatewayRouter.queueOrRun which checks config; if queued, creates queue and adds job with serialized interaction data; worker pulls job, jobHandler invokes registered handler (processCommand), which reconstructs RemoteInteraction from serialized data, imports command module, executes. Metrics are polled via getQueueMetrics. State transitions: job added -> waiting -> active -> completed/failed -> removed.

# Integration
Depends on bullmq, ioredis, discord.js, @discordjs/rest, config module. Consumed by command files (via enqueueCommand), worker processes, metrics consumers, gatewayRouter used elsewhere.