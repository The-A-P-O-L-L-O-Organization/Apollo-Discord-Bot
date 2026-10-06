# src/queue/jobs/codemap.md

## Responsibility
Defines the two worker job handlers: Discord slash-command execution and Rust-backed NSFW image analysis.

## Files

| File | Purpose |
|------|---------|
| `processCommand.ts` | Slash-command enqueue with HMAC signing plus worker-side verify and execute. |
| `nsfwAnalyze.ts` | NSFW image analysis job calling Rust gRPC when enabled, else skipped. |

No subdirectories; both handlers are top-level files in `src/queue/jobs/`.

## Design
- `processCommand.ts`: producer `enqueueCommand` (serializes via `serializeInteraction.ts`, signs with `QUEUE_HMAC_SECRET` HMAC plus timestamp and nonce, enqueues `process-command` with interaction id deduplication) and consumer handler (verifies HMAC via `nonceStore.ts`, rebuilds `RemoteInteraction`, resolves the command module with `commandModuleCache`, executes `execute`). Uses `REST` from `@discordjs/rest`, `Collection` from `discord.js`, `registerHandler` from `jobHandler.ts`, `createQueue` from `queue.ts`, metrics (`recordCommand`, `recordCommandDuration`, `recordError`), pino `logger`, and `i18n`.
- `nsfwAnalyze.ts`: handler for `nsfw:analyze` that calls `analyzeImageGrpc` in `nsfwClient.ts` when `NSFW_USE_RUST=true`, otherwise returns `skipped`. Returns `completed` with `isNsfw`, `predictions`, `inferenceMs`, `maxConfidence`, or `error`.
- Patterns: Command (command modules with `execute` invoked by the worker), Producer-Consumer (gateway `enqueueCommand` plus worker handler), Registry (`registerHandler` job-name dispatch).

## Flow
1. Command invocation arrives at the gateway; the command module calls `enqueueCommand(interaction)` with its `pluginId`.
2. Payload is serialized, HMAC-signed, and added to the BullMQ queue.
3. Worker dequeues, verifies signature and nonce, reconstructs REST client and `RemoteInteraction`, imports the command module (plugin path first, then global scan), validates `execute` exists, and runs it.
4. NSFW path: attachment URL is enqueued as `nsfw:analyze`; the worker runs gRPC inference and returns the verdict for automod.
5. Handler returns `completed`, `skipped`, or `error`; BullMQ records the result and error embeds are sent where possible.

## Integration
- Depends on `../queue.ts`, `../jobHandler.ts`, `../serializeInteraction.ts`, `../remoteInteraction.ts`, `../nonceStore.ts`, `../nsfwClient.ts`, `src/config/config.ts`, `src/utils/metrics.ts`, `src/utils/logger.ts`.
- Consumed by `src/plugins/*/commands/` (enqueue) and `src/worker.ts` (register handlers on startup). Reconstructed interactions are revalidated because queue payloads cross a trust boundary.
