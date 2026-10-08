# Phase 1: Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 low-effort, high-impact technical debt items that provide immediate risk reduction with minimal code changes.

**Architecture:** Each fix is independent and targets a specific, well-understood vulnerability or bug. Changes are localized to 1-2 files each with clear testable outcomes.

**Tech Stack:** Node.js 22+, TypeScript, ioredis, BullMQ, Vitest

**Spec:** This plan addresses items from the Technical Debt Assessment:
- Add `protocol: 2` to Redis clients (ioredis RESP3 compatibility)
- Add `QUEUE_HMAC_SECRET` validation in startup checks
- Fix `EventBus.unsubscribe()` with subscription ID tracking
- Add HMAC-signed capability grants for worker sandbox
- Remove `@tensorflow/tfjs-node` if unused

## Global Constraints

- **Node.js:** ≥22 (Iron LTS) — enforced in `package.json` engines, `.nvmrc`, Docker, CI
- **TypeScript:** Strict mode, ESM only (`"type": "module"`)
- **Lint:** `pnpm lint` (ESLint flat config, 4-space indent, single quotes, semicolons, no trailing commas)
- **Test:** `pnpm test` (Vitest, coverage excludes `src/index.ts` and `src/handlers/**`)
- **No emojis** in source or docs
- **No code comments** unless explicitly requested
- **pnpm only** — never npm/npx

## Review Focus

| Input/Condition | Expected Behavior | Test Location |
|-----------------|-------------------|---------------|
| Redis client created without `protocol: 2` | Uses RESP2 (v5 compatible) | `tests/unit/redis-protocol.test.ts` |
| `QUEUE_HMAC_SECRET` unset in production | Startup fails with clear error | `tests/unit/startup-checks.test.ts` |
| `EventBus.unsubscribe(subscription)` called | Handler removed, no memory leak | `tests/unit/eventbus-unsubscribe.test.ts` |
| Worker child receives forged capability | Request rejected, capability signature verified | `tests/unit/worker-capability-signature.test.ts` |
| `@tensorflow/tfjs-node` not in dependencies | `pnpm install` succeeds, no native build | `pnpm install` verification |

---

### Task 1: Fix ioredis RESP3 Compatibility

**Files:**
- Modify: `src/queue/queue.ts` (Redis client creation for BullMQ)
- Modify: `src/plugins/interlink/connectClient.ts` (Interlink Redis client)
- Test: `tests/unit/redis-protocol.test.ts`

**Interfaces:**
- Consumes: `createRedisClient()` function signature from `src/utils/redis.ts`
- Produces: Redis clients with `protocol: 2` option set

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/redis-protocol.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRedisClient } from '../../src/utils/redis.js'

