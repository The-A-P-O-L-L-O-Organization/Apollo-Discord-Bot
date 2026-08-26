# Session Prompt: Apollo Security Hardening Implementation

## Context

You are implementing the **immediate security hardening tasks (1-5)** from the plan at `.slim/SECURITY_HARDENING_PLAN.md`.

**Background**: Oracle assessment identified critical production exposures:
- Unix socket admin RPC: no required token, no peer credential check
- Redis: no auth by default — full queue control if exposed
- Interlink HTTP: binds `0.0.0.0` if `INTERLINK_BIND_HOST` set
- Queue jobs: no integrity verification — forgeable
- Plugin loader: TOCTOU between manifest verification and `import()`

---

## Task List (Execute in Order)

### Task 1: Enforce `APOLLO_SOCKET_TOKEN` + `SO_PEERCRED` (~1 hr)
**Files**: `src/core/socket-server.js`, `src/utils/startupChecks.js`

- `startupChecks.js`: Add `validateSocketToken()` — throw if `NODE_ENV=production` and `!process.env.APOLLO_SOCKET_TOKEN`
- `socket-server.js`: In connection handler, use `socket.getPeerCredential()` (Node 20+) to verify `uid === 0 || uid === process.getuid()`
- Fail fast with clear error messages

### Task 2: Require Redis Password/ACL (~30 min)
**Files**: `.env.example`, `src/queue/queue.js`, `src/utils/startupChecks.js`

- `.env.example`: Add `REDIS_PASSWORD` and `REDIS_USERNAME` (commented, with secure defaults note)
- `queue.js`: Pass `password: config.redis.password`, `username: config.redis.username` to `new Redis()`
- `startupChecks.js`: Validate Redis connection works with auth in production

### Task 3: Harden Interlink Bind Address (~1 hr)
**Files**: `src/plugins/interlink/server.js`, `src/config/config.js`

- `config.js`: Default `interlink.bindHost = '127.0.0.1'`; validate: if `production` and `bindHost === '0.0.0.0'` → throw
- `server.js`: Use `config.interlink.bindHost`; log warning if not localhost
- Update `.env.example` with `INTERLINK_BIND_HOST=127.0.0.1`

### Task 4: HMAC Signing for Queue Jobs (~2-4 hrs)
**Files**: `src/queue/jobs/processCommand.js`, `src/queue/queue.js`

- New env: `QUEUE_HMAC_SECRET` (32+ bytes, generated at deploy)
- `processCommand.js` (producer side):
  - Create payload: `{ ...jobData, timestamp: Date.now(), nonce: crypto.randomBytes(16).toString('hex') }`
  - Compute HMAC-SHA256: `crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')`
  - Add `hmac` field to job data
- Worker side (in `processCommand.js` or new validator):
  - Verify HMAC matches
  - Reject if `Date.now() - timestamp > 5 * 60 * 1000` (5 min window)
  - Track nonces in Redis SET with TTL (deduplication)
- Backward compat: if `QUEUE_HMAC_SECRET` unset, accept unsigned (log warning)

### Task 5: Fix Plugin TOCTOU (~2 hrs)
**Files**: `src/core/PluginManager.js`, `src/utils/manifest.js`

- `manifest.js`: Add `verifyPluginFile(pluginPath, expectedHash)`:
  ```js
  const hash = crypto.createHash('sha256').update(await fs.readFile(pluginPath)).digest('hex')
  return hash === expectedHash
  ```
- `PluginManager.js` in `loadPlugin()`: Call `verifyPluginFile()` immediately before `import(pluginPath)`
- Throw `SecurityError` if mismatch; log security audit event

---

## Verification Commands (Run After Each Task)

```bash
# Task 1: Socket token enforcement
NODE_ENV=production APOLLO_SOCKET_TOKEN=test node -e "require('./src/utils/startupChecks.js').validate()"
# Should pass; without token should fail

# Task 2: Redis auth
redis-cli -a "$REDIS_PASSWORD" PING
# Should return PONG

# Task 3: Interlink bind
grep INTERLINK_BIND_HOST .env
# Should show 127.0.0.1 or be unset

# Task 4: Queue HMAC
# Check Redis: LRANGE bull:commands:wait 0 -1 | jq '.[].data.hmac'
# Should show HMAC strings

# Task 5: Plugin hash verification
# Enable debug, load plugin, check logs for "Verified plugin file hash"
```

---

## Constraints

- **ESM only** — use `import`/`export`, not `require`
- **4-space indent**, single quotes, semicolons, no trailing commas
- **No emojis** in source
- **No code comments** unless explicitly requested
- **pnpm only** — run tests with `pnpm test`, lint with `pnpm lint`

---

## Success Criteria

All 5 tasks implemented, verified via commands above, `pnpm lint` and `pnpm test` pass.

---

## Reference Files (Read First)

- `.slim/SECURITY_HARDENING_PLAN.md` — full plan with risk register
- `src/utils/startupChecks.js` — existing validation logic
- `src/core/socket-server.js` — Unix socket server
- `src/queue/queue.js` — BullMQ/Redis connection
- `src/plugins/interlink/server.js` — Interlink HTTP server
- `src/config/config.js` — Config schema
- `src/queue/jobs/processCommand.js` — Job producer + worker
- `src/core/PluginManager.js` — Plugin loading
- `src/utils/manifest.js` — Manifest verification

---

## Handoff Note

If you complete tasks 1-3 and need to pause, the remaining tasks (4-5) are independent and can be done in parallel. Task 4 (queue HMAC) is the most complex — consider spawning a separate `@fixer` for it.