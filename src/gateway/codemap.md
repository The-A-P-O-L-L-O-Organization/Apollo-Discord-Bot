# src/gateway/codemap.md

## Responsibility
Elects a single gateway leader with Redis fencing so only the leader connects to Discord and runs schedulers. Followers stay idle until failover.

## Files

| File | Purpose |
|------|---------|
| `leader.ts` | Leader lock acquire, release, and heartbeat with global, per-shard, and hybrid modes. |
| `fencing.ts` | FencingTokenManager minting monotonic tokens via atomic Lua scripts. |

No subdirectories; both modules are top-level files in `src/gateway/`.

## Design
- `leader.ts`: `tryAcquireLock` (`SET key podId PX ttl NX`), `releaseLock` (Lua compare-and-delete so only the owner deletes), `startHeartbeat` (refresh every `ttlMs / 3`), `stopHeartbeat`, `acquireGlobalLock`, `acquireShardLock`. Constants `LeaderElectionMode` (`GLOBAL`, `PER_SHARD`, `HYBRID`), `GLOBAL_LEADER_LOCK_KEY` (`apollo:gateway:leader:global`), `FENCING_COUNTER_KEY`, `shardLockKey(shardId)`. Default TTL 10 seconds.
- `fencing.ts`: `FencingTokenManager` with atomic Lua scripts (`ACQUIRE_LOCK_SCRIPT`, `RELEASE_LOCK_SCRIPT`, heartbeat script) that mint monotonically increasing fencing tokens from a Redis counter so stale leaders cannot overwrite newer scheduler or queue work.
- Patterns: Leader Election (single gateway owner via `SET NX PX` lock plus heartbeat), Fencing Token (monotonic tokens rejecting stale leaders), Distributed Lock (Lua compare-and-delete release and heartbeat refresh).

## Flow
1. `RUN_MODE=gateway` startup builds a unique `podId` and reads leader-election config.
2. Pod calls `tryAcquireLock` (global key, or per-shard keys in `PER_SHARD` mode).
3. Winner starts the heartbeat, connects the discord.js client, and starts schedulers (reminders, polls, giveaways, SLA checks, analytics aggregation, NSFW polling, translation polling, transcript and utility cleanup).
4. Losers retry with backoff and remain followers without Discord connections or schedulers.
5. On shutdown or lock loss the leader calls `releaseLock` and `stopHeartbeat`; a follower then wins the next acquisition after a brief failover window.

## Integration
- Depends on `ioredis` standalone or cluster clients from `src/utils/redis.ts` and `src/utils/redisCluster.ts`, `src/utils/logger.ts`, `src/types/gateway.ts`.
- Consumed by `src/index.ts`, `src/shard.ts`, and `RUN_MODE=gateway` startup. Scheduler modules must wrap recurring work in `withLock` from `src/utils/lock.ts` so only one pod executes even across failover retries.
