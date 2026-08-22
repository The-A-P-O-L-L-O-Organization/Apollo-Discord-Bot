# ShardingManager Architecture Design

## Overview

This document describes the architecture for adding Discord.js `ShardingManager` support to the Apollo Discord Bot. The design maintains backward compatibility with single-process mode while enabling horizontal scaling via sharding.

---

## 1. File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/shard.js` | ShardingManager entry point (spawns shard workers) |
| `src/shard/ShardManager.js` | Wrapper around discord.js ShardingManager with custom logic |
| `src/shard/ShardWorker.js` | Shard worker process logic (extends current `src/index.js` behavior) |
| `src/shard/ShardEventBus.js` | Cross-shard EventBus coordination |
| `src/shard/ShardLeaderElection.js` | Per-shard or global leader election |
| `src/config/shardConfig.js` | Sharding-specific configuration schema |

### Modified Files

| File | Changes |
|------|---------|
| `src/index.js` | Refactored to support `SHARD_ID` env var; becomes shard worker entry point |
| `src/config/config.js` | Add sharding configuration section |
| `src/core/EventBus.js` | Add shard-aware cross-pod communication |
| `src/gateway/leader.js` | Extend for per-shard/global leader election modes |
| `src/queue/queue.js` | Ensure queue names include shard ID for isolation |
| `src/worker.js` | Accept `SHARD_ID` for shard-scoped job processing |
| `src/utils/redis.js` | Add shard-scoped connection naming |
| `src/cli/socket-server.js` | Support multiple socket paths per shard |
| `src/utils/healthServer.js` | Support per-shard health endpoints |
| `package.json` | Add `shard` script and `SHARD_COUNT` env handling |

---

## 2. Shard Worker Communication Pattern

### Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                    src/shard.js (Manager)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Shard 0    │  │  Shard 1    │  │  Shard N    │  ...     │
│  │  (worker)   │  │  (worker)   │  │  (worker)   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Redis   │  │PostgreSQL│  │  Queue   │  │  Discord │     │
│  │ (Pub/Sub)│  │  (DB)    │  │ (BullMQ) │  │   API    │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Shard Worker (`src/index.js` with `SHARD_ID`)

Each shard worker runs the **exact same code** as current `src/index.js` but:
- Receives `SHARD_ID` and `SHARD_COUNT` via environment variables
- Uses shard-scoped Redis connection names (e.g., `eventbus-pub-shard-0`)
- Registers with shard-specific queue prefix (`apollo:shard-0`)
- Opens socket at `/tmp/apollo-shard-0.sock`
- Runs health server on port `3000 + SHARD_ID`

### Manager (`src/shard.js`)

```javascript
// Pseudocode structure
import { ShardingManager } from 'discord.js';
import { config } from './config/config.js';

const manager = new ShardingManager('./src/index.js', {
    token: config.DISCORD_TOKEN,
    totalShards: config.shard.count,        // 'auto' or integer
    shardArgs: ['--shard'],                 // passed to worker
    mode: 'process',                        // or 'worker' for threading
    respawn: true,
    execArgv: process.execArgv,
});

// Custom event handling
manager.on('shardCreate', shard => {
    console.log(`[ShardManager] Launched shard ${shard.id}`);
});

manager.on('shardDisconnect', (event, shard) => {
    console.error(`[ShardManager] Shard ${shard.id} disconnected: ${event.code}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    await manager.broadcastEval('process.exit(0)');
    process.exit(0);
});

await manager.spawn();
```

---

## 3. Cross-Shard EventBus Design

### Current EventBus Limitation

Current `EventBus.enableCrossPod()` uses Redis pub/sub with channel pattern `apollo:event:{eventName}`. All pods receive all events.

### Shard-Aware Design

**Channel Naming:**
```
apollo:event:{shardId}:{eventName}     // Shard-scoped events
apollo:event:global:{eventName}        // Cross-shard broadcast events
apollo:state:{shardId}:{key}           // Shard-scoped state
apollo:state:global:{key}              // Global state
```

**EventBus API Extensions:**

```javascript
class EventBus {
    // Existing methods unchanged
    
