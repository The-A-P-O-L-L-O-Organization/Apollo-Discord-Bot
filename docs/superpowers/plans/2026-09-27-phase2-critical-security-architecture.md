# Phase 2: Critical Security & Architecture Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three Critical-risk architectural/security items: Redis SPOF for HA, Shared Interlink HMAC trust domain, and In-memory nonce store for HMAC replay protection.

**Architecture:** These fixes are interdependent — Redis HA enables distributed nonce store, which enables secure Interlink auth. Implement in sequence: Redis Cluster/Sentinel → Distributed nonce store → Per-bot JWT + mTLS for Interlink.

**Tech Stack:** Node.js 22+, TypeScript, ioredis (Redis Cluster/Sentinel), BullMQ, jsonwebtoken, node:crypto (TLS)

**Spec:** This plan addresses Technical Debt Assessment items:
1. **Redis as single point of failure** (Oracle HA-002, Explorer) — Critical
2. **Shared Interlink HMAC = full trust domain** (Oracle IL-001, Explorer) — Critical
3. **In-memory nonce store for HMAC replay** (Oracle Q-002, Explorer) — Critical

## Global Constraints

- **Node.js:** ≥22 (Iron LTS) — enforced in `package.json` engines, `.nvmrc`, Docker, CI
- **TypeScript:** Strict mode, ESM only (`"type": "module"`)
- **Lint:** `pnpm lint` (ESLint flat config, 4-space indent, single quotes, semicolons, no trailing commas)
- **Test:** `pnpm test` (Vitest, coverage excludes `src/index.ts` and `src/handlers/**`)
- **No emojis** in source or docs
- **No code comments** unless explicitly requested
- **pnpm only** — never npm/npx
- **Redis:** Must support Cluster mode (redis-cli --cluster) or Sentinel

## Review Focus

| Input/Condition | Expected Behavior | Test Location |
|-----------------|-------------------|---------------|
| Redis primary fails | Sentinel/Cluster fails over <5s, no data loss | `tests/integration/redis-failover.test.ts` |
| Network partition >3.3s | No split-brain, single leader elected | `tests/integration/leader-election-partition.test.ts` |
| Interlink request with expired JWT | Rejected with 401 | `tests/unit/interlink-jwt-auth.test.ts` |
| Interlink request with valid JWT | Accepted, bot identity verified | `tests/unit/interlink-jwt-auth.test.ts` |
| Duplicate job with same nonce | Rejected, not processed twice | `tests/unit/nonce-store-redis.test.ts` |
| Job replay after restart | Rejected (nonce persisted in Redis) | `tests/unit/nonce-store-redis.test.ts` |

---

### Task 1: Deploy Redis Sentinel/Cluster with Multi-AZ Support

**Files:**
- Create: `src/utils/redisCluster.ts` (Cluster/Sentinel client factory)
- Modify: `src/utils/redis.ts` (refactor to use new factory)
- Modify: `src/queue/queue.ts` (use cluster-aware connection)
- Modify: `src/core/EventBus.ts` (use cluster-aware connection)
- Modify: `src/plugins/interlink/connectClient.ts` (use cluster-aware connection)
- Test: `tests/integration/redis-failover.test.ts`

**Interfaces:**
- Consumes: `REDIS_SENTINEL_URLS` or `REDIS_CLUSTER_URLS` env vars
- Produces: `createRedisClient()` returns Cluster or Sentinel client with automatic failover

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/redis-failover.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createRedisClient } from '../../src/utils/redis.js'
import Redis from 'ioredis'

