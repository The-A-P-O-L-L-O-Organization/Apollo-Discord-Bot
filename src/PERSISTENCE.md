# Apollo Discord Bot - Persistence System Documentation

## Executive Summary

Apollo's persistence system is designed to ensure critical data survives bot restarts while maintaining performance through intelligent batching and caching strategies.

### What Data Persists
- **Guild configurations** (settings, rules, channels)
- **User warnings and moderation cases** (database layer)
- **Blacklist entries** (database layer)
- **Tickets** (database layer)
- **Temporary bans** (saved immediately on creation)
- **Temporary roles** (saved immediately on creation)
- **Reports** (saved immediately)
- **Moderation actions** (database layer)
- **Analytics data** (batched every 60 seconds + critical flushes)
- **Reminders** (loaded on startup, saved immediately on changes)
- **Polls** (loaded on startup, saved immediately on changes)

### What Is In-Memory Only
- **EventBus state** - lost on restart, recreated dynamically
- **Plugin reactive state** - lost on restart
- **Cache state** - lost on restart (recreated from database)
- **Running timers/intervals** - cleared on shutdown
- **Rate limit tracking** - ephemeral tracking per session

### Bot Restart Behavior

**Graceful Shutdown (SIGTERM/SIGINT):**
- All analytics flushed to database
- Reminders saved to database
- Polls saved to database
- Database connections closed properly
- Process exits with code 0
- **Result:** ✅ No data loss

**Hard Crash (SIGKILL, power loss, uncaught exception):**
- In-flight operations may be lost
- SQLite WAL mode protects database integrity
- Last successful flush data is safe
- Critical event data is safe
- Reminders/polls reloaded on restart from last saved state
- **Result:** ⚠️ Minimal data loss (at most 60 seconds of analytics)

---

## Data Persistence Model

### Persistence Layers Overview

| Data Type | Persistence Layer | Flush Trigger | Data Loss Risk | Recovery |
|-----------|-------------------|---------------|----------------|----------|
| Guild Config | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| User Warnings | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| Blacklist | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| Tickets | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| Temp-bans | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| Temp-roles | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| Reports | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| Mod Actions | SQLite/PostgreSQL | Immediate | **Low** | Database query |
| Commands Analytics | SQLite/PostgreSQL | Every 60s | **Medium** | Up to 60s loss |
| Messages Analytics | SQLite/PostgreSQL | Every 60s | **Medium** | Up to 60s loss |
| Violations Analytics | SQLite/PostgreSQL | Immediate (critical) | **Low** | Critical only |
| Mod Actions Analytics | SQLite/PostgreSQL | Immediate (critical) | **Low** | Critical only |
| Reminders | SQLite/PostgreSQL | On change + reload | **Low** | Reloaded on startup |
| Polls | SQLite/PostgreSQL | On change + reload | **Low** | Reloaded on startup |
| EventBus State | Memory only | N/A | **High** | Lost |
| Plugin State | Memory only | N/A | **High** | Lost |
| Cache | Memory only | N/A | **High** | Recreated from DB |
| Rate Limits | Memory only | N/A | **High** | Lost |

---

## Detailed System Description

### Database Layer (SQLite/PostgreSQL)

The database layer uses one of two adapters based on configuration:

**SQLite (Default):**
- Located at: `data/apollo.db`
- Uses Write-Ahead Logging (WAL) mode for crash protection
- Pragmas configured for reliability:
  - `journal_mode = WAL` (write-ahead logging)
  - `foreign_keys = ON` (referential integrity)
  - `synchronous = NORMAL` (balance between safety and performance)
  - `busy_timeout = 5000` (5-second timeout for locked database)

**PostgreSQL:**
- Connection via environment variable: `DATABASE_URL`
- Connection pooling configured:
  - Min pool: 2 connections (configurable: `DB_POOL_MIN`)
  - Max pool: 10 connections (configurable: `DB_POOL_MAX`)

**Data Access Pattern:**
```javascript
// Core database functions (src/utils/db.js)
await getGuildData(store, guildId)        // Read guild-level data
await setGuildData(store, guildId, data)  // Write guild-level data
await updateGuildData(store, guildId, updater) // Update with function
await getData(store)                       // Read global data
await setData(store, data)                // Write global data
```