    // New: Emit to specific shard
    async emitToShard(shardId, event, payload) { ... }
    
    // New: Emit to all shards (global broadcast)
    async emitGlobal(event, payload) { ... }
    
    // New: Emit to all OTHER shards (exclude self)
    async emitToOtherShards(event, payload) { ... }
    
    // New: Get shard ID this EventBus belongs to
    getShardId() { return this._shardId; }
    
    // New: Get total shard count
    getShardCount() { return this._shardCount; }
}
```

**Message Format (Extended):**
```json
{
    "_sourcePodId": "pod-1",
    "_sourceShardId": 0,
    "_targetShardId": 1,        // null = broadcast to all
    "_event": "events:messageCreate",
    "_isGlobal": false,
    "payload": { ... }
}
```

**Subscription Logic:**
- Each shard subscribes to `apollo:event:{shardId}:*` + `apollo:event:global:*`
- Global events delivered to all shards
- Shard-scoped events delivered only to target shard

---

## 4. Leader Election Strategy

### Current Implementation

Single global leader lock: `apollo:gateway:leader` with TTL heartbeat.

### Sharding Modes

| Mode | Lock Key | Use Case |
|------|----------|----------|
| **Global** | `apollo:gateway:leader:global` | Single leader across all shards (e.g., for global tasks like command sync) |
| **Per-Shard** | `apollo:gateway:leader:shard-{N}` | Each shard elects own leader (e.g., for shard-local schedulers) |
| **Hybrid** | Both | Global for coordination, per-shard for local work |

### Configuration

```javascript
// config.shard.leaderElection
{
    mode: 'global' | 'per-shard' | 'hybrid',  // default: 'hybrid'
    globalTasks: ['commandSync', 'globalScheduler'],  // tasks requiring global leader
    perShardTasks: ['reminderScheduler', 'pollScheduler', 'spamCleanup']  // shard-local
}
```

### Implementation

**Extended `src/gateway/leader.js`:**
```javascript
export const LeaderElectionMode = {
    GLOBAL: 'global',
    PER_SHARD: 'per-shard',
    HYBRID: 'hybrid'
};

export async function tryAcquireLock(redis, lockKey, podId, ttlMs = 10000) { ... }

export async function acquireGlobalLock(redis, podId, ttlMs) {
    return tryAcquireLock(redis, 'apollo:gateway:leader:global', podId, ttlMs);
}

export async function acquireShardLock(redis, shardId, podId, ttlMs) {
    return tryAcquireLock(redis, `apollo:gateway:leader:shard-${shardId}`, podId, ttlMs);
}

// In shard worker (src/index.js):
const shardId = parseInt(process.env.SHARD_ID || '0', 10);
const mode = config.shard.leaderElection.mode;

if (mode === 'global' || mode === 'hybrid') {
    // Attempt global leader
    const isGlobalLeader = await tryAcquireLock(redis, 'apollo:gateway:leader:global', podId);
    if (isGlobalLeader) { runGlobalTasks(); }
}

if (mode === 'per-shard' || mode === 'hybrid') {
    // Attempt per-shard leader
    const isShardLeader = await tryAcquireLock(redis, `apollo:gateway:leader:shard-${shardId}`, podId);
    if (isShardLeader) { runShardLocalTasks(); }
}
```

---

## 5. Configuration Schema

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ENABLE_SHARDING` | boolean | `false` | Feature flag to enable sharding |
| `SHARD_COUNT` | integer or `'auto'` | `'auto'` | Number of shards; `'auto'` = Discord recommended |
| `SHARD_ID` | integer | (set by manager) | Current shard ID (0-indexed) |
| `SHARD_LEADER_MODE` | `'global' \| 'per-shard' \| 'hybrid'` | `'hybrid'` | Leader election strategy |

