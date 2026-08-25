# src/gateway/

## Responsibility
Implements distributed leader election for the bot gateway using Redis to ensure only one pod processes gateway events at a time. Supports global leader election (single lock for entire bot), per-shard leader election (separate lock per shard), and hybrid modes. Provides utilities for lock acquisition, release, and heartbeat maintenance.

## Design
- Uses Redis `SET` command with `NX`/`PX` flags for atomic lock acquisition.
- Lock release performed via a Lua script (`RELEASE_SCRIPT`) to ensure only the lock owner can delete it.
- Heartbeat mechanism refreshes lock TTL at one-third intervals using `setInterval`.
- Exposes `tryAcquireLock`, `releaseLock`, `startHeartbeat`, `stopHeartbeat` helper functions.
- Higher‑level functions: `acquireGlobalLock` and `acquireShardLock` construct appropriate lock keys.
- Constants `LeaderElectionMode` define available strategies (GLOBAL, PER_SHARD, HYBRID).
- No internal state beyond the heartbeat timer; lock identity is passed via `podId`.

## Flow
1. **Startup** – The gateway logic (e.g., in `src/index.js` or worker) selects a leader election mode and obtains a unique `podId` (e.g., `${process.pid}-${instanceId}`).
2. **Lock Acquisition** – Depending on mode:
   - GLOBAL: call `acquireGlobalLock(redis, podId)` → tries lock key `apollo:gateway:leader:global`.
   - PER_SHARD: for each shard, call `acquireShardLock(redis, shardId, podId)` → lock key `apollo:gateway:leader:shard-${shardId}`.
   - HYBRID: combination (implementation specific) – typically global lock for coordination plus per‑shard locks for shard‑local work.
3. **Heartbeat** – On successful acquisition, `startHeartbeat` begins refreshing the lock every `ttlMs/3` milliseconds.
4. **Lock Loss / Release** – If lock acquisition fails or heartbeat detects loss, the pod steps back to follower state. On shutdown or when relinquishing leadership, `releaseLock` is called (using the Lua script) and `stopHeartbeat` clears the interval.
5. **Retry Logic** – The caller typically retries acquisition after a backoff if lock is not obtained.

## Integration
- **Dependencies**: Requires a Redis client (ioredis) instance; passed to each function.
- **Consumed By**: Gateway initialization in `src/index.js` (or worker mode) when `RUN_MODE=gateway` is set. Also used by any custom logic needing coordinated leadership (e.g., scheduled tasks, EventBus publishing).
- **Interfaces**: No events or hooks; integration is via direct function calls. The module is framework‑agnostic and can be used in any Node.js process with Redis access.
- **Configuration**: Lock TTL defaults to 10 seconds but can be overridden per call. Pod ID must be unique across all instances (typically includes process ID and a random suffix).