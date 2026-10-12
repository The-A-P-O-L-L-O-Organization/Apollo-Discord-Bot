# Idempotency Gaps Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all identified idempotency gaps in Apollo Discord Bot v3 across 6 component areas: Discord event handlers, inline slash commands, schedulers, integration pollers, NSFW job, and Interlink event consumers.

**Architecture:** Each gap is fixed by introducing Redis-backed deduplication using existing `NonceStore` pattern (atomic Lua `SET NX EX`) or extending it for new use cases. The plan reuses `src/queue/nonceStore.ts` and `src/utils/lock.ts` primitives rather than inventing new mechanisms.

**Tech Stack:** TypeScript (ESM), Redis (ioredis), BullMQ, Vitest, discord.js v14

**Spec:** This plan implements the idempotency gaps identified in the oracle analysis (m0026) and subsequent exploration. All work must pass `pnpm typecheck`, `pnpm lint`, `pnpm lint:locales`, and relevant test suites.

---

## Global Constraints

- **Runtime:** Node.js 22+; CI/production target Node.js 26
- **Package manager:** pnpm only
- **Language:** Strict TypeScript with ESM (`"type": "module"`); relative imports require `.js` suffix
- **Style:** 4-space indentation, single quotes, semicolons, no trailing commas, `eqeqeq`, `curly: all`
- **No emojis** in source, tests, docs, commit messages
- **No code comments** unless explicitly requested
- **All async must be awaited or explicitly voided** — floating promises are errors
- **Use existing utilities** in `src/utils/` over duplicated helpers
- **Tests must be deterministic** — mock Discord.js, filesystem, network, Redis, database, timers, randomness
- **Security-relevant changes require tests** for auth, authorization, validation, safe error handling
- **Verification gates per change type** (see AGENTS.md §19)

---

## Review Focus

1. **Duplicate Discord event deliveries** — Discord can redeliver events on gateway reconnect; handlers must deduplicate by event ID + timestamp
2. **Inline command execution without queue** — When `QUEUE_ENABLED=false`, commands execute inline with zero deduplication; any retry = duplicate effect
3. **Scheduler crash mid-task** — `withLock` prevents concurrent execution but not re-execution after crash; DB updates must be conditional
4. **Poller in-memory deduplication lost on restart** — `knownItems` Map resets on pod restart; duplicate notifications after failover
5. **NSFW job no deduplication** — Same image enqueued multiple times = multiple analyses
6. **Interlink consumer no deduplication** — Relay has nonce protection but TypeScript handlers don't track processed envelopes

---

## File Map

| Phase | Component | New Files | Modified Files |
|-------|-----------|-----------|----------------|
| P0-1 | Discord Event Deduplication | `src/utils/eventDedupe.ts` | 20 event handler files in `src/plugins/*/events/` |
| P0-2 | Scheduler Idempotent DB | — | 5 scheduler files in `src/utils/*Scheduler.ts` |
| P1-1 | Integration Poller Redis Dedup | — | `src/utils/integrationPoller.ts` |
| P1-2 | NSFW Job Deduplication | — | `src/queue/jobs/nsfwAnalyze.ts` |
| P1-3 | Inline Mode Nonce Cache | — | `src/queue/gatewayRouter.ts` |
| P2 | Interlink Consumer Dedup | — | `src/plugins/interlink/plugin.ts` |

---

## Phase P0-1: Discord Event Deduplication (Highest Risk)

### Files
- **Create:** `src/utils/eventDedupe.ts`
- **Modify:** 
  - `src/plugins/admin/events/guildBanAdd.ts`
  - `src/plugins/admin/events/guildBanRemove.ts`
  - `src/plugins/admin/events/guildCreate.ts`
  - `src/plugins/admin/events/guildDelete.ts`
  - `src/plugins/admin/events/messageDelete.ts`
  - `src/plugins/admin/events/messageDeleteBulk.ts`
  - `src/plugins/admin/events/messageReactionAdd.ts`
  - `src/plugins/admin/events/messageReactionRemove.ts`
  - `src/plugins/admin/events/messageUpdate.ts`
  - `src/plugins/admin/events/voiceStateUpdate.ts`
  - `src/plugins/admin/events/guildMemberUpdate.ts`
  - `src/plugins/moderation/events/guildMemberAdd.ts`
  - `src/plugins/moderation/events/guildMemberRemove.ts`
  - `src/plugins/automod/events/messageCreate.ts`
  - `src/plugins/tickets/events/interactionCreate.ts`
  - `src/plugins/tickets/events/slaMonitor.ts`
  - `src/plugins/utility/events/messageCreate.ts`
  - (plus any additional event handlers discovered)