### Config File Additions (`src/config/config.js`)

```javascript
// Add to config object
shard: {
    enabled: process.env.ENABLE_SHARDING === 'true',
    count: process.env.SHARD_COUNT === 'auto' 
        ? 'auto' 
        : parseIntSafe(process.env.SHARD_COUNT, 1),
    leaderElection: {
        mode: process.env.SHARD_LEADER_MODE || 'hybrid',
        globalTasks: ['commandSync', 'globalScheduler'],
        perShardTasks: ['reminderScheduler', 'pollScheduler', 'spamCleanup', 'automodCleanup']
    },
    // Per-shard resource offsets
    healthPortOffset: 3000,        // shard N uses port 3000 + N
    socketPathBase: '/tmp/apollo', // shard N uses /tmp/apollo-shard-N.sock
    queuePrefixBase: 'apollo',     // shard N uses apollo:shard-N
    redisKeyPrefixBase: 'apollo'   // shard N uses apollo:shard-N:*
}
```

### Discord.js ShardingManager Options

```javascript
// In src/shard/ShardManager.js
const shardOptions = {
    token: config.DISCORD_TOKEN,
    totalShards: config.shard.count === 'auto' ? 'auto' : config.shard.count,
    shardArgs: ['--shard'],
    mode: 'process',
    respawn: true,
    execArgv: process.execArgv.filter(arg => !arg.startsWith('--inspect')), // avoid port conflicts
};
```

---

## 6. Migration Path

### Phase 1: Feature Flag (Non-Breaking)
- Add `ENABLE_SHARDING=false` to `.env.example`
- All existing code paths unchanged
- New sharding files created but not used

### Phase 2: Shard Worker Refactor
- Extract shard-aware logic from `src/index.js` into shared modules
- `src/index.js` reads `SHARD_ID` from env
- All Redis keys, queue names, socket paths become shard-scoped
- Test single shard (`SHARD_COUNT=1`, `SHARD_ID=0`) matches current behavior

### Phase 3: Manager Entry Point
- Create `src/shard.js` with `ShardingManager`
- Add `pnpm shard` script
- Verify multi-shard spawn works locally

### Phase 4: Cross-Shard Features
- Implement `ShardEventBus` for cross-shard communication
- Implement hybrid leader election
- Add shard-aware command sync (global vs guild-specific)

### Phase 5: Production Hardening
- Health checks per shard
- Graceful shard restart on crash
- Metrics aggregation across shards
- Documentation and runbooks

### Backward Compatibility Guarantees

| Component | Single-Process | Sharded |
|-----------|----------------|---------|
| `src/index.js` | Entry point | Shard worker (via `SHARD_ID`) |
| `RUN_MODE=gateway` | Leader election | Per-shard + optional global |
| `RUN_MODE=worker` | Queue consumer | Shard-scoped queue consumer |
| EventBus | Cross-pod only | Cross-pod + cross-shard |
| Socket server | `/tmp/apollo.sock` | `/tmp/apollo-shard-{N}.sock` |
| Health server | Port 3000 | Port 3000+N |
| Queue prefix | `apollo` | `apollo:shard-{N}` |

---

## 7. Risk Mitigation

### Identified Single-Process Assumptions

| Assumption | Location | Mitigation |
|------------|----------|------------|
| Single `client` instance | `src/index.js:38` | Each shard gets own `Client`; no shared state |
| Global `client.commands` Collection | `src/index.js:43` | Per-shard command cache; sync via REST |
| Singleton `EventBus` | `src/index.js:52` | Per-shard EventBus; cross-shard via Redis |
| Singleton `PluginManager` | `src/index.js:53` | Per-shard PluginManager; plugins loaded per shard |
| Global queue prefix | `src/queue/queue.js:44` | Shard-scoped prefix `apollo:shard-{N}` |
| Single socket path | `src/cli/socket-server.js:5` | Shard-scoped socket path |
| Single health port | `src/utils/healthServer.js` | Port offset per shard |
| Global leader lock | `src/gateway/leader.js:2` | Configurable per-shard/global/hybrid |
| In-memory caches (commandModuleCache) | `src/queue/jobs/processCommand.js:20` | Per-worker cache; no cross-shard sharing needed |
| `client.stats` object | `src/index.js:46` | Per-shard stats; aggregate via metrics endpoint |