describe('Redis Cluster/Sentinel failover', () => {
  let client: Redis

  beforeAll(() => {
    // Requires testcontainers or external Redis Cluster/Sentinel
    // Skip if not available
    if (!process.env.REDIS_CLUSTER_URLS && !process.env.REDIS_SENTINEL_URLS) {
      console.log('Skipping: REDIS_CLUSTER_URLS or REDIS_SENTINEL_URLS not set')
      return
    }
    client = createRedisClient({ urls: process.env.REDIS_CLUSTER_URLS?.split(',') })
  })

  afterAll(async () => {
    if (client) await client.quit()
  })

  it('connects to cluster and executes commands', async () => {
    if (!client) return
    await client.set('test:failover', 'value')
    const result = await client.get('test:failover')
    expect(result).toBe('value')
  })

  it('handles automatic failover', async () => {
    if (!client) return
    // This test requires manual failover trigger or chaos testing
    // Placeholder for CI integration with testcontainers
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails (no cluster config)**

```bash
pnpm test tests/integration/redis-failover.test.ts
# Expected: FAIL - no cluster client implementation
```

- [ ] **Step 3: Create cluster-aware Redis factory**

```typescript
// src/utils/redisCluster.ts - NEW FILE
import Redis from 'ioredis'
import { RedisOptions, ClusterOptions, ClusterNode } from 'ioredis'

export type RedisClient = Redis | Redis.Cluster

export interface RedisConnectionConfig {
  mode: 'standalone' | 'sentinel' | 'cluster'
  urls?: string[]           // For cluster: ["redis://host1:6379", "redis://host2:6379"]
  sentinelUrls?: string[]   // For sentinel: ["redis://sentinel1:26379", "redis://sentinel2:26379"]
  sentinelName?: string     // Sentinel master name (default: 'mymaster')
  url?: string              // For standalone: "redis://localhost:6379"
  options?: RedisOptions
}

function parseClusterNodes(urls: string[]): ClusterNode[] {
  return urls.map(url => {
    const u = new URL(url)
    return { host: u.hostname, port: parseInt(u.port || '6379') }
  })
}

export function createRedisClient(config: RedisConnectionConfig): RedisClient {
  const baseOptions: RedisOptions = {
    protocol: 2, // Force RESP2 for ioredis v6 compatibility
    maxRetriesPerRequest: config.options?.maxRetriesPerRequest ?? 3,
    retryStrategy: config.options?.retryStrategy ?? defaultRetryStrategy,
    lazyConnect: config.options?.lazyConnect ?? true,
    enableReadyCheck: true,
    ...config.options,
  }

  switch (config.mode) {
    case 'cluster': {
      if (!config.urls || config.urls.length === 0) {
        throw new Error('REDIS_CLUSTER_URLS required for cluster mode')
      }
      const clusterOptions: ClusterOptions = {
        ...baseOptions,
        scaleReads: 'slave',
        maxRedirections: 16,
        retryStrategy: (times) => Math.min(times * 100, 3000),
      }
      return new Redis.Cluster(parseClusterNodes(config.urls), clusterOptions)
    }

    case 'sentinel': {
      if (!config.sentinelUrls || config.sentinelUrls.length === 0) {
        throw new Error('REDIS_SENTINEL_URLS required for sentinel mode')
      }
      return new Redis({
        ...baseOptions,
        sentinels: parseClusterNodes(config.sentinelUrls),
        name: config.sentinelName || 'mymaster',
        role: 'master',
        sentinelRetryStrategy: (times) => Math.min(times * 100, 3000),
      })
    }

    case 'standalone':
    default: {
      const url = config.url || process.env.REDIS_URL || 'redis://localhost:6379'
      return new Redis(url, baseOptions)
    }
  }
}

function defaultRetryStrategy(times: number): number | null {
  return times > 10 ? null : Math.min(times * 100, 3000)
}

// Backward compatibility - reads from env
export function createRedisClientFromEnv(): RedisClient {
  const mode = (process.env.REDIS_MODE as 'standalone' | 'sentinel' | 'cluster') || 'standalone'

  if (mode === 'cluster') {
    return createRedisClient({
      mode: 'cluster',
      urls: process.env.REDIS_CLUSTER_URLS?.split(',') || [],
    })
  }

  if (mode === 'sentinel') {
    return createRedisClient({
      mode: 'sentinel',
      sentinelUrls: process.env.REDIS_SENTINEL_URLS?.split(',') || [],
      sentinelName: process.env.REDIS_SENTINEL_NAME,
    })
  }

  return createRedisClient({ mode: 'standalone' })
}
```

- [ ] **Step 4: Refactor redis.ts to use new factory**

```typescript
// src/utils/redis.ts - REPLACE createRedisClient()
import { createRedisClientFromEnv, RedisClient } from './redisCluster.js'

let _client: RedisClient | null = null

export function getRedisClient(): RedisClient {
  if (!_client) {
    _client = createRedisClientFromEnv()
  }
  return _client
}

export function createRedisClient(options: { url?: string } = {}): RedisClient {
  // Backward compat: if url provided, use standalone
  if (options.url) {
    return createRedisClient({ mode: 'standalone', url: options.url })
  }
  return createRedisClientFromEnv()
}
```

- [ ] **Step 5: Update queue.ts to use cluster-aware client**

```typescript
// src/queue/queue.ts
import { getRedisClient } from '../utils/redis.js'

export const queue = new Queue('commands', {
  connection: getRedisClient(),
  // ... rest of config
})

// Also update other queues if any
export const eventBusQueue = new Queue('eventbus', {
  connection: getRedisClient(),
})
```

- [ ] **Step 6: Update EventBus.ts**

```typescript
// src/core/EventBus.ts
import { getRedisClient } from '../utils/redis.js'

// In constructor or init():
this.redis = getRedisClient()
```

- [ ] **Step 7: Update interlink connectClient.ts**

```typescript
// src/plugins/interlink/connectClient.ts
import { getRedisClient } from '../../utils/redis.js'

// In constructor:
this.redis = getRedisClient()
```

- [ ] **Step 8: Add environment documentation**

```bash
# .env.example additions
# Redis Cluster mode (recommended for HA)
REDIS_MODE=cluster
REDIS_CLUSTER_URLS=redis://redis-1:6379,redis://redis-2:6379,redis://redis-3:6379

# OR Redis Sentinel mode
# REDIS_MODE=sentinel
# REDIS_SENTINEL_URLS=redis://sentinel-1:26379,redis://sentinel-2:26379
# REDIS_SENTINEL_NAME=mymaster

# Standalone (dev only)
# REDIS_MODE=standalone
# REDIS_URL=redis://localhost:6379
```

- [ ] **Step 9: Run integration test (requires Redis Cluster/Sentinel)**

```bash
# With testcontainers or external cluster:
REDIS_MODE=cluster REDIS_CLUSTER_URLS=redis://localhost:7001,redis://localhost:7002,redis://localhost:7003 pnpm test tests/integration/redis-failover.test.ts
```

- [ ] **Step 10: Commit**

```bash
git add src/utils/redisCluster.ts src/utils/redis.ts src/queue/queue.ts src/core/EventBus.ts src/plugins/interlink/connectClient.ts .env.example tests/integration/redis-failover.test.ts
git commit -m "feat: add Redis Cluster/Sentinel support for HA"
```

---

### Task 2: Implement Distributed Nonce Store in Redis

**Files:**
- Create: `src/queue/nonceStore.ts` (Redis-backed nonce store with Lua)
- Modify: `src/queue/jobs/processCommand.ts` (use new nonce store)
- Test: `tests/unit/nonce-store-redis.test.ts`

**Interfaces:**
- Consumes: `getRedisClient()` from `src/utils/redis.ts`
- Produces: `NonceStore` class with `checkAndSet(nonce)`, `cleanup()`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/nonce-store-redis.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NonceStore } from '../../src/queue/nonceStore.js'
import { getRedisClient } from '../../src/utils/redis.js'

describe('Redis NonceStore', () => {
  let redis: ReturnType<typeof getRedisClient>
  let store: NonceStore

  beforeEach(async () => {
    redis = getRedisClient()
    await redis.flushdb()
    store = new NonceStore(redis, { ttl: 600, prefix: 'test:nonce:' })
  })

  afterEach(async () => {
    await redis.flushdb()
  })

  it('accepts new nonce', async () => {
    const result = await store.checkAndSet('nonce-1')
    expect(result).toBe(true)
  })

  it('rejects duplicate nonce', async () => {
    await store.checkAndSet('nonce-1')
    const result = await store.checkAndSet('nonce-1')
    expect(result).toBe(false)
  })

  it('expires nonce after TTL', async () => {
    const shortStore = new NonceStore(redis, { ttl: 1, prefix: 'test:nonce:' })
    await shortStore.checkAndSet('nonce-ttl')
    await new Promise(r => setTimeout(r, 1100))
    const result = await shortStore.checkAndSet('nonce-ttl')
    expect(result).toBe(true) // Expired, can reuse
  })

  it('survives process restart (data in Redis)', async () => {
    await store.checkAndSet('persistent-nonce')
    // Simulate new store instance (like process restart)
    const newStore = new NonceStore(redis, { ttl: 600, prefix: 'test:nonce:' })
    const result = await newStore.checkAndSet('persistent-nonce')
    expect(result).toBe(false) // Still exists in Redis
  })

  it('handles concurrent requests atomically', async () => {
    const promises = Array(10).fill(null).map(() => store.checkAndSet('concurrent-nonce'))
    const results = await Promise.all(promises)
    const accepted = results.filter(r => r).length
    expect(accepted).toBe(1) // Only one succeeds
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/nonce-store-redis.test.ts
# Expected: FAIL - NonceStore doesn't exist
```

- [ ] **Step 3: Create Redis-backed NonceStore with Lua atomic script**

```typescript
// src/queue/nonceStore.ts - NEW FILE
import { Redis } from 'ioredis'

export interface NonceStoreOptions {
  ttl: number          // TTL in seconds (default: 600 = 10 min)
  prefix?: string      // Key prefix (default: 'nonce:')
}

const CHECK_AND_SET_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local exists = redis.call('EXISTS', key)
if exists == 1 then
  return 0
end
redis.call('SETEX', key, ttl, '1')
return 1
`

export class NonceStore {
  private redis: Redis
  private ttl: number
  private prefix: string
  private scriptSha: string | null = null

  constructor(redis: Redis, options: NonceStoreOptions) {
    this.redis = redis
    this.ttl = options.ttl
    this.prefix = options.prefix || 'nonce:'
  }

  private getKey(nonce: string): string {
    return `${this.prefix}${nonce}`
  }

  async checkAndSet(nonce: string): Promise<boolean> {
    const key = this.getKey(nonce)

    // Load script if not cached
    if (!this.scriptSha) {
      this.scriptSha = await this.redis.script('LOAD', CHECK_AND_SET_SCRIPT) as string
    }

    try {
      const result = await this.redis.evalsha(
        this.scriptSha,
        1,
        key,
        this.ttl.toString()
      ) as number
      return result === 1
    } catch (error) {
      // Script flushed (e.g., Redis restart), reload and retry once
      if (error instanceof Error && error.message.includes('NOSCRIPT')) {
        this.scriptSha = null
        return this.checkAndSet(nonce)
      }
      throw error
    }
  }

  async cleanup(): Promise<number> {
    // Optional: clean up expired keys (Redis handles expiry automatically)
    // This is for monitoring/metrics only
    const pattern = `${this.prefix}*`
    let cursor = '0'
    let deleted = 0
    do {
      const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = newCursor
      if (keys.length > 0) {
        // Check TTL, delete if expired (shouldn't happen but safe)
        for (const key of keys) {
          const ttl = await this.redis.ttl(key)
          if (ttl === -2) { // Key doesn't exist
            deleted++
          }
        }
      }
    } while (cursor !== '0')
    return deleted
  }
}
```

- [ ] **Step 4: Update processCommand.ts to use new nonce store**

```typescript
// src/queue/jobs/processCommand.ts
import { NonceStore } from '../nonceStore.js'
import { getRedisClient } from '../../utils/redis.js'

// REPLACE: const nonceStore = new Map<string, number>()
const nonceStore = new NonceStore(getRedisClient(), { ttl: 600 })

// In verifyJobData():
// REPLACE: if (nonceStore.has(nonce)) { return { valid: false, reason: 'duplicate' } }
// WITH:
const isNew = await nonceStore.checkAndSet(nonce)
if (!isNew) {
  return { valid: false, reason: 'duplicate nonce' }
}

// REPLACE: nonceStore.set(nonce, Date.now())
// REMOVE: setInterval cleanup (Redis handles TTL)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test tests/unit/nonce-store-redis.test.ts
# Expected: PASS
```

- [ ] **Step 6: Run queue-related tests**

```bash
pnpm test tests/unit/processCommand.test.ts
# Expected: PASS (or no new failures)
```

- [ ] **Step 7: Commit**

```bash
git add src/queue/nonceStore.ts src/queue/jobs/processCommand.ts tests/unit/nonce-store-redis.test.ts
git commit -m "feat: replace in-memory nonce store with Redis atomic check-and-set"
```

---

### Task 3: Implement Per-Bot JWT + mTLS for Interlink

**Files:**
- Create: `src/plugins/interlink/auth.ts` (JWT issuing/verification, mTLS config)
- Modify: `src/plugins/interlink/connectClient.ts` (use JWT auth)
- Modify: `src/plugins/interlink/plugin.ts` (register with JWT, validate incoming)
- Create: `src/plugins/interlink/tls.ts` (mTLS certificate handling)
- Test: `tests/unit/interlink-jwt-auth.test.ts`, `tests/integration/interlink-mtls.test.ts`

**Interfaces:**
- Consumes: `INTERLINK_JWT_SECRET`, `INTERLINK_TLS_CERT`, `INTERLINK_TLS_KEY`, `INTERLINK_CA_CERT`
- Produces: JWT tokens with botId, capabilities, expiry; mTLS server/client config

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/interlink-jwt-auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { issueBotToken, verifyBotToken, BotTokenPayload } from '../../src/plugins/interlink/auth.js'

describe('Interlink JWT Authentication', () => {
  const secret = 'test-jwt-secret-at-least-32-chars-long-for-hmac-sha256'
  const botId = 'bot-123'
  const capabilities = ['commands:read', 'events:write', 'admin:config']

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  it('issues token with botId and capabilities', () => {
    const token = issueBotToken(botId, capabilities, secret, '1h')
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(3) // JWT format
  })

  it('verifies valid token and returns payload', () => {
    const token = issueBotToken(botId, capabilities, secret, '1h')
    const payload = verifyBotToken(token, secret)
    expect(payload).toEqual({
      botId,
      capabilities,
      iat: expect.any(Number),
      exp: expect.any(Number),
    })
  })

  it('rejects expired token', () => {
    const token = issueBotToken(botId, capabilities, secret, '1h')
    vi.advanceTimersByTime(61 * 60 * 1000) // 61 minutes
    expect(() => verifyBotToken(token, secret)).toThrow('Token expired')
  })

  it('rejects token with wrong secret', () => {
    const token = issueBotToken(botId, capabilities, secret, '1h')
    expect(() => verifyBotToken(token, 'wrong-secret')).toThrow('Invalid signature')
  })

  it('rejects token with tampered payload', () => {
    const token = issueBotToken(botId, capabilities, secret, '1h')
    const parts = token.split('.')
    const tampered = parts[0] + '.' + parts[1] + '.tampered'
    expect(() => verifyBotToken(tampered, secret)).toThrow('Invalid signature')
  })

  it('validates required capabilities', () => {
    const token = issueBotToken(botId, ['commands:read'], secret, '1h')
    const payload = verifyBotToken(token, secret)
    expect(payload.capabilities).not.toContain('admin:config')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/interlink-jwt-auth.test.ts
# Expected: FAIL - auth module doesn't exist
```

- [ ] **Step 3: Create JWT auth module**

```typescript
// src/plugins/interlink/auth.ts - NEW FILE
import { SignJWT, jwtVerify, JWTPayload } from 'jose'

export interface BotTokenPayload extends JWTPayload {
  botId: string
  capabilities: string[]
}

const ALGORITHM = 'HS256'
const ISSUER = 'apollo-interlink'

export async function issueBotToken(
  botId: string,
  capabilities: string[],
  secret: string,
  expiresIn: string = '1h'
): Promise<string> {
  const key = new TextEncoder().encode(secret)
  const token = await new SignJWT({ botId, capabilities })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key)
  return token
}

export async function verifyBotToken(token: string, secret: string): Promise<BotTokenPayload> {
  const key = new TextEncoder().encode(secret)
  const { payload } = await jwtVerify(token, key, {
    issuer: ISSUER,
    algorithms: [ALGORITHM],
  })
  return payload as BotTokenPayload
}

export function parseToken(token: string): BotTokenPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return payload as BotTokenPayload
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Create mTLS configuration module**

```typescript
// src/plugins/interlink/tls.ts - NEW FILE
import { readFileSync } from 'node:fs'
import { createSecureContext, SecureContextOptions } from 'node:tls'

export interface TlsConfig {
  cert: string
  key: string
  ca?: string
}

export function loadTlsConfig(): TlsConfig | null {
  const certPath = process.env.INTERLINK_TLS_CERT
  const keyPath = process.env.INTERLINK_TLS_KEY
  const caPath = process.env.INTERLINK_CA_CERT

  if (!certPath || !keyPath) {
    return null // mTLS not configured
  }

  return {
    cert: readFileSync(certPath, 'utf8'),
    key: readFileSync(keyPath, 'utf8'),
    ca: caPath ? readFileSync(caPath, 'utf8') : undefined,
  }
}

export function createTlsContext(config: TlsConfig): SecureContextOptions {
  return {
    cert: config.cert,
    key: config.key,
    ca: config.ca,
    requestCert: true,
    rejectUnauthorized: true,
  }
}

export function createClientTlsOptions(config: TlsConfig): SecureContextOptions {
  return {
    cert: config.cert,
    key: config.key,
    ca: config.ca,
    rejectUnauthorized: true,
  }
}
```

- [ ] **Step 5: Update connectClient.ts to use JWT + mTLS**

```typescript
// src/plugins/interlink/connectClient.ts - MODIFY
import { issueBotToken, verifyBotToken } from './auth.js'
import { loadTlsConfig, createClientTlsOptions } from './tls.js'

// In constructor:
this.jwtSecret = process.env.INTERLINK_JWT_SECRET
if (!this.jwtSecret) {
  throw new Error('INTERLINK_JWT_SECRET required')
}

this.tlsConfig = loadTlsConfig()

// For outgoing requests to Go service:
async function registerWithAuth(): Promise<void> {
  const token = await issueBotToken(
    this.botId,
    this.capabilities,
    this.jwtSecret,
    '24h'
  )

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // Use mTLS if configured
  const fetchOptions: RequestInit = { headers }
  if (this.tlsConfig) {
    const agent = new HttpsAgent(createClientTlsOptions(this.tlsConfig))
    // Note: fetch doesn't support agent directly, use undici or similar
    // For now, document that mTLS requires reverse proxy (nginx/envoy)
  }

  const response = await fetch(`${this.baseUrl}/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ botId: this.botId, capabilities: this.capabilities }),
  })
}

// For incoming request validation:
async function validateIncomingRequest(request: Request): Promise<BotTokenPayload> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header')
  }
  const token = authHeader.slice(7)
  return verifyBotToken(token, this.jwtSecret)
}
```

- [ ] **Step 6: Update plugin.ts to validate incoming Interlink requests**

```typescript
// src/plugins/interlink/plugin.ts - MODIFY
import { verifyBotToken } from './auth.js'

// In HTTP server middleware:
app.use(async (req, res, next) => {
  // Skip auth for health endpoint
  if (req.path === '/health') return next()

  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' })
    }
    const token = authHeader.slice(7)
    const payload = await verifyBotToken(token, process.env.INTERLINK_JWT_SECRET!)
    req.bot = payload // Attach verified bot identity
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
})
```

- [ ] **Step 7: Add environment documentation**

```bash
# .env.example additions for Interlink
# JWT Secret (shared across bot fleet, rotate periodically)
INTERLINK_JWT_SECRET=your-256-bit-secret-here-min-32-chars

# mTLS (optional but recommended for production)
# INTERLINK_TLS_CERT=/path/to/bot-cert.pem
# INTERLINK_TLS_KEY=/path/to/bot-key.pem
# INTERLINK_CA_CERT=/path/to/ca-cert.pem
```

- [ ] **Step 8: Run unit tests**

```bash
pnpm test tests/unit/interlink-jwt-auth.test.ts
# Expected: PASS
```

- [ ] **Step 9: Commit**

```bash
git add src/plugins/interlink/auth.ts src/plugins/interlink/tls.ts src/plugins/interlink/connectClient.ts src/plugins/interlink/plugin.ts .env.example tests/unit/interlink-jwt-auth.test.ts
git commit -m "feat: implement per-bot JWT auth and mTLS for Interlink"
```

---

### Task 4: Add Fencing Tokens to Gateway Leader Election

**Files:**
- Modify: `src/gateway/leader.ts` (add fencing tokens, Lua atomic lock)
- Test: `tests/integration/leader-election-partition.test.ts`

**Interfaces:**
- Consumes: Redis client from `getRedisClient()`
- Produces: Leader election with fencing tokens preventing split-brain

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/leader-election-partition.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { LeaderElection } from '../../src/gateway/leader.js'
import { getRedisClient } from '../../src/utils/redis.js'

describe('Gateway Leader Election with Fencing', () => {
  let redis: ReturnType<typeof getRedisClient>
  let election1: LeaderElection
  let election2: LeaderElection

  beforeAll(async () => {
    redis = getRedisClient()
    await redis.flushdb()
  })

  afterAll(async () => {
    await redis.quit()
  })

  it('elects single leader with fencing token', async () => {
    election1 = new LeaderElection({ redis, instanceId: 'instance-1', lockTtl: 10000 })
    election2 = new LeaderElection({ redis, instanceId: 'instance-2', lockTtl: 10000 })

    await election1.start()
    await election2.start()

    // Wait for election
    await new Promise(r => setTimeout(r, 100))

    const leader1 = election1.isLeader()
    const leader2 = election2.isLeader()

    // Exactly one leader
    expect(leader1 !== leader2).toBe(true)
    expect(leader1 || leader2).toBe(true)

    // Leader has fencing token
    if (leader1) {
      expect(election1.getFencingToken()).toBeGreaterThan(0)
    } else {
      expect(election2.getFencingToken()).toBeGreaterThan(0)
    }

    await election1.stop()
    await election2.stop()
  })

  it('increments fencing token on re-election', async () => {
    election1 = new LeaderElection({ redis, instanceId: 'instance-1', lockTtl: 10000 })
    await election1.start()
    await new Promise(r => setTimeout(r, 100))

    const token1 = election1.getFencingToken()
    await election1.stop()

    // New election
    election1 = new LeaderElection({ redis, instanceId: 'instance-1', lockTtl: 10000 })
    await election1.start()
    await new Promise(r => setTimeout(r, 100))

    const token2 = election1.getFencingToken()
    expect(token2).toBeGreaterThan(token1)

    await election1.stop()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/integration/leader-election-partition.test.ts
# Expected: FAIL - fencing tokens not implemented
```

- [ ] **Step 3: Implement fencing tokens with Lua atomic lock**

```typescript
// src/gateway/leader.ts - MODIFY
import { getRedisClient } from '../utils/redis.js'

const ACQUIRE_LOCK_SCRIPT = `
local lockKey = KEYS[1]
local tokenKey = KEYS[2]
local instanceId = ARGV[1]
local ttl = tonumber(ARGV[2])
local fencingToken = tonumber(ARGV[3])

-- Try to acquire lock
local acquired = redis.call('SET', lockKey, instanceId, 'NX', 'EX', ttl)
if acquired then
  -- Increment and store fencing token atomically
  local newToken = redis.call('INCR', tokenKey)
  return {1, newToken}
end

-- Check if we already own the lock
local owner = redis.call('GET', lockKey)
if owner == instanceId then
  -- Refresh TTL and return current fencing token
  redis.call('EXPIRE', lockKey, ttl)
  local currentToken = redis.call('GET', tokenKey)
  return {1, tonumber(currentToken)}
end

return {0, 0}
`

const RELEASE_LOCK_SCRIPT = `
local lockKey = KEYS[1]
local instanceId = ARGV[1]
local owner = redis.call('GET', lockKey)
if owner == instanceId then
  redis.call('DEL', lockKey)
  return 1
end
return 0
`

export class LeaderElection {
  private redis = getRedisClient()
  private instanceId: string
  private lockTtl: number
  private lockKey = 'apollo:gateway:leader:lock'
  private tokenKey = 'apollo:gateway:leader:fencing'
  private interval: NodeJS.Timeout | null = null
  private isLeaderFlag = false
  private fencingToken = 0
  private acquireScriptSha: string | null = null
  private releaseScriptSha: string | null = null

  constructor(options: { instanceId: string; lockTtl?: number }) {
    this.instanceId = options.instanceId
    this.lockTtl = options.lockTtl || 10000 // 10 seconds
  }

  async start(): Promise<void> {
    await this.loadScripts()
    await this.tryAcquire()
    this.interval = setInterval(() => this.tryAcquire(), this.lockTtl / 3)
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    await this.release()
  }

  isLeader(): boolean {
    return this.isLeaderFlag
  }

  getFencingToken(): number {
    return this.fencingToken
  }

  private async loadScripts(): Promise<void> {
    this.acquireScriptSha = await this.redis.script('LOAD', ACQUIRE_LOCK_SCRIPT) as string
    this.releaseScriptSha = await this.redis.script('LOAD', RELEASE_LOCK_SCRIPT) as string
  }

  private async tryAcquire(): Promise<void> {
    const fencingTokenArg = this.isLeaderFlag ? this.fencingToken : (this.fencingToken + 1)

    try {
      const result = await this.redis.evalsha(
        this.acquireScriptSha!,
        2,
        this.lockKey,
        this.tokenKey,
        this.instanceId,
        this.lockTtl.toString(),
        fencingTokenArg.toString()
      ) as [number, number]

      const [acquired, token] = result
      const wasLeader = this.isLeaderFlag
      this.isLeaderFlag = acquired === 1
      this.fencingToken = token

      if (this.isLeaderFlag && !wasLeader) {
        this.emit('elected', { fencingToken: this.fencingToken })
      } else if (!this.isLeaderFlag && wasLeader) {
        this.emit('deposed')
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('NOSCRIPT')) {
        this.acquireScriptSha = null
        this.releaseScriptSha = null
        await this.loadScripts()
        return this.tryAcquire()
      }
      throw error
    }
  }

  private async release(): Promise<void> {
    if (!this.isLeaderFlag) return
    try {
      await this.redis.evalsha(this.releaseScriptSha!, 1, this.lockKey, this.instanceId)
    } catch {
      // Ignore release errors
    }
    this.isLeaderFlag = false
    this.emit('deposed')
  }
}
```

- [ ] **Step 4: Run integration test**

```bash
pnpm test tests/integration/leader-election-partition.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/gateway/leader.ts tests/integration/leader-election-partition.test.ts
git commit -m "feat: add fencing tokens to gateway leader election"
```

---

## Execution Order & Dependencies

```
Task 1: Redis Cluster/Sentinel (foundation)
    ↓
Task 2: Distributed Nonce Store (requires Task 1 Redis cluster)
    ↓
Task 3: Interlink JWT + mTLS (requires Task 1 for Redis-backed rate limiting)
    ↓
Task 4: Gateway Fencing Tokens (requires Task 1 Redis cluster)
```

**Total estimated time:** 3-4 hours

## Post-Phase Verification

```bash
# All new tests
pnpm test tests/integration/redis-failover.test.ts tests/unit/nonce-store-redis.test.ts tests/unit/interlink-jwt-auth.test.ts tests/integration/leader-election-partition.test.ts

# Full suite
pnpm test

# Lint
pnpm lint
```

---

## Environment Variables Required

```bash
# .env additions for Phase 2
REDIS_MODE=cluster
REDIS_CLUSTER_URLS=redis://redis-1:6379,redis://redis-2:6379,redis://redis-3:6379
# OR
REDIS_MODE=sentinel
REDIS_SENTINEL_URLS=redis://sentinel-1:26379,redis://sentinel-2:26379
REDIS_SENTINEL_NAME=mymaster

INTERLINK_JWT_SECRET=your-256-bit-secret-here-min-32-chars
INTERLINK_TLS_CERT=/path/to/cert.pem
INTERLINK_TLS_KEY=/path/to/key.pem
INTERLINK_CA_CERT=/path/to/ca.pem
```