describe('Redis protocol version', () => {
  it('creates client with protocol: 2 for RESP2 compatibility', () => {
    const client = createRedisClient({ url: 'redis://localhost:6379' })
    expect(client.options.protocol).toBe(2)
    client.disconnect()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/redis-protocol.test.ts
# Expected: FAIL - protocol option not set or undefined
```

- [ ] **Step 3: Implement minimal fix**

```typescript
// src/utils/redis.ts - modify createRedisClient()
export function createRedisClient(options: RedisOptions = {}): Redis {
  const url = options.url || process.env.REDIS_URL || 'redis://localhost:6379'
  return new Redis(url, {
    ...options,
    protocol: 2, // Force RESP2 for ioredis v6 compatibility
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
    retryStrategy: options.retryStrategy ?? defaultRetryStrategy,
    lazyConnect: options.lazyConnect ?? true,
  })
}
```

- [ ] **Step 4: Verify all Redis client usages pass protocol: 2**

```typescript
// src/queue/queue.ts - verify BullMQ connection uses createRedisClient
import { createRedisClient } from '../utils/redis.js'

export const queue = new Queue('commands', {
  connection: createRedisClient({ url: process.env.QUEUE_REDIS_URL }),
  // ... rest of config
})
```

```typescript
// src/plugins/interlink/connectClient.ts - verify Redis client uses protocol: 2
import { createRedisClient } from '../../utils/redis.js'

this.redis = createRedisClient({ url: process.env.INTERLINK_REDIS_URL })
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test tests/unit/redis-protocol.test.ts
# Expected: PASS
```

- [ ] **Step 6: Run full test suite to ensure no regressions**

```bash
pnpm test
# Expected: No new failures (pre-existing 494 failures acceptable)
```

- [ ] **Step 7: Commit**

```bash
git add src/utils/redis.ts tests/unit/redis-protocol.test.ts
git commit -m "fix: force RESP2 protocol for ioredis v6 compatibility"
```

---

### Task 2: Add QUEUE_HMAC_SECRET Validation

**Files:**
- Modify: `src/utils/startupChecks.ts` (add validation)
- Test: `tests/unit/startup-checks.test.ts`

**Interfaces:**
- Consumes: `validateEnvironment()` function
- Produces: Throws error if `QUEUE_HMAC_SECRET` missing in production

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/startup-checks.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateEnvironment } from '../../src/utils/startupChecks.js'

describe('QUEUE_HMAC_SECRET validation', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.NODE_ENV = 'production'
    process.env.DISCORD_TOKEN = 'test-token'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.OPERATOR_AGREEMENT = 'true'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('throws when QUEUE_HMAC_SECRET is missing in production', async () => {
    delete process.env.QUEUE_HMAC_SECRET
    await expect(validateEnvironment()).rejects.toThrow('QUEUE_HMAC_SECRET is required in production')
  })

  it('allows missing QUEUE_HMAC_SECRET in development', async () => {
    delete process.env.QUEUE_HMAC_SECRET
    process.env.NODE_ENV = 'development'
    await expect(validateEnvironment()).resolves.not.toThrow()
  })

  it('accepts valid QUEUE_HMAC_SECRET in production', async () => {
    process.env.QUEUE_HMAC_SECRET = 'valid-secret-at-least-32-chars-long'
    await expect(validateEnvironment()).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/startup-checks.test.ts
# Expected: FAIL - validation not implemented
```

- [ ] **Step 3: Implement minimal fix**

```typescript
// src/utils/startupChecks.ts - add to validateEnvironment()
async function validateEnvironment(): Promise<void> {
  // ... existing validations ...

  // Add after existing Redis validation
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.QUEUE_HMAC_SECRET) {
      throw new Error('QUEUE_HMAC_SECRET is required in production')
    }
    if (process.env.QUEUE_HMAC_SECRET.length < 32) {
      throw new Error('QUEUE_HMAC_SECRET must be at least 32 characters')
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/startup-checks.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/utils/startupChecks.ts tests/unit/startup-checks.test.ts
git commit -m "fix: require QUEUE_HMAC_SECRET in production"
```

---

### Task 3: Fix EventBus.unsubscribe() with Subscription ID Tracking

**Files:**
- Modify: `src/core/EventBus.ts` (add subscription ID tracking)
- Test: `tests/unit/eventbus-unsubscribe.test.ts`

**Interfaces:**
- Consumes: `EventBus.subscribe()` returns `Subscription` with `id`
- Produces: `EventBus.unsubscribe(subscription)` removes specific handler

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/eventbus-unsubscribe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventBus } from '../../src/core/EventBus.js'

describe('EventBus.unsubscribe', () => {
  let bus: EventBus
  const handler = vi.fn()

  beforeEach(() => {
    bus = new EventBus()
    vi.useFakeTimers()
  })

  it('returns subscription with unique id', () => {
    const sub = bus.subscribe('test.event', handler)
    expect(sub).toHaveProperty('id')
    expect(typeof sub.id).toBe('string')
    expect(sub.id.length).toBeGreaterThan(0)
  })

  it('removes specific handler when unsubscribed', async () => {
    const sub = bus.subscribe('test.event', handler)
    await bus.publish('test.event', { data: 'test' })
    expect(handler).toHaveBeenCalledTimes(1)

    await bus.unsubscribe(sub)
    await bus.publish('test.event', { data: 'test2' })
    expect(handler).toHaveBeenCalledTimes(1) // Not called again
  })

  it('does not affect other handlers for same event', async () => {
    const handler2 = vi.fn()
    const sub1 = bus.subscribe('test.event', handler)
    const sub2 = bus.subscribe('test.event', handler2)

    await bus.unsubscribe(sub1)
    await bus.publish('test.event', { data: 'test' })

    expect(handler).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledTimes(1)
  })

  it('handles unsubscribe of non-existent subscription gracefully', async () => {
    const fakeSub = { id: 'non-existent', filter: {}, handler: vi.fn() }
    await expect(bus.unsubscribe(fakeSub)).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/eventbus-unsubscribe.test.ts
# Expected: FAIL - unsubscribe is no-op, no subscription IDs
```

- [ ] **Step 3: Implement minimal fix**

```typescript
// src/core/EventBus.ts - modify subscribe() and unsubscribe()

interface Subscription {
  id: string
  filter: EventFilter
  handler: EventHandler
}

private subscriptions = new Map<string, Subscription[]>()
private subscriptionIdCounter = 0

subscribe(filter: EventFilter, handler: EventHandler): Subscription {
  const id = `sub_${++this.subscriptionIdCounter}_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const subscription: Subscription = { id, filter, handler }

  const key = this.filterKey(filter)
  if (!this.subscriptions.has(key)) {
    this.subscriptions.set(key, [])
  }
  this.subscriptions.get(key)!.push(subscription)

  return subscription
}

async unsubscribe(subscription: Subscription): Promise<void> {
  const key = this.filterKey(subscription.filter)
  const subs = this.subscriptions.get(key)
  if (!subs) return

  const index = subs.findIndex(s => s.id === subscription.id)
  if (index !== -1) {
    subs.splice(index, 1)
  }
  if (subs.length === 0) {
    this.subscriptions.delete(key)
  }
}

private filterKey(filter: EventFilter): string {
  return JSON.stringify(filter)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/eventbus-unsubscribe.test.ts
# Expected: PASS
```

- [ ] **Step 5: Verify existing EventBus tests still pass**

```bash
pnpm test tests/unit/eventbus.test.ts
# Expected: PASS (or no new failures)
```

- [ ] **Step 6: Commit**

```bash
git add src/core/EventBus.ts tests/unit/eventbus-unsubscribe.test.ts
git commit -m "fix: implement EventBus.unsubscribe with subscription ID tracking"
```

---

### Task 4: Add HMAC-Signed Capability Grants for Worker Sandbox

**Files:**
- Modify: `src/core/worker/workerHost.ts` (sign capabilities)
- Modify: `src/core/worker/workerChild.ts` (verify signatures)
- Test: `tests/unit/worker-capability-signature.test.ts`

**Interfaces:**
- Consumes: `WorkerHost.getGrantedCapabilities()` returns signed capabilities
- Produces: `workerChild.call()` verifies signature before executing

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/worker-capability-signature.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signCapabilities, verifyCapabilities } from '../../src/core/worker/capabilitySignature.js'

describe('Worker capability HMAC signing', () => {
  const secret = 'test-secret-key-at-least-32-chars-long'
  const pluginId = 'test-plugin'
  const capabilities = ['commands:register', 'events:listen']

  it('signs capabilities with plugin ID', () => {
    const signed = signCapabilities(pluginId, capabilities, secret)
    expect(signed).toHaveProperty('pluginId', pluginId)
    expect(signed).toHaveProperty('capabilities', capabilities)
    expect(signed).toHaveProperty('signature')
    expect(typeof signed.signature).toBe('string')
    expect(signed.signature.length).toBeGreaterThan(0)
  })

  it('verifies valid signature', () => {
    const signed = signCapabilities(pluginId, capabilities, secret)
    const result = verifyCapabilities(signed, secret)
    expect(result).toEqual({ pluginId, capabilities })
  })

  it('rejects tampered capabilities', () => {
    const signed = signCapabilities(pluginId, capabilities, secret)
    signed.capabilities.push('admin:dangerous')
    expect(() => verifyCapabilities(signed, secret)).toThrow('Invalid capability signature')
  })

  it('rejects wrong plugin ID', () => {
    const signed = signCapabilities(pluginId, capabilities, secret)
    signed.pluginId = 'other-plugin'
    expect(() => verifyCapabilities(signed, secret)).toThrow('Invalid capability signature')
  })

  it('rejects signature from different secret', () => {
    const signed = signCapabilities(pluginId, capabilities, secret)
    expect(() => verifyCapabilities(signed, 'different-secret')).toThrow('Invalid capability signature')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/worker-capability-signature.test.ts
# Expected: FAIL - sign/verify functions don't exist
```

- [ ] **Step 3: Create capability signature utility**

```typescript
// src/core/worker/capabilitySignature.ts - NEW FILE
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface SignedCapabilities {
  pluginId: string
  capabilities: string[]
  signature: string
  issuedAt: number
}

export function signCapabilities(pluginId: string, capabilities: string[], secret: string): SignedCapabilities {
  const payload = JSON.stringify({ pluginId, capabilities, issuedAt: Date.now() })
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return { pluginId, capabilities, signature, issuedAt: Date.now() }
}

export function verifyCapabilities(signed: SignedCapabilities, secret: string): { pluginId: string; capabilities: string[] } {
  const expectedPayload = JSON.stringify({ pluginId: signed.pluginId, capabilities: signed.capabilities, issuedAt: signed.issuedAt })
  const expectedSignature = createHmac('sha256', secret).update(expectedPayload).digest('hex')

  if (!timingSafeEqual(Buffer.from(signed.signature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid capability signature')
  }

  // Check expiry (24 hours)
  if (Date.now() - signed.issuedAt > 24 * 60 * 60 * 1000) {
    throw new Error('Capability grant expired')
  }

  return { pluginId: signed.pluginId, capabilities: signed.capabilities }
}
```

- [ ] **Step 4: Integrate into WorkerHost**

```typescript
// src/core/worker/workerHost.ts - modify getGrantedCapabilities()
import { signCapabilities } from './capabilitySignature.js'

private getGrantedCapabilities(plugin: Plugin, manifest: PluginManifest): string[] {
  // ... existing capability logic ...
  const capabilities = [...grantedCapabilities] // existing logic

  // Sign capabilities for worker child verification
  const secret = process.env.PLUGIN_CAPABILITY_SECRET || process.env.QUEUE_HMAC_SECRET
  if (!secret) {
    throw new Error('PLUGIN_CAPABILITY_SECRET or QUEUE_HMAC_SECRET required for capability signing')
  }

  const signed = signCapabilities(plugin.constructor.name, capabilities, secret)
  return signed // Return signed object instead of raw array
}
```

- [ ] **Step 5: Integrate into WorkerChild**

```typescript
// src/core/worker/workerChild.ts - modify call() to verify signature
import { verifyCapabilities } from './capabilitySignature.js'

async call(action: string, payload: unknown): Promise<WorkerResponse> {
  // Verify capability signature before executing
  const envCapabilities = process.env.PLUGIN_CAPABILITIES
  if (envCapabilities) {
    try {
      const signed = JSON.parse(envCapabilities)
      verifyCapabilities(signed, process.env.PLUGIN_CAPABILITY_SECRET || process.env.QUEUE_HMAC_SECRET || '')
    } catch {
      return { ok: false, error: 'Invalid or expired capability grant' }
    }
  }

  // ... rest of existing call() logic ...
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm test tests/unit/worker-capability-signature.test.ts
# Expected: PASS
```

- [ ] **Step 7: Run worker isolation test**

```bash
pnpm test tests/integration/worker-isolation.test.ts
# Expected: PASS (or no new failures)
```

- [ ] **Step 8: Commit**

```bash
git add src/core/worker/capabilitySignature.ts src/core/worker/workerHost.ts src/core/worker/workerChild.ts tests/unit/worker-capability-signature.test.ts
git commit -m "feat: add HMAC-signed capability grants for worker sandbox"
```

---

### Task 5: Remove @tensorflow/tfjs-node if Unused

**Files:**
- Modify: `package.json` (remove dependency)
- Modify: `pnpm-workspace.yaml` (remove from allowBuilds)
- Test: Verify build and tests pass

**Interfaces:**
- Consumes: Current dependency tree
- Produces: Clean dependency tree without tfjs-node

- [ ] **Step 1: Audit actual usage**

```bash
grep -r "@tensorflow/tfjs-node" src/ || echo "NOT USED IN SOURCE"
grep -r "tfjs" src/ || echo "NO TFJS IMPORTS"
grep -r "tensorflow" src/ || echo "NO TENSORFLOW IMPORTS"
```

- [ ] **Step 2: If unused, remove from package.json**

```bash
pnpm remove @tensorflow/tfjs-node
```

- [ ] **Step 3: Remove from pnpm-workspace.yaml allowBuilds**

```yaml
# pnpm-workspace.yaml
packages:
  - 'bot'
  - 'plugins/*'

allowedDeprecatedVersions: {}

onlyBuiltDependencies:
  - better-sqlite3
  - msgpackr-extract
  - core-js
  - '@swc/core'
  - '@bufbuild/buf'
  # REMOVE: - '@tensorflow/tfjs-node'
```

- [ ] **Step 4: Verify clean install**

```bash
pnpm install
# Expected: Success, no tfjs-node in node_modules
```

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
# Expected: No new failures
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "chore: remove unused @tensorflow/tfjs-node dependency"
```

---

### Task 6: Pin Node.js 22 LTS Across Project

**Files:**
- Modify: `package.json` (add engines field)
- Create: `.nvmrc`
- Modify: `Dockerfile` and `Dockerfile.prod`
- Modify: `.github/workflows/ci.yml` (Node version matrix)

**Interfaces:**
- Consumes: Current Node version references
- Produces: Consistent Node 22 requirement everywhere

- [ ] **Step 1: Add engines to package.json**

```json
// package.json
{
  "engines": {
    "node": ">=22.0.0"
  }
}
```

- [ ] **Step 2: Create .nvmrc**

```bash
echo "22" > .nvmrc
```

- [ ] **Step 3: Update Dockerfiles**

```dockerfile
# Dockerfile
FROM node:22-alpine AS base
# ...

# Dockerfile.prod
FROM node:22-alpine AS base
# ...
```

- [ ] **Step 4: Update CI workflow**

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    strategy:
      matrix:
        node-version: [22]
        # REMOVE: 18, 20
```

- [ ] **Step 5: Verify CI passes on Node 22**

```bash
fnm install 22 && fnm use 22 && pnpm install && pnpm test && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add package.json .nvmrc Dockerfile Dockerfile.prod .github/workflows/ci.yml
git commit -m "chore: pin Node.js 22 LTS across project"
```

---

## Execution Order

1. **Task 1** (ioredis protocol) - Independent, 5 min
2. **Task 2** (QUEUE_HMAC_SECRET) - Independent, 10 min
3. **Task 3** (EventBus unsubscribe) - Independent, 20 min
4. **Task 4** (Capability signatures) - Depends on Task 2 secret, 30 min
5. **Task 5** (Remove tfjs-node) - Independent, 10 min
6. **Task 6** (Pin Node 22) - Independent, 15 min

**Total estimated time:** ~90 minutes

## Post-Phase Verification

```bash
# Run all new tests
pnpm test tests/unit/redis-protocol.test.ts tests/unit/startup-checks.test.ts tests/unit/eventbus-unsubscribe.test.ts tests/unit/worker-capability-signature.test.ts

# Full suite
pnpm test

# Lint
pnpm lint

# Build
pnpm build
```

All should pass with no new failures beyond the pre-existing 494.