**Critical Data Persisted Immediately:**
- New guild configurations
- User warnings added
- Blacklist entries added
- Tickets created/updated
- Tempbans created
- Temproles created
- Reports submitted
- Moderation actions

### Analytics Layer

Analytics uses a hybrid batching + critical flush strategy:

**In-Memory Batching** (6 separate caches):
```javascript
analyticsCache = {
  commands: Map(guildId -> Map(commandName -> Map(userId -> count))),
  messages: Map(guildId -> Map(channelId -> Map(userId -> count))),
  violations: Map(guildId -> Map(type -> count)),
  modActions: Map(guildId -> Map(moderatorId -> Map(action -> count)))
}
```

**Flush Cycle (60 seconds):**
- Called by: `flushAnalyticsCache()` on interval
- Writes aggregated data to database stores:
  - `analytics-commands` (daily aggregation per command/user)
  - `analytics-messages` (hourly aggregation per channel/user)
  - `analytics-violations` (daily aggregation per violation type)
  - `analytics-modactions` (daily aggregation per moderator/action)
  - `analytics-members` (daily aggregation of join/leave counts)

**Critical Flushes (Immediate):**
- Called by: `flushAnalyticsCritical()` when needed
- Triggers:
  - Automod violations detected
  - Moderator actions taken
  - User reports submitted
- Ensures these important events are not lost

**Data Retention:**
- Default retention: 90 days
- Cleanup runs daily at startup and every 24 hours
- Old records deleted automatically

**Usage Functions:**
```javascript
// Tracking
trackCommand(guildId, commandName, userId)
trackMessage(guildId, channelId, userId)
trackViolation(guildId, violationType)
trackModAction(guildId, moderatorId, action)
trackMemberChange(guildId, isJoin, totalMembers)

// Stats retrieval
await getCommandStats(guildId, days = 7)
await getMessageStats(guildId, days = 7)
await getViolationStats(guildId, days = 30)
await getModActionStats(guildId, days = 30)
await getMemberGrowthStats(guildId, days = 30)

// Management
stopAnalyticsCollector()  // Graceful shutdown
flushAnalyticsCritical() // Force flush important data
```

### Scheduler Data (Reloaded on Startup)

**Reminders System:**
- Stored in: `reminders` database store
- Loaded on startup: `loadRemindersFromDatabase()`
- Kept in-memory: `inMemoryReminders` array
- Check interval: 30 seconds (configurable: `config.reminders.checkInterval`)
- **Persistence:** Saved to database immediately when created/modified
- **On Restart:** All reminders reloaded from database at startup
- **On Crash:** Reminders executed based on last saved state (may miss reminders from crash to restart)

**Polls System:**
- Stored in: `polls` database store
- Loaded on startup: `loadPollsFromDatabase()`
- Kept in-memory: `inMemoryPolls` array
- Check interval: Configurable
- **Persistence:** Saved to database immediately when created/modified
- **On Restart:** All polls reloaded from database at startup
- **On Crash:** Polls executed based on last saved state (may miss polls from crash to restart)

**Tempban System:**
- Stored in: `tempbans` database store
- Check interval: 30 seconds
- **Persistence:** Saved to database immediately when created
- **On Restart:** All tempbans reloaded from database at startup
- **On Crash:** Unbans triggered based on last saved state

**Temproles System:**
- Stored in: `temproles` database store
- Check interval: 30 seconds
- **Persistence:** Saved to database immediately when created
- **On Restart:** All temproles reloaded from database at startup
- **On Crash:** Roles removed based on last saved state

### In-Memory Only (Lost on Restart)

These systems have no persistence and are recreated on each startup:

**EventBus** (`src/core/EventBus.js`):
- Inter-plugin communication bus
- All event subscriptions lost on restart
- Plugins re-subscribe on load
- State recreated dynamically

**Plugin State** (`src/core/Plugin.js`):
- Plugin reactive state and variables
- Lost on restart
- Should be stored to database if persistence needed

**Cache State** (`src/utils/` various caches):
- Temporary caching layers
- Lost on restart
- Recreated from database as needed

**Rate Limit Tracking**:
- In-memory tracking of user rate limits
- Lost on restart
- Users get fresh rate limit on restart