### Critical Invariants to Preserve

1. **Command Execution**: Each interaction handled by exactly one shard (Discord handles routing via `guild_id % shard_count`)
2. **Queue Deduplication**: `jobId: interaction.id` remains globally unique (Discord interaction IDs are globally unique)
3. **Plugin Isolation**: Plugins loaded per shard; no shared mutable state
4. **Database**: Shared PostgreSQL/SQLite; Knex pool handles concurrent connections
5. **Redis**: Shared instance; key namespacing prevents collisions

### Failure Scenarios & Handling

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Shard crash | `shardDisconnect` event | `respawn: true` auto-restarts |
| Shard lag | Heartbeat missing | Manager kills/restarts shard |
| Redis partition | Pub/sub fails | EventBus degrades to local-only |
| Leader loss | Lock expires | New election within TTL/3 |
| Command sync race | Multiple shards sync | Global leader only syncs commands |

### Testing Strategy

1. **Unit**: Mock `ShardingManager`, test config parsing
2. **Integration**: Spin up 2 shards locally with Redis + SQLite
3. **Load**: Simulate 1000 guilds across 4 shards
4. **Chaos**: Kill shards mid-operation, verify recovery
5. **Regression**: Full test suite passes in both modes

---

## 8. Implementation Priority

### P0 (Required for MVP)
- [ ] `src/shard.js` entry point with `ShardingManager`
- [ ] `src/index.js` refactor for `SHARD_ID` support
- [ ] Shard-scoped Redis keys, queue names, socket paths
- [ ] Config schema with `ENABLE_SHARDING`, `SHARD_COUNT`
- [ ] Basic per-shard leader election

### P1 (Cross-Shard Communication)
- [ ] `ShardEventBus` with global/shard-scoped channels
- [ ] Hybrid leader election (global + per-shard)
- [ ] Cross-shard command sync coordination

### P2 (Operational Excellence)
- [ ] Per-shard health endpoints
- [ ] Aggregated metrics across shards
- [ ] Graceful rolling restart
- [ ] Documentation and runbooks

---

## 9. Appendix: Discord.js ShardingManager Reference

Key discord.js v14 ShardingManager options used:

```typescript
interface ShardingManagerOptions {
    token: string;
    totalShards: number | 'auto';
    shardArgs?: string[];           // Args passed to worker
    mode?: 'process' | 'worker';    // Process vs Worker threads
    respawn?: boolean;              // Auto-restart crashed shards
    execArgv?: string[];            // Node exec args for workers
}
```

Key events:
- `shardCreate` - Shard spawned
- `shardReady` - Shard connected to Discord
- `shardDisconnect` - Shard disconnected
- `shardReconnecting` - Shard reconnecting
- `shardError` - Shard error

Key methods:
- `spawn(shardIds?, options?)` - Start shards
- `broadcastEval(script, context?)` - Run code on all shards
- `fetchClientValues(property)` - Get values from all shards
- `shardIds` - Array of managed shard IDs

---

## 10. Decision Log

| Decision | Rationale |
|----------|-----------|
| `src/index.js` becomes shard worker | Minimal code duplication; single codebase |
| Feature flag `ENABLE_SHARDING` | Safe rollout; zero risk to existing deployments |
| Hybrid leader election default | Balances global coordination with shard autonomy |
| Shard-scoped queue prefixes | Prevents job collision; enables per-shard scaling |
| Redis key namespacing over separate DBs | Operational simplicity; single Redis instance |
| `SHARD_COUNT=auto` default | Discord calculates optimal shard count |

---

*End of Architecture Document*