### Interfaces
- **Consumes:** `NonceStore` from `src/queue/nonceStore.ts` (existing)
- **Produces:** `EventDedupe` class with `checkAndSetEvent(eventId: string, timestamp: number): Promise<boolean>` and `getDedupeKey(eventType: string, eventId: string): string`

### Step 1: Write failing test for EventDedupe

```typescript
// tests/unit/event-dedupe.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventDedupe } from '../../src/utils/eventDedupe.js';

const mockRedis = {
    eval: vi.fn(),
    script: vi.fn(),
    quit: vi.fn(),
    status: 'ready',
    on: vi.fn(),
    evalsha: vi.fn(),
    connect: vi.fn(),
    ping: vi.fn(),
};

vi.mock('ioredis', () => ({
    default: class {
        constructor() { Object.assign(this, mockRedis); }
    }
}));

describe('EventDedupe', () => {
    let dedupe: EventDedupe;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRedis.eval.mockResolvedValue(1);
        mockRedis.script.mockResolvedValue('sha123');
        dedupe = new EventDedupe(mockRedis as any);
    });

    afterEach(async () => {
        await dedupe.close();
        vi.restoreAllMocks();
    });

    it('returns true for first event delivery', async () => {
        const result = await dedupe.checkAndSetEvent('guildBanAdd:12345', 1000000);
        expect(result).toBe(true);
    });

    it('returns false for duplicate event delivery', async () => {
        mockRedis.eval.mockResolvedValueOnce(1);
        mockRedis.eval.mockResolvedValueOnce(0);
        
        await dedupe.checkAndSetEvent('guildBanAdd:12345', 1000000);
        const result = await dedupe.checkAndSetEvent('guildBanAdd:12345', 1000000);
        
        expect(result).toBe(false);
    });

    it('uses separate keys per event type', async () => {
        mockRedis.eval.mockResolvedValueOnce(1);
        mockRedis.eval.mockResolvedValueOnce(1);
        
        await dedupe.checkAndSetEvent('guildBanAdd:123', 1000);
        await dedupe.checkAndSetEvent('messageDelete:123', 1000);
        
        const calls = mockRedis.eval.mock.calls;
        expect(calls[0][2]).toContain('guildBanAdd:123');
        expect(calls[1][2]).toContain('messageDelete:123');
    });
});
```

**Run:** `pnpm vitest run tests/unit/event-dedupe.test.ts`
**Expected:** FAIL - `EventDedupe` not defined

### Step 2: Implement EventDedupe class

```typescript
// src/utils/eventDedupe.ts
import type { RedisClient } from './redisCluster.js';

const CHECK_AND_SET_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local result = redis.call('SET', key, '1', 'NX', 'EX', ttl)
if result then return 1 else return 0 end
`;

export class EventDedupe {
    private redis: RedisClient;
    private ttlSeconds: number;
    private keyPrefix: string;
    private checkAndSetSha: string | null = null;
    private closed = false;

    constructor(redis: RedisClient, options: { ttlSeconds?: number; keyPrefix?: string } = {}) {
        this.redis = redis;
        this.ttlSeconds = options.ttlSeconds ?? 600; // 10 minutes default
        this.keyPrefix = options.keyPrefix ?? 'event:dedupe:';
    }

    async initialize(): Promise<void> {
        this.checkAndSetSha = await this.redis.script('LOAD', CHECK_AND_SET_SCRIPT) as string;
    }

    getDedupeKey(eventType: string, eventId: string): string {
        return `${this.keyPrefix}${eventType}:${eventId}`;
    }

    async checkAndSetEvent(eventType: string, eventId: string, timestamp?: number): Promise<boolean> {
        if (this.closed) throw new Error('EventDedupe is closed');
        
        const key = this.getDedupeKey(eventType, eventId);
        const ts = timestamp ?? Date.now();
        const fullKey = `${key}:${ts}`;
        const ttl = this.ttlSeconds.toString();

        try {
            let result: number;
            if (this.checkAndSetSha) {
                result = await this.redis.evalsha(this.checkAndSetSha, 1, fullKey, ttl) as number;
            } else {
                result = await this.redis.eval(CHECK_AND_SET_SCRIPT, 1, fullKey, ttl) as number;
            }
            return result === 1;
        } catch (error) {
            if (error instanceof Error && error.message.includes('NOSCRIPT')) {
                await this.initialize();
                return this.checkAndSetEvent(eventType, eventId, timestamp);
            }
            throw error;
        }
    }