---

## Shutdown Behavior

### Graceful Shutdown (SIGTERM/SIGINT)

**Sequence of Operations** (see `src/index.js`):

```
1. SIGTERM/SIGINT received
   ↓
2. Stop analytics collector
   └─ Flush all batched analytics to database
   ↓
3. Stop reminder scheduler
   └─ Save any pending reminders
   ↓
4. Stop poll scheduler
   └─ Save any pending polls
   ↓
5. Stop spam tracker cleanup
   ↓
6. Stop socket server
   ↓
7. Disable all plugins
   ├─ Plugins cleanup their state
   └─ Plugins save data to database
   ↓
8. Close Discord client
   ↓
9. Close database connections
   ├─ SQLite: Finalize WAL
   └─ PostgreSQL: Return connections to pool
   ↓
10. Close Redis lock connection
    ↓
11. Close queue connections
    ↓
12. Exit with code 0 ✅ SUCCESS
```

**Implementation:**
```javascript
process.on('SIGTERM', async () => {
    await cleanup();  // Graceful shutdown sequence
});

process.on('SIGINT', async () => {
    await cleanup();  // Graceful shutdown sequence
});
```

### Hard Crash Behavior

**On Unhandled Exception:**
```javascript
process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught exception:', error);
    process.exit(1);  // Immediate exit (no cleanup)
});
```

**On SIGKILL or Power Loss:**
- No cleanup sequence executed
- Database protected by SQLite WAL mode
- Last committed transaction is safe

**Data Loss Assessment:**
- **Committed database writes:** ✅ Safe (WAL-protected)
- **Last 60-second analytics batch:** ⚠️ Lost (in-memory only)
- **In-progress operations:** ⚠️ Lost
- **Reminders/polls:** ✅ Reload from last saved state on startup
- **Temporary bans/roles:** ✅ Reload from last saved state on startup

---

## Configuration

### Environment Variables

**Database Configuration:**
```bash
DB_TYPE=sqlite                    # Default: sqlite
DB_TYPE=postgres                  # Alternative: PostgreSQL
DATABASE_URL=postgresql://...     # PostgreSQL connection string (if using postgres)
DB_POOL_MIN=2                     # Min PostgreSQL connections
DB_POOL_MAX=10                    # Max PostgreSQL connections
```

**Scheduler Configuration:**
```bash
# Reminder settings
REMINDER_CHECK_INTERVAL=30000     # Check every 30 seconds

# Tempban settings
TEMPBAN_CHECK_INTERVAL=30000      # Check every 30 seconds

# Temprole settings
TEMPROLE_CHECK_INTERVAL=30000     # Check every 30 seconds

# Poll settings
POLL_CHECK_INTERVAL=60000         # Check every 60 seconds
```

**Queue Configuration (optional):**
```bash
QUEUE_ENABLED=true                # Enable BullMQ queue
REDIS_HOST=localhost              # Redis host for queue
REDIS_PORT=6379                   # Redis port
REDIS_PASSWORD=                   # Redis password (optional)
QUEUE_PREFIX=apollo               # Queue name prefix
```

**Analytics Configuration:**
```bash
# Analytics batch interval (default: 60 seconds)
# Modifiable in src/utils/analyticsCollector.js
ANALYTICS_BATCH_INTERVAL=60000

# Analytics retention (default: 90 days)
# Modifiable in src/utils/analyticsCollector.js
ANALYTICS_RETENTION_DAYS=90
```

**Crash Handling:**
```bash
# Handle unhandled rejections (logged, not persisted)
# Built-in: process.on('unhandledRejection')

# Handle uncaught exceptions (logged, exits with code 1)
# Built-in: process.on('uncaughtException')
```

### Database Connection Settings

**SQLite (src/utils/db.js):**
```javascript
db.pragma('journal_mode = WAL');           // Write-ahead logging
db.pragma('foreign_keys = ON');            // Referential integrity
db.pragma('synchronous = NORMAL');         // Balanced sync mode
db.pragma('busy_timeout = 5000');          // 5-second timeout
```

**PostgreSQL (src/db/adapter.js & src/db/knex.js):**
```javascript
pool: {
    min: 2,   // Minimum connections
    max: 10   // Maximum connections
}
```

