# Apollo Security Hardening Plan

**Source**: Oracle security assessment (2026-08-25)
**Priority**: Immediate (P0) — Production hardening

---

## Immediate Actions (This Week)

### 1. Enforce `APOLLO_SOCKET_TOKEN` + `SO_PEERCRED` Check
**Files**: `src/core/socket-server.js`, `src/utils/startupChecks.js`
**Effort**: ~1 hr

**Changes**:
- `startupChecks.js`: Add validation that `APOLLO_SOCKET_TOKEN` is set when `NODE_ENV=production`
- `socket-server.js`: Add `SO_PEERCRED` check on connection — require uid=0 or bot user
- Fail fast on missing token in prod; warn in dev

---

### 2. Require Redis Password/ACL
**Files**: `.env.example`, `src/queue/queue.js`, `src/utils/startupChecks.js`
**Effort**: ~30 min

**Changes**:
- `.env.example`: Add `REDIS_PASSWORD` and `REDIS_USERNAME` (for ACL) with comments
- `queue.js`: Pass password/username to ioredis connection options
- `startupChecks.js`: Validate Redis auth configured in production; test connection

---

### 3. Harden Interlink Bind Address
**Files**: `src/plugins/interlink/server.js`, `src/config/config.js`
**Effort**: ~1 hr

**Changes**:
- `config.js`: Default `INTERLINK_BIND_HOST=127.0.0.1`; validate not `0.0.0.0` in production
- `server.js`: Log warning if binding to non-localhost; error in prod if `0.0.0.0`
- Update `.env.example` with secure default

---

### 4. HMAC Signing for Queue Job Payloads
**Files**: `src/queue/jobs/processCommand.js`, `src/queue/queue.js`
**Effort**: ~2-4 hrs

**Changes**:
- Generate HMAC secret (new env: `QUEUE_HMAC_SECRET`) at deploy time
- `processCommand.js`: Sign job payload before `queue.add()`; include timestamp + nonce
- Worker: Validate HMAC + timestamp freshness (5 min window) + nonce deduplication
- Reject unsigned/stale/replay jobs with structured error

---

### 5. Fix Plugin TOCTOU — Verify Hash at Import Time
**Files**: `src/core/PluginManager.js`, `src/utils/manifest.js`
**Effort**: ~2 hrs

**Changes**:
- `manifest.js`: Export `verifyPluginFile(pluginPath, expectedHash)` — computes SHA-256 of actual file
- `PluginManager.js`: Call `verifyPluginFile()` immediately before `import()` in `loadPlugin()`
- Fail load if hash mismatch; log security event
- Keep manifest verification for supply chain integrity (both layers)

---

## Short-term (Next Sprint)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 6 | Interlink replay protection (timestamp + nonce per sender) | `src/plugins/interlink/routes.js`, `server.js` | ~2 hrs |
| 7 | Capability schema validation (reject unknown capabilities) | `src/core/worker/workerChild.js`, `workerHost.js` | ~1 hr |
| 8 | Key rotation procedure + key versioning in encrypted payloads | `src/utils/encryption.js`, `src/db/adapter.js` | ~4 hrs |
| 9 | CI: semgrep rules for dangerous patterns | `.github/workflows/ci.yml`, `.semgrep.yml` | ~1 hr |

---

## Verification Checklist

After implementing 1-5, verify:

```bash
# 1. Socket token required in prod
NODE_ENV=production node -e "require('./src/utils/startupChecks.js').validate()"  # Should fail without token

# 2. Redis auth works
redis-cli -a "$REDIS_PASSWORD" PING  # Should return PONG

# 3. Interlink binds localhost
grep INTERLINK_BIND_HOST .env  # Should be 127.0.0.1 or unset

# 4. Queue jobs have HMAC
# Inspect Redis queue: LRANGE bull:commands:wait 0 -1 | jq '.[].data.hmac'

# 5. Plugin hash verified at load
# Enable debug logging, load plugin, verify "Verified plugin file hash" log
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interlink API key theft → fleet compromise | Medium | Critical | HMAC + replay protection (tasks 4, 6) |
| Redis exposure → queue injection | High | Critical | Auth + HMAC signing (tasks 2, 4) |
| Local privilege escalation via socket | Medium | High | Token + SO_PEERCRED (task 1) |
| Plugin supply chain attack | Low | Critical | Double verification (task 5) |
| Encryption key compromise → all data | Low | Critical | Key rotation + versioning (task 8) |

---

## Rollback Plan

Each task is independently revertible:
- Config changes: revert `.env` and restart
- Code changes: `git revert <commit>`; no DB migrations
- Queue HMAC: deploy with `QUEUE_HMAC_SECRET` unset → worker accepts unsigned (backward compat), then enable

---

## Ownership

| Task | Owner | Target Date |
|------|-------|-------------|
| 1-3 | Platform/Infra | Week 1 |
| 4 | Backend (Queue) | Week 1-2 |
| 5 | Backend (Plugins) | Week 1 |
| 6-9 | Backend | Sprint 2 |