    async close(): Promise<void> {
        if (!this.closed) {
            this.closed = true;
            await this.redis.quit();
        }
    }
}

export default EventDedupe;
```

### Step 3: Run test to verify it passes

**Run:** `pnpm vitest run tests/unit/event-dedupe.test.ts`
**Expected:** PASS

### Step 4: Add EventDedupe to each event handler (example pattern)

For each event handler file (e.g., `src/plugins/admin/events/guildBanAdd.ts`):

```typescript
// At top of file, add imports
import { EventDedupe } from '../../../utils/eventDedupe.js';
import { getLockRedis } from '../../../utils/lock.js';

let eventDedupe: EventDedupe | null = null;

async function getEventDedupe(): Promise<EventDedupe> {
    if (!eventDedupe) {
        const redis = await getLockRedis();
        if (redis) {
            eventDedupe = new EventDedupe(redis, { ttlSeconds: 600 });
            await eventDedupe.initialize();
        }
    }
    return eventDedupe!;
}

// In execute(), add early return for duplicates:
export default {
    name: 'guildBanAdd',
    once: false,
    async execute(ban: GuildBan, _client: unknown) {
        const dedupe = await getEventDedupe();
        const eventId = `${ban.guild.id}:${ban.user.id}`;
        const isNew = await dedupe.checkAndSetEvent('guildBanAdd', eventId);
        if (!isNew) return; // Duplicate delivery - skip
        
        // ... rest of existing handler logic
    }
};
```

**Note:** Apply same pattern to all 20 event handler files. Each uses unique `eventType` (e.g., `guildBanAdd`, `messageDelete`, `memberJoin`) and composite `eventId` from Discord-provided IDs.

### Step 5: Write integration test for duplicate event handling

```typescript
// tests/integration/event-deduplication.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockGuild, createMockUser } from '../mocks/discord.js';