---

## Best Practices for Developers

### 1. Always Await Database Operations

```javascript
// ❌ WRONG - Fire and forget
setGuildData('mystore', guildId, data);

// ✅ CORRECT - Wait for completion
await setGuildData('mystore', guildId, data);
```

### 2. Use Critical Flushes for Important Events

```javascript
// For important data that must be persisted immediately
import { flushAnalyticsCritical } from './utils/analyticsCollector.js';

// After recording a violation or moderation action
await flushAnalyticsCritical();
```

### 3. Error Handling for Persistence Failures

```javascript
try {
    await setGuildData('store', guildId, data);
} catch (error) {
    console.error('[ERROR] Failed to persist data:', error);
    // Handle gracefully - retry, notify user, etc.
}
```

### 4. Testing with Both Database Types

```javascript
// Test with SQLite (default)
DB_TYPE=sqlite npm test

// Test with PostgreSQL
DB_TYPE=postgres DATABASE_URL="..." npm test
```

### 5. Plugin Data Persistence

```javascript
// In your plugin, always await database operations
export class MyPlugin extends Plugin {
    async onEnable() {
        await setGuildData('my-plugin-store', guildId, {
            enabled: true,
            config: {}
        });
    }
    
    async onDisable() {
        // Save state before disabling
        await setGuildData('my-plugin-store', guildId, {
            enabled: false
        });
    }
}
```

### 6. Handling Reminders/Polls/Tempbans

```javascript
// These are loaded on startup from database
// Modifications are saved immediately
// No special handling needed - just use the API:

import { createReminder } from './utils/reminderScheduler.js';
await createReminder(userId, guildId, message, reminderTime);
// ✅ Automatically persisted and reloaded on restart
```

### 7. Graceful Shutdown in Scripts

```javascript
// In deployment scripts or CLI tools
import { closeDatabase } from './utils/db.js';

// Before process.exit()
await closeDatabase();  // Ensure database is closed properly
process.exit(0);
```

---

## Troubleshooting

### Problem: Data Appears Lost After Restart

**Symptoms:** Guild config, warnings, or other data missing after bot restarts

**Root Causes:**
1. Data was never persisted (fire-and-forget pattern)
2. Database connection failed during write
3. Bot crashed before graceful shutdown

**Solutions:**
```bash
# 1. Check database file exists and has data
ls -lh data/apollo.db
sqlite3 data/apollo.db "SELECT COUNT(*) FROM guild_store;"

# 2. Enable verbose logging
DEBUG=* npm start

# 3. Check for unhandled errors in logs
grep -i error logs/

# 4. Verify database is not corrupted (SQLite)
sqlite3 data/apollo.db ".tables"
sqlite3 data/apollo.db ".schema"
```

### Problem: Analytics Data Missing

**Symptoms:** Command/message/violation stats are incomplete or missing

**Root Causes:**
1. Bot restarted before 60-second flush interval
2. Critical events not flushed
3. Analytics batch interval set too long

**Solutions:**
```bash
# 1. Force flush on critical events
import { flushAnalyticsCritical } from './utils/analyticsCollector.js';
await flushAnalyticsCritical();

# 2. Reduce batch interval for more frequent flushes
# Modify BATCH_INTERVAL in src/utils/analyticsCollector.js

# 3. Check analytics data in database
sqlite3 data/apollo.db "SELECT * FROM guild_store WHERE store='analytics-commands';"
```

### Problem: Database Corruption / SQLite Error

**Symptoms:** `Error: database disk image malformed` or similar

**Root Causes:**
1. Hard crash during write operation
2. Disk space issues
3. File permissions problem

**Solutions:**
```bash
# 1. Check database integrity
sqlite3 data/apollo.db "PRAGMA integrity_check;"

# 2. Attempt recovery with WAL
sqlite3 data/apollo.db "PRAGMA wal_checkpoint(TRUNCATE);"

# 3. Check disk space
df -h

# 4. Check file permissions
ls -l data/apollo.db data/apollo.db-wal data/apollo.db-shm

# 5. If all else fails, restore from backup
cp backups/apollo.db.backup data/apollo.db
```

### Problem: Slow Persistence / Database Locks

**Symptoms:** Commands are slow, messages like "database is locked"

