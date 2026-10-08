# Apollo-Discord-Bot Technical Debt Remediation - Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

## Overview

This master plan coordinates 5 phases addressing all Top 10 Priority Technical Debt Items and related architectural risks identified in the comprehensive assessment.

**Total Estimated Time:** 8-12 hours across all phases

## Phase Summary

| Phase | Focus | Key Items Addressed | Est. Time |
|-------|-------|---------------------|-----------|
| **Phase 1** | Quick Wins | Redis protocol, HMAC validation, EventBus unsubscribe, capability signing, tfjs-node removal, Node 22 pin | 1.5 hrs |
| **Phase 2** | Critical Security & Architecture | Redis Cluster/Sentinel, distributed nonce store, Interlink JWT+mTLS, leader fencing | 3-4 hrs |
| **Phase 3** | Code Quality & Testing | i18next v26, Discord mocks, PluginManager split | 2-3 hrs |
| **Phase 4** | Dependency Migration | tfjs-node audit, discord.js v15 audit/prep | 1 hr |
| **Phase 5** | Worker Sandbox & Hardening | Sigstore, cgroups, circuit breaker, HA integration tests | 3 hrs |

## Dependency Graph

```
Phase 1 (Independent)
    ↓
Phase 2 (Requires Phase 1 Redis protocol fix)
    ↓
Phase 3 (Independent, can parallelize with Phase 2)
    ↓
Phase 4 (Independent)
    ↓
Phase 5 (Requires Phase 2 Redis HA, Phase 1 capability signing)
```

## Execution Strategy

### Recommended: Subagent-Driven Development

For maximum quality and independent review:

1. **Execute phases sequentially** (1→2→3→4→5)
2. **Within each phase**, execute tasks sequentially (dependencies exist)
3. **Each task** gets fresh subagent + fresh reviewer
4. **Mid-phase checkpoints** after Tasks 1-2 of each phase

### Alternative: Native Execution

If subagent cost is prohibitive:

1. Execute all tasks in this session
2. Single comprehensive review at end
3. Use `pnpm test` + `pnpm lint` as verification gates

## Phase 1: Quick Wins (START HERE)

**File:** `docs/superpowers/plans/2026-09-27-phase1-quick-wins.md`

**Tasks:**
1. Fix ioredis RESP3 compatibility (`protocol: 2`)
2. Add `QUEUE_HMAC_SECRET` validation
3. Fix `EventBus.unsubscribe()` with subscription IDs
4. Add HMAC-signed capability grants for worker sandbox
5. Remove `@tensorflow/tfjs-node` if unused
6. Pin Node.js 22 LTS across project

**Prerequisites:** None

**Verification:**
```bash
pnpm test tests/unit/redis-protocol.test.ts tests/unit/startup-checks.test.ts tests/unit/eventbus-unsubscribe.test.ts tests/unit/worker-capability-signature.test.ts
pnpm test
pnpm lint
```

---

## Phase 2: Critical Security & Architecture

**File:** `docs/superpowers/plans/2026-09-27-phase2-critical-security-architecture.md`

**Tasks:**
1. Deploy Redis Sentinel/Cluster with multi-AZ support
2. Implement distributed nonce store in Redis (atomic Lua)
3. Implement per-bot JWT + mTLS for Interlink
4. Add fencing tokens to gateway leader election

**Prerequisites:** Phase 1 complete (Redis protocol fix)

**Environment Required:**
- Redis Cluster or Sentinel (3+ nodes)
- TLS certificates for mTLS (or use dev mode without)

**Verification:**
```bash
pnpm test tests/integration/redis-failover.test.ts tests/unit/nonce-store-redis.test.ts tests/unit/interlink-jwt-auth.test.ts tests/integration/leader-election-partition.test.ts
pnpm test
pnpm lint
```

---

## Phase 3: Code Quality & Testing

**File:** `docs/superpowers/plans/2026-09-27-phase3-code-quality-testing.md`

**Tasks:**
1. Fix i18next v26 compatibility in test setup
2. Fix Discord.js v14 mock shapes
3. Split PluginManager into 5 focused modules (Loader, Enabler, Disabler, Reloader, Installer)
4. Verify test failure reduction from 494

**Prerequisites:** None (can run parallel with Phase 2)

**Verification:**
```bash
pnpm test tests/unit/i18next-compat.test.ts tests/unit/discord-mock-shapes.test.ts tests/unit/plugin-*.test.ts
pnpm test  # Count failures - target <494
pnpm lint
```

---

## Phase 4: Dependency Migration