describe('Event handler deduplication', () => {
    it('skips duplicate guildBanAdd delivery', async () => {
        const { logEvent } = await import('../../src/utils/guildLogging.js');
        const guildBanAdd = await import('../../src/plugins/admin/events/guildBanAdd.js');
        
        const mockLogEvent = vi.spyOn(await import('../../src/utils/guildLogging.js'), 'logEvent')
            .mockResolvedValue(undefined);
        
        const guild = createMockGuild({ id: 'guild-1' });
        const user = createMockUser({ id: 'user-1' });
        const ban = { guild, user, reason: 'Test ban' } as any;
        
        // First delivery
        await guildBanAdd.default.execute(ban, {});
        expect(mockLogEvent).toHaveBeenCalledTimes(1);
        
        // Second delivery (duplicate)
        await guildBanAdd.default.execute(ban, {});
        expect(mockLogEvent).toHaveBeenCalledTimes(1); // Still 1 - deduplicated
    });
});
```

**Run:** `pnpm vitest run tests/integration/event-deduplication.test.ts`
**Expected:** PASS

### Step 6: Run full test suite + lint + typecheck

**Run:** `pnpm lint && pnpm typecheck && pnpm test`
**Expected:** All pass

### Step 7: Commit

```bash
git add src/utils/eventDedupe.ts tests/unit/event-dedupe.test.ts tests/integration/event-deduplication.test.ts
git add src/plugins/admin/events/*.ts src/plugins/moderation/events/*.ts src/plugins/automod/events/*.ts src/plugins/tickets/events/*.ts src/plugins/utility/events/*.ts
git commit -m "feat: add Discord event deduplication via EventDedupe (P0-1)"
```

---

## Phase P0-2: Scheduler Idempotent DB Operations

### Files
- **Modify:**
  - `src/utils/tempbanScheduler.ts`
  - `src/utils/reminderScheduler.ts`
  - `src/utils/tempRolesScheduler.ts`
  - `src/utils/pollScheduler.ts`
  - `src/utils/integrationPoller.ts` (also covered in P1-1)

### Interfaces
- **Consumes:** Existing `withLock`, `getData`, `setData` from `src/utils/db.ts`
- **Produces:** Idempotent DB operations using conditional updates / transactions

### Step 1: Write failing test for tempbanScheduler idempotency

```typescript
// tests/unit/tempban-scheduler-idempotent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkTempbans } from '../../src/utils/tempbanScheduler.js';

describe('tempbanScheduler idempotency', () => {
    it('does not double-process same tempban on re-run', async () => {
        const mockDb = {
            getGuildData: vi.fn().mockResolvedValue({ tempbans: [{ userId: 'user-1', unbanAt: Date.now() - 1000 }] }),
            setGuildData: vi.fn().mockResolvedValue(undefined),
        };
        vi.doMock('../../src/utils/db.js', () => mockDb);
        
        // First run - processes tempban
        await checkTempbans(mockClient);
        expect(mockDb.setGuildData).toHaveBeenCalledTimes(1);
        
        // Second run (simulating crash after unban but before DB update)
        // Should find empty tempbans and not error
        mockDb.getGuildData.mockResolvedValueOnce({ tempbans: [] });
        await checkTempbans(mockClient);
        expect(mockDb.setGuildData).toHaveBeenCalledTimes(1); // Still 1
    });
});
```

**Run:** `pnpm vitest run tests/unit/tempban-scheduler-idempotent.test.ts`
**Expected:** FAIL - current implementation not idempotent

### Step 2: Modify tempbanScheduler to use conditional DELETE

```typescript
// In tempbanScheduler.ts - modify checkTempbans function
// Change from: fetch all -> process each -> update DB
// To: atomic DELETE with RETURNING (Postgres) or transaction (SQLite)

// In processCommand.ts pattern: use transaction or conditional update
// For tempbans: DELETE FROM guild_data WHERE key = 'tempbans' AND json_extract(value, '$.unbanAt') <= ? RETURNING *
// Then process only returned rows
```

**Implementation approach:** Use Knex transactions with `for update` or conditional updates that only affect rows matching criteria. If DB returns 0 affected rows, nothing to process.

### Step 3: Apply same pattern to all 4 other schedulers

- **reminderScheduler.ts**: Conditional delete of processed reminders
- **tempRolesScheduler.ts**: Conditional delete of expired temp roles
- **pollScheduler.ts**: Conditional update of poll status to 'closed'
- **integrationPoller.ts**: (covered in P1-1)

### Step 4: Run tests + verification

**Run:** `pnpm vitest run tests/unit/*scheduler*.test.ts && pnpm lint && pnpm typecheck`
**Expected:** All pass

### Step 5: Commit

```bash
git add src/utils/tempbanScheduler.ts src/utils/reminderScheduler.ts src/utils/tempRolesScheduler.ts src/utils/pollScheduler.ts
git add tests/unit/*scheduler-idempotent.test.ts
git commit -m "feat: make scheduler DB operations idempotent (P0-2)"
```

---

## Phase P1-1: Integration Poller Persistent Deduplication

### Files
- **Modify:** `src/utils/integrationPoller.ts`

### Interfaces
- **Consumes:** `getLockRedis` from `src/utils/lock.ts`, `NonceStore` pattern
- **Produces:** Redis-backed deduplication keys replacing in-memory `knownItems` Map

### Step 1: Write failing test

```typescript
// tests/unit/integration-poller-dedup.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pollYoutubeSubscriptions } from '../../src/utils/integrationPoller.js';

describe('integrationPoller persistent deduplication', () => {
    it('does not re-notify same video after pod restart', async () => {
        const mockRedis = {
            eval: vi.fn().mockResolvedValue(1), // First check - new
            script: vi.fn().mockResolvedValue('sha'),
            quit: vi.fn(),
            status: 'ready',
            on: vi.fn(),
            evalsha: vi.fn(),
            connect: vi.fn(),
            ping: vi.fn(),
        };
        vi.mock('ioredis', () => ({ default: class { constructor() { Object.assign(this, mockRedis); } } }));
        
        // Simulate first run - video is new
        await pollYoutubeSubscriptions();
        expect(mockRedis.eval).toHaveBeenCalled();
        
        // Simulate pod restart - new instance, same video
        mockRedis.eval.mockResolvedValueOnce(0); // Already exists
        await pollYoutubeSubscriptions();
        
        // Should not send notification (eval returns 0)
    });
});
```

### Step 2: Replace in-memory `knownItems` with Redis NonceStore

```typescript
// In integrationPoller.ts
import { NonceStore } from '../queue/nonceStore.js';
import { getLockRedis } from './lock.js';

let pollerDedupe: NonceStore | null = null;

async function getPollerDedupe(): Promise<NonceStore> {
    if (!pollerDedupe) {
        const redis = await getLockRedis();
        if (redis) {
            pollerDedupe = new NonceStore(redis, { 
                ttlSeconds: 86400 * 30, // 30 days for poller items
                keyPrefix: 'poller:dedupe:'
            });
            await pollerDedupe.initialize();
        }
    }
    return pollerDedupe!;
}

// In pollYoutubeSubscriptions:
// Replace: if (!seen.has(video.videoId))
// With: const isNew = await dedupe.checkAndSetEvent('youtube', `${sub.id}:${video.videoId}`)
// if (!isNew) continue;
```

### Step 3: Apply to Twitch and RSS pollers similarly

### Step 4: Run tests + verification

**Run:** `pnpm vitest run tests/unit/integration-poller-dedup.test.ts && pnpm lint && pnpm typecheck`
**Expected:** All pass

### Step 5: Commit

```bash
git add src/utils/integrationPoller.ts tests/unit/integration-poller-dedup.test.ts
git commit -m "feat: add persistent deduplication to integration pollers (P1-1)"
```

---

## Phase P1-2: NSFW Job Deduplication

### Files
- **Modify:** `src/queue/jobs/nsfwAnalyze.ts`

### Step 1: Write failing test

```typescript
// tests/queue/nsfw-deduplication.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeImage } from '../../src/queue/jobs/nsfwAnalyze.js';

describe('NSFW job deduplication', () => {
    it('rejects duplicate job with same image hash', async () => {
        const mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
        vi.mock('../../src/queue/queue.js', () => ({ nsfwQueue: mockQueue }));
        
        const imageHash = 'abc123';
        await analyzeImage({ imageHash, guildId: 'g1', channelId: 'c1', userId: 'u1' });
        await analyzeImage({ imageHash, guildId: 'g1', channelId: 'c1', userId: 'u1' });
        
        // Second call should not enqueue (BullMQ deduplication)
        expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });
});
```

### Step 2: Add BullMQ job ID deduplication to nsfwAnalyze.ts

```typescript
// In enqueue function in nsfwAnalyze.ts
// Add jobId based on image hash + guild + channel
const jobId = `nsfw:${imageHash}:${guildId}:${channelId}`;
await nsfwQueue.add('nsfw:analyze', payload, { 
    jobId,
    deduplication: { id: jobId, ttl: 300000 } // 5 min like process-command
});
```

### Step 3: Run tests + verification

**Run:** `pnpm vitest run tests/queue/nsfw-deduplication.test.ts && pnpm lint && pnpm typecheck`
**Expected:** All pass

### Step 4: Commit

```bash
git add src/queue/jobs/nsfwAnalyze.ts tests/queue/nsfw-deduplication.test.ts
git commit -m "feat: add job deduplication to NSFW analysis job (P1-2)"
```

---

## Phase P1-3: Inline Mode Nonce Cache

### Files
- **Modify:** `src/queue/gatewayRouter.ts`

### Step 1: Write failing test

```typescript
// tests/unit/inline-mode-dedupe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueOrRun } from '../../src/queue/gatewayRouter.js';

describe('Inline mode deduplication', () => {
    it('rejects duplicate inline execution within TTL', async () => {
        const mockHandler = vi.fn().mockResolvedValue({ success: true });
        const data = { id: 'interaction-123', commandName: 'test' };
        
        // First execution
        await queueOrRun('test', data, mockHandler, { queueEnabled: false });
        expect(mockHandler).toHaveBeenCalledTimes(1);
        
        // Second execution (duplicate interaction)
        await queueOrRun('test', data, mockHandler, { queueEnabled: false });
        expect(mockHandler).toHaveBeenCalledTimes(1); // Still 1 - deduplicated
    });
});
```

### Step 2: Add in-memory nonce cache to gatewayRouter.ts

```typescript
// In gatewayRouter.ts
const inlineNonceCache = new Map<string, number>();
const INLINE_NONCE_TTL = 300000; // 5 minutes

function checkInlineNonce(interactionId: string): boolean {
    const now = Date.now();
    const entry = inlineNonceCache.get(interactionId);
    if (entry && now - entry < INLINE_NONCE_TTL) {
        return false; // Duplicate
    }
    inlineNonceCache.set(interactionId, now);
    // Cleanup old entries periodically
    if (inlineNonceCache.size > 10000) {
        for (const [key, ts] of inlineNonceCache) {
            if (now - ts > INLINE_NONCE_TTL) inlineNonceCache.delete(key);
        }
    }
    return true;
}

// In queueOrRun when queueEnabled=false:
if (!config.queue.enabled) {
    if (!checkInlineNonce(data.id)) {
        logger.warn('[GatewayRouter] Duplicate inline interaction rejected');
        return { queued: false, result: { error: 'duplicate' } };
    }
    const result = await handler(data);
    return { queued: false, result };
}
```

### Step 3: Run tests + verification

**Run:** `pnpm vitest run tests/unit/inline-mode-dedupe.test.ts && pnpm lint && pnpm typecheck`
**Expected:** All pass

### Step 4: Commit

```bash
git add src/queue/gatewayRouter.ts tests/unit/inline-mode-dedupe.test.ts
git commit -m "feat: add inline mode nonce cache for queue-disabled deployments (P1-3)"
```

---

## Phase P2: Interlink Consumer Deduplication

### Files
- **Modify:** `src/plugins/interlink/plugin.ts`

### Step 1: Write failing test

```typescript
// tests/plugins/interlink/consumer-dedup.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterlinkPlugin } from '../../../src/plugins/interlink/plugin.js';

describe('Interlink consumer deduplication', () => {
    it('rejects duplicate envelope with same nonce', async () => {
        const plugin = new InterlinkPlugin();
        const envelope = { nonce: 'test-nonce-1', procedure: 'Send', payload: {} };
        
        // First delivery
        await plugin.handleEnvelope(envelope);
        // Second delivery (replay)
        await plugin.handleEnvelope(envelope);
        
        // Should only process once
    });
});
```

### Step 2: Add NonceStore to interlink plugin

```typescript
// In plugin.ts
import { NonceStore } from '../../queue/nonceStore.js';
import { getLockRedis } from '../../utils/lock.js';

let interlinkDedupe: NonceStore | null = null;

async function getInterlinkDedupe(): Promise<NonceStore> {
    if (!interlinkDedupe) {
        const redis = await getLockRedis();
        if (redis) {
            interlinkDedupe = new NonceStore(redis, { 
                ttlSeconds: 86400, // 24 hours
                keyPrefix: 'interlink:dedupe:'
            });
            await interlinkDedupe.initialize();
        }
    }
    return interlinkDedupe!;
}

// In handleEnvelope / message handlers:
const dedupe = await getInterlinkDedupe();
const isNew = await dedupe.checkAndSetEvent('envelope', envelope.nonce, Date.now());
if (!isNew) {
    logger.debug('[Interlink] Duplicate envelope rejected', { nonce: envelope.nonce });
    return; // Skip duplicate
}
```

### Step 3: Run tests + verification

**Run:** `pnpm vitest run tests/plugins/interlink/consumer-dedup.test.ts && pnpm lint && pnpm typecheck`
**Expected:** All pass

### Step 4: Commit

```bash
git add src/plugins/interlink/plugin.ts tests/plugins/interlink/consumer-dedup.test.ts
git commit -m "feat: add consumer-side deduplication to Interlink plugin (P2)"
```

---

## Final Verification

After all phases complete:

```bash
# Full verification
pnpm lint
pnpm typecheck
pnpm lint:locales
pnpm test
pnpm vitest run tests/unit/event-dedupe.test.ts tests/unit/tempban-scheduler-idempotent.test.ts tests/unit/integration-poller-dedup.test.ts tests/queue/nsfw-deduplication.test.ts tests/unit/inline-mode-dedupe.test.ts tests/plugins/interlink/consumer-dedup.test.ts tests/integration/event-deduplication.test.ts
```

All must pass before considering the plan complete.

---

## Execution Recommendation

**Use Subagent-driven development** because:
- 6 independent phases with clear boundaries
- Each phase has its own test file and verification gate
- High risk of cross-component interference if done in single context
- Fresh reviewer per phase catches architectural drift early
- Total ~20 files modified across 6 components — too much for single-context review