**Root Causes:**
1. `busy_timeout` too short
2. Concurrent writes overwhelming SQLite
3. Large batch flush operations

**Solutions:**
```bash
# 1. Increase busy_timeout in src/utils/db.js
db.pragma('busy_timeout = 10000');  // Increase to 10 seconds

# 2. Use PostgreSQL for high-throughput scenarios
DB_TYPE=postgres

# 3. Check current connections
sqlite3 data/apollo.db ".mode line" "SELECT * FROM sqlite_stat1;"

# 4. Optimize write batching
# Modify BATCH_INTERVAL to balance frequency vs. throughput
```

### Problem: Reminders/Polls Not Triggering After Restart

**Symptoms:** Reminders set before crash don't execute; polls don't resume

**Root Causes:**
1. Reminders/polls database not saved before crash
2. Scheduler not reloading from database
3. System clock changed

**Solutions:**
```bash
# 1. Check if reminders are in database
sqlite3 data/apollo.db "SELECT * FROM guild_store WHERE store='reminders';"

# 2. Verify scheduler is running
grep "Reminder scheduler started" logs/

# 3. Check system time
date
# Adjust if needed, then restart bot

# 4. Manually trigger reload
# In bot console or admin command:
import { loadRemindersFromDatabase } from './utils/reminderScheduler.js';
await loadRemindersFromDatabase();
```

### Problem: PostgreSQL Connection Errors

**Symptoms:** `connect ECONNREFUSED` or `no such user` errors

**Root Causes:**
1. PostgreSQL server not running
2. Invalid connection string
3. Authentication failure
4. Connection pool exhausted

**Solutions:**
```bash
# 1. Verify PostgreSQL is running
psql -h localhost -U postgres -l

# 2. Check connection string format
# Should be: postgresql://user:password@host:port/database
echo $DATABASE_URL

# 3. Test connection directly
psql "$DATABASE_URL"

# 4. Check connection pool settings
grep DB_POOL logs/

# 5. Restart with verbose output
DEBUG=knex:* npm start
```

---

## Architecture Diagram

```
                    ┌─────────────────────┐
                    │   Discord Events    │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   Commands          Analytics Tracking      Scheduler Events
        │                      │                      │
        ▼                      ▼                      ▼
   ┌─────────┐         ┌──────────────┐      ┌─────────────┐
   │  Queue  │         │Analytics    │      │  Scheduler  │
   │         │         │ In-Memory   │      │  (30s loop) │
   │ (if     │         │ Cache       │      │             │
   │ enabled)│         │ (60s batch) │      └──────┬──────┘
   └────┬────┘         └──────┬───────┘             │
        │                     │                     │
        └─────────────┬───────┴─────────────────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │ Database Layer      │
            │  (db.js)            │
            │  SQLite / PG        │
            └──────────┬──────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
   ┌─────────────┐            ┌─────────────┐
   │   SQLite    │            │ PostgreSQL  │
   │ apollo.db   │            │ Connection  │
   │   (WAL)     │            │ Pool        │
   └─────────────┘            └─────────────┘


    ┌─────────────────────┐
    │  On Shutdown        │
    │  (SIGTERM/SIGINT)   │
    └──────────┬──────────┘
               │
        ┌──────┴──────────────┬───────────┬─────────┐
        │                     │           │         │
        ▼                     ▼           ▼         ▼
    Flush             Stop          Flush         Close DB
    Analytics         Schedulers     Reminders    Connections
        │                     │           │         │
        └─────────────────────┴───────────┴─────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Graceful Shutdown   │
                    │ Exit Code: 0        │
                    └─────────────────────┘
```

---

## Summary

Apollo's persistence system provides:

✅ **Reliability** - Critical data saved immediately to database  
✅ **Performance** - Analytics batched in-memory with periodic flushes  
✅ **Crash Protection** - SQLite WAL mode and graceful shutdown sequence  
✅ **Flexibility** - Support for both SQLite and PostgreSQL  
✅ **Data Recovery** - Schedulers reload from database on startup  
✅ **Developer Friendly** - Simple async/await API for all persistence operations  

By following the best practices outlined in this document, you can ensure that Apollo's persistence system reliably protects your bot's critical data.