**File:** `docs/superpowers/plans/2026-09-27-phase4-dependency-migration.md`

**Tasks:**
1. Audit and remove `@tensorflow/tfjs-node` (if unused)
2. Verify Node.js 22 LTS pinning (from Phase 1)
3. Audit discord.js v14 usage for v15 migration prep
4. Create migration preparation branch and tracking

**Prerequisites:** None (can run parallel)

**Verification:**
```bash
pnpm list @tensorflow/tfjs-node || echo "REMOVED"
node --version | grep "v22"
cat docs/discordjs-v15-audit.md | head -50
pnpm test
pnpm lint
```

---

## Phase 5: Worker Sandbox & Hardening

**File:** `docs/superpowers/plans/2026-09-27-phase5-worker-sandbox-hardening.md`

**Tasks:**
1. Require Sigstore signatures for plugin installs
2. Add cgroup v2 resource limits for worker processes
3. Implement worker circuit breaker
4. Add HA integration tests with testcontainers
5. Verify Phase 1 capability signing integration

**Prerequisites:** Phase 1 (capability signing), Phase 2 (Redis HA)

**Environment Required:**
- Linux with cgroup v2 (for Task 2)
- Docker (for testcontainers in Task 4)
- Sigstore/cosign (for Task 1 production)

**Verification:**
```bash
pnpm test tests/unit/plugin-install-sigstore.test.ts tests/integration/worker-cgroup.test.ts tests/integration/worker-circuit-breaker.test.ts tests/integration/redis-failover.test.ts tests/integration/leader-election-failover.test.ts tests/integration/network-partition.test.ts tests/integration/interlink-ha.test.ts
pnpm test
pnpm lint
```

---

## Complete Verification Checklist

After all phases:

```bash
# 1. All tests pass (or pre-existing failures only)
pnpm test 2>&1 | grep -E "(Test Files|PASS|FAIL)"

# 2. Lint clean
pnpm lint

# 3. Build succeeds
pnpm build

# 4. No tfjs-node
pnpm list @tensorflow/tfjs-node || echo "✓ REMOVED"

# 5. Node 22 pinned
node --version | grep "v22" && echo "✓ NODE 22"

# 6. Redis protocol fixed
grep -r "protocol: 2" src/utils/redis.ts && echo "✓ RESP2"

# 7. EventBus unsubscribe works
pnpm test tests/unit/eventbus-unsubscribe.test.ts

# 8. Nonce store in Redis
pnpm test tests/unit/nonce-store-redis.test.ts

# 9. Interlink JWT auth
pnpm test tests/unit/interlink-jwt-auth.test.ts

# 10. PluginManager split
ls src/core/PluginLoader.ts src/core/PluginEnabler.ts src/core/PluginDisabler.ts src/core/PluginReloader.ts src/core/PluginInstaller.ts

# 11. Sigstore verification
pnpm test tests/unit/plugin-install-sigstore.test.ts

# 12. HA integration tests exist
ls tests/integration/*ha*.test.ts tests/integration/*failover*.test.ts tests/integration/*partition*.test.ts
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Phase 2 Redis HA requires infrastructure | Use testcontainers for dev/test; document production requirements |
| cgroup v2 not available in CI | Make Task 2 conditional; document as production hardening |
| discord.js v15 not stable | Phase 4 is prep only; actual migration separate |
| Test failures not fully resolved | Phase 3 targets reduction, not elimination; document remaining |
| Sigstore complexity | Start with `ALLOW_UNVERIFIED_PLUGINS=true` in dev; enforce in prod |

---

## Rollback Plan

Each phase commits independently. To rollback a phase:

```bash
# Find last commit of phase
git log --oneline -20

# Revert phase commits
git revert <commit-hash>...<commit-hash>
```

---

## Next Steps

1. **Review this master plan** - confirm phases and order
2. **Choose execution method** - subagent-driven or native
3. **Start Phase 1** - quick wins provide immediate value
4. **Schedule Phase 2** - requires Redis Cluster/Sentinel setup
5. **Parallelize Phase 3** - can run alongside Phase 2

---

**Files Created:**
- `docs/superpowers/plans/2026-09-27-phase1-quick-wins.md`
- `docs/superpowers/plans/2026-09-27-phase2-critical-security-architecture.md`
- `docs/superpowers/plans/2026-09-27-phase3-code-quality-testing.md`
- `docs/superpowers/plans/2026-09-27-phase4-dependency-migration.md`
- `docs/superpowers/plans/2026-09-27-phase5-worker-sandbox-hardening.md`
- `docs/superpowers/plans/2026-09-27-master-plan.md` (this file)