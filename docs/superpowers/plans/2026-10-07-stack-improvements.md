# Stack Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all technical debt and improvement opportunities identified in the Oracle's stack assessment, organized into prioritized phases (P0/P1/P2) with clear deliverables.

**Architecture:** The plan is organized into 4 phases matching priority tiers. Each phase contains independent task groups that can be parallelized. Tasks produce working, testable increments. Cross-cutting concerns (documentation, CI, testing) are folded into their owning tasks.

**Tech Stack:** Node.js 26, TypeScript 7.0.2 (tsgo), oxlint+tsgolint, pnpm, discord.js v14, BullMQ, Knex, ConnectRPC, OpenTelemetry, Vitest, buf

**Spec:** Oracle assessment from session m0001 + AGENTS.md constraints

---

## Global Constraints

- All TypeScript: strict mode, ESM with `.js` suffix imports, no `any` in src/, await all promises
- pnpm only — never npm/yarn/bun
- Lint: oxlint + tsgolint (60/62 TS7 rules), biome for formatting
- Tests: Vitest, ~1831 tests must pass
- Protobuf: buf lint + breaking required
- i18n: 6 locales, `en-US` canonical, `pnpm lint:locales` must pass
- Security: no secrets in logs/commits, parameterized DB, HTTPS for external calls
- Documentation: update AGENTS.md, README.md, INSTALLATION.md, CONTRIBUTING.md, SECURITY.md, codemaps when their subjects change
- No emojis in source, tests, docs, commits, PR text

---

## Review Focus

| Input/Condition | Expected Behavior |
|-----------------|-------------------|
| Node.js major upgrade (26→27) | `better-sqlite3` rebuilds cleanly in CI; no postinstall failures |
| `ALLOW_UNVERIFIED_PLUGINS=1` in CI | CI fails immediately |
| Gateway pod killed mid-scheduler | No double-run of any scheduler job (idempotent `withLock` proven) |
| Proto change in Go/Rust not reflected in TS | CI catches cross-runtime contract drift |
| ENCRYPTION_KEY rotation (old key removed) | All encrypted data re-encrypted; no decryption failures |

---

## Phase 0: Foundation Fixes (P0 — Do First)

### Task 0.1: Fix AGENTS.md Script Documentation Drift

**Files:**
- Modify: `AGENTS.md:37-45` (Entry Points and Run Modes section)
- Modify: `README.md` (verify all script references)
- Modify: `INSTALLATION.md` (verify all script references)

**Interfaces:**
- Consumes: package.json scripts
- Produces: Accurate documentation

- [ ] **Step 1: Audit all script references in AGENTS.md, README.md, INSTALLATION.md**
```bash
grep -rn "pnpm start\|pnpm dev\|tsx src/index\|dist/index" AGENTS.md README.md INSTALLATION.md
```
Expected: Find all instances that claim `pnpm start` runs `tsx src/index.ts`

- [ ] **Step 2: Verify actual package.json scripts**
```bash
cat package.json | jq '.scripts'
```
Expected: `start` = `node dist/index.js`, `dev` = `tsx watch src/index.ts`

- [ ] **Step 3: Update AGENTS.md Entry Points section**
```markdown
- `pnpm start`: production entry, runs `node dist/index.js` (built via `pnpm build`)
- `pnpm dev`: watch-mode development with `tsx watch src/index.ts`
```

- [ ] **Step 4: Update README.md and INSTALLATION.md script references similarly**

- [ ] **Step 5: Run doc lint/markdown checks**
```bash
pnpm lint:locales  # if any locale references changed
# No markdown linter configured; manual review
```

- [ ] **Step 6: Commit**
```bash
git add AGENTS.md README.md INSTALLATION.md
git commit -m "docs: fix script documentation drift (start runs dist, not tsx)"
```

---

### Task 0.2: Zero or Baseline Typecheck Gate

**Files:**
- Modify: `tsconfig.json` (if baselining)
- Create: `tsc-baseline.json` (if baselining)
- Test: Run `pnpm typecheck`

**Interfaces:**
- Consumes: Current TypeScript config and source
- Produces: Clean typecheck or approved baseline

- [ ] **Step 1: Run typecheck to see current errors**
```bash
pnpm typecheck
```
Expected: List of pre-existing errors (per memory)

- [ ] **Step 2: Categorize errors — fixable vs. third-party/type-definition issues**
```bash
pnpm typecheck 2>&1 | head -100
```
Expected: Error categories (e.g., `node_modules` types, generated code, actual source issues)

- [ ] **Step 3: Fix all fixable errors in src/ (not node_modules, not generated)**
```bash
# For each fixable error, edit the source file
# Use oxlint --fix where applicable
pnpm lint --fix
```

- [ ] **Step 4: For unfixable (third-party types), add `@ts-expect-error` with comment or create baseline**
```bash
# Option A: Baseline (preferred for large existing codebase)
pnpm typecheck 2>&1 | tee tsc-baseline.txt
# Create tsc-baseline.json with current errors
# Configure tsc --build to use baseline
```

- [ ] **Step 5: Verify typecheck passes (or passes with baseline)**
```bash
pnpm typecheck
```
Expected: Exit code 0

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "chore: zero typecheck errors (or add baseline)"
```

---

### Task 0.3: Consolidate Worker Entry Point

**Files:**
- Modify: `src/index.ts` (ensure RUN_MODE=worker handles everything)
- Delete/Modify: `src/worker.ts` (reduce to 3-line alias or delete)
- Modify: `package.json` (verify scripts)
- Modify: `Dockerfile` / `docker-compose.yml` (if they reference src/worker.ts)

**Interfaces:**
- Consumes: `src/queue/worker.ts`, `src/gateway/leader.ts`
- Produces: Single worker entry path

- [ ] **Step 1: Compare src/index.ts RUN_MODE=worker vs src/worker.ts**
```bash
diff -u <(grep -A 50 "RUN_MODE.*worker" src/index.ts) src/worker.ts
```
Expected: Identify any behavioral differences

- [ ] **Step 2: Ensure src/index.ts RUN_MODE=worker imports and starts the queue worker**
```typescript
// In src/index.ts, verify this exists:
if (process.env.RUN_MODE === 'worker') {
  const { startWorker } = await import('./queue/worker.js');
  await startWorker();
  return;
}
```

- [ ] **Step 3: Replace src/worker.ts with minimal re-export or delete**
```typescript
// src/worker.ts - option A: 3-line alias
import { startWorker } from './queue/worker.js';
await startWorker();
// option B: delete file, update any Dockerfile references
```

- [ ] **Step 4: Update Dockerfile/docker-compose.yml if they use src/worker.ts**
```bash
grep -r "worker.ts" Dockerfile* docker-compose*.yml
```

- [ ] **Step 5: Test both entry paths work**
```bash
# Test RUN_MODE=worker
RUN_MODE=worker pnpm start &
sleep 3
kill %1
# Test direct worker.ts if kept
```

- [ ] **Step 6: Run queue/worker tests**
```bash
pnpm vitest run tests/queue/ tests/worker/
```

- [ ] **Step 7: Commit**
```bash
git add src/index.ts src/worker.ts package.json Dockerfile* docker-compose*.yml
git commit -m "refactor: consolidate worker entry to RUN_MODE=worker only"
```

---

### Task 0.4: Group OTel Dependencies with Renovate/Dependabot

**Files:**
- Create: `renovate.json` or `.github/dependabot.yml`
- Modify: `package.json` (verify OTel versions)

**Interfaces:**
- Consumes: Current OTel dependency tree
- Produces: Automated grouped PRs for OTel family

- [ ] **Step 1: List all @opentelemetry packages and versions**
```bash
pnpm list @opentelemetry --depth=0
```
Expected: 18 packages with mixed versions (^0.x, ^2.x, etc.)

- [ ] **Step 2: Create renovate.json with OTel grouping**
```json
{
  "packageRules": [
    {
      "groupName": "opentelemetry",
      "matchPackageNames": ["@opentelemetry/*"],
      "groupSlug": "opentelemetry",
      "automerge": true,
      "schedule": ["every weekend"]
    }
  ]
}
```

- [ ] **Step 3: OR create .github/dependabot.yml with grouping**
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      opentelemetry:
        patterns:
          - "@opentelemetry/*"
        update-types: ["minor", "patch"]
```

- [ ] **Step 4: Verify config syntax**
```bash
# For renovate
npx renovate-config-validator renovate.json
# For dependabot
# GitHub validates on push
```

- [ ] **Step 5: Commit**
```bash
git add renovate.json  # or .github/dependabot.yml
git commit -m "ci: add OTel dependency grouping for coordinated upgrades"
```

---

## Phase 1: Core Consolidation (P1 — This Quarter)

### Task 1.1: Unify RPC Stack on ConnectRPC (Retire grpc-js)

**Files:**
- Delete: `src/grpc/` or wherever gRPC client lives
- Modify: `src/nsfw/` or NSFW client to use ConnectRPC
- Modify: `protos/nsfw/` (if proto changes needed for Connect)
- Modify: `buf.yaml` / `buf.gen.yaml` (update generation)
- Modify: `package.json` (remove @grpc/grpc-js, @grpc/proto-loader)
- Modify: `services/nsfw/` (Rust service - may need proto updates)
- Test: All NSFW-related tests

**Interfaces:**
- Consumes: `protos/nsfw/*.proto`, ConnectRPC TS/Go/Rust codegen
- Produces: Single RPC stack (ConnectRPC) for both interlink and NSFW

- [ ] **Step 1: Inventory current gRPC usage**
```bash
grep -r "@grpc/grpc-js\|@grpc/proto-loader" src/ --include="*.ts"
grep -r "grpc" package.json
```
Expected: Locations using gRPC (likely NSFW client only)

- [ ] **Step 2: Verify ConnectRPC can serve the NSFW protobuf service**
```bash
# Check protos/nsfw/ service definitions
# ConnectRPC supports gRPC + gRPC-Web + Connect protocols
```

- [ ] **Step 3: Update buf.gen.yaml to generate ConnectRPC TS client for NSFW**
```yaml
# buf.gen.yaml - add connectrpc plugin for nsfw protos
plugins:
  - plugin: ts
    out: src/generated
    opt: connectrpc
```

- [ ] **Step 4: Regenerate protobuf code**
```bash
pnpm proto:lint
pnpm proto:breaking  # verify no breaking changes
buf generate
```

- [ ] **Step 5: Rewrite NSFW client to use ConnectRPC generated client**
```typescript
// Before: import { GrpcClient } from '@grpc/grpc-js'
// After: import { NsfwServiceClient } from '../generated/nsfw/connect.js'
```

- [ ] **Step 6: Remove gRPC dependencies**
```bash
pnpm remove @grpc/grpc-js @grpc/proto-loader
```

- [ ] **Step 7: Update Rust NSFW service if proto changed (coordinate with Go/TS)**
```bash
# Check services/nsfw/ for proto dependencies
# May need to regenerate Rust code from updated protos
```

- [ ] **Step 8: Run all NSFW tests**
```bash
pnpm vitest run tests/nsfw/
```

- [ ] **Step 9: Run full test suite**
```bash
pnpm test
```

- [ ] **Step 10: Commit**
```bash
git add -A
git commit -m "refactor: unify RPC on ConnectRPC, retire grpc-js"
```

---

### Task 1.2: SQLite Native Dependency Hardening

**Files:**
- Modify: `src/utils/db.ts` (Knex adapter)
- Modify: `knexfile.cjs` (if exists)
- Modify: `package.json` (pin Node major or add node:sqlite)
- Modify: `Dockerfile` / CI config (pin Node version)
- Test: Database tests on both SQLite and Postgres

**Interfaces:**
- Consumes: Knex, better-sqlite3 or node:sqlite
- Produces: Stable SQLite layer across Node majors

- [ ] **Step 1: Research Node 26 built-in sqlite stability**
```bash
node --experimental-sqlite -e "console.log('sqlite available')" 2>&1
```
Expected: Check if `node:sqlite` is stable (Node 26.x status)

- [ ] **Step 2: If node:sqlite stable, create adapter branch; else pin Node in CI**
```typescript
// Option A: node:sqlite adapter in src/utils/db.ts
// Option B: Pin Node major in .github/workflows/ci.yml and Dockerfile
```

- [ ] **Step 3: Implement chosen approach**
```typescript
// If Option A: Add conditional import for node:sqlite vs better-sqlite3
// If Option B: Update CI matrix to test single Node version, pin in Dockerfile
```

- [ ] **Step 4: Run migration tests on both SQLite and Postgres**
```bash
pnpm migrate  # SQLite
DB_TYPE=postgres DATABASE_URL=... pnpm migrate  # Postgres
pnpm vitest run tests/db/
```

- [ ] **Step 5: Test postinstall rebuild simulation**
```bash
# Simulate Node major upgrade
pnpm rebuild better-sqlite3
```

- [ ] **Step 6: Commit**
```bash
git add src/utils/db.ts package.json .github/workflows/ci.yml Dockerfile
git commit -m "chore: harden SQLite native dependency (node:sqlite or Node pin)"
```

---

### Task 1.3: ENCRYPTION_KEY Rotation Runbook + Test

**Files:**
- Create: `docs/runbooks/encryption-key-rotation.md`
- Create: `scripts/rotate-encryption-key.ts`
- Modify: `src/utils/encryption.ts` (if rotation logic missing)
- Test: Rotation test

**Interfaces:**
- Consumes: Current encryption implementation
- Produces: Documented, tested rotation procedure

- [ ] **Step 1: Audit current encryption implementation**
```bash
grep -r "ENCRYPTION_KEY" src/ --include="*.ts"
cat src/utils/encryption.ts
```
Expected: Understand key format (comma-separated), encryption library (jose?), data locations

- [ ] **Step 2: Write rotation runbook**
```markdown
# docs/runbooks/encryption-key-rotation.md
## Procedure
1. Generate new key: `openssl rand -base64 32`
2. Prepend to ENCRYPTION_KEY (comma-separated): `NEW_KEY,OLD_KEY`
3. Deploy config change
4. Run re-encryption script: `pnpm apollo encryption:reencrypt`
5. Verify all data decrypts
6. Remove old key from ENCRYPTION_KEY
7. Deploy final config
```

- [ ] **Step 3: Create re-encryption CLI command**
```typescript
// scripts/rotate-encryption-key.ts or bin/apollo.ts command
// Iterate all encrypted DB fields, decrypt with old key, encrypt with new
```

- [ ] **Step 4: Write integration test for rotation**
```typescript
// tests/encryption/rotation.test.ts
// - Encrypt data with key A
// - Rotate to key B (A,B)
// - Verify decrypt works
// - Rotate to key B only
// - Verify decrypt works
```

- [ ] **Step 5: Run test**
```bash
pnpm vitest run tests/encryption/rotation.test.ts
```

- [ ] **Step 6: Commit**
```bash
git add docs/runbooks/encryption-key-rotation.md scripts/rotate-encryption-key.ts tests/encryption/rotation.test.ts
git commit -m "feat: add ENCRYPTION_KEY rotation runbook and test"
```

---

### Task 1.4: discord.js v15 Migration Planning

**Files:**
- Read: `docs/discordjs-v15-audit.md`
- Create: `docs/plans/discordjs-v15-migration.md`
- Modify: `package.json` (when executing)

**Interfaces:**
- Consumes: Existing audit doc
- Produces: Migration plan with risk mitigation

- [ ] **Step 1: Read existing audit**
```bash
cat docs/discordjs-v15-audit.md
```

- [ ] **Step 2: Create detailed migration plan**
```markdown
# docs/plans/discordjs-v15-migration.md
## Breaking Changes Inventory
- [ ] List each breaking change from audit
- [ ] Map to affected files in src/
- [ ] Estimate effort per change

## Migration Strategy
- [ ] Canary: test in staging with single guild
- [ ] Feature flag: DISCORDJS_V15=1 to toggle
- [ ] Rollback plan

## Test Plan
- [ ] Run full test suite against v15
- [ ] Manual verification: commands, events, components, modals
```

- [ ] **Step 3: Commit plan (not execution)**
```bash
git add docs/plans/discordjs-v15-migration.md
git commit -m "docs: add discord.js v15 migration plan"
```

---

## Phase 2: Modernization (P2 — Next Quarter)

### Task 2.1: Replace Express with Lighter HTTP Layer

**Files:**
- Delete: Express-dependent files (health/webhook endpoints)
- Create: `src/http/` with Hono or `node:http` router
- Modify: `src/index.ts` (gateway HTTP server)
- Modify: `package.json` (remove express, helmet, add hono if chosen)
- Test: Health endpoint, webhook endpoints

**Interfaces:**
- Consumes: Current Express routes
- Produces: Minimal HTTP server for health/webhooks

- [ ] **Step 1: Inventory Express usage**
```bash
grep -r "express\|helmet" src/ --include="*.ts"
```
Expected: Likely only health check + webhook endpoints

- [ ] **Step 2: Choose replacement (Hono recommended — 15KB, fast, typed)**
```bash
pnpm add hono
```

- [ ] **Step 3: Implement Hono routes mirroring Express**
```typescript
// src/http/server.ts
import { Hono } from 'hono';
const app = new Hono();
app.get('/health', (c) => c.json({ status: 'ok' }));
app.post('/webhook/github', ...); // verify HMAC
export default app;
```

- [ ] **Step 4: Wire into gateway startup**
```typescript
// src/index.ts or src/gateway/leader.ts
import { createServer } from 'node:http';
import app from './http/server.js';
createServer(app.fetch).listen(PORT);
```

- [ ] **Step 5: Remove Express and helmet**
```bash
pnpm remove express helmet @types/express
```

- [ ] **Step 6: Test health and webhook endpoints**
```bash
pnpm vitest run tests/http/
curl http://localhost:3000/health
```

- [ ] **Step 7: Commit**
```bash
git add -A
git commit -m "refactor: replace Express with Hono for health/webhooks"
```

---

### Task 2.2: Add Bull Board Operations Dashboard

**Files:**
- Create: `src/admin/bullboard.ts`
- Modify: `src/admin/` routes (add behind owner auth)
- Modify: `package.json` (add @bull-board/api, @bull-board/express or hono adapter)
- Test: Dashboard loads, shows queues, owner-only access

**Interfaces:**
- Consumes: BullMQ queues, Redis connection
- Produces: Admin dashboard at `/admin/queues`

- [ ] **Step 1: Add Bull Board dependencies**
```bash
pnpm add @bull-board/api @bull-board/hono  # or express adapter
```

- [ ] **Step 2: Create dashboard route with owner auth**
```typescript
// src/admin/bullboard.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullmqAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { queues } from '../queue/queue.js';

const { router } = createBullBoard([
  queues.map(q => new BullMQAdapter(q)),
]);
router.setBasePath('/admin/queues');
```

- [ ] **Step 3: Protect with owner-only middleware**
```typescript
// Reuse existing owner check from admin plugin
```

- [ ] **Step 4: Mount in HTTP server**
```typescript
// src/http/server.ts
app.route('/admin', bullBoardRouter);
```

- [ ] **Step 5: Test dashboard loads and shows queues**
```bash
pnpm dev
# Visit /admin/queues as owner
```

- [ ] **Step 6: Commit**
```bash
git add src/admin/bullboard.ts src/http/server.ts package.json
git commit -m "feat: add Bull Board queue dashboard behind owner auth"
```

---

### Task 2.3: TypeScript Project References for Faster Builds

**Files:**
- Modify: `tsconfig.json` (enable composite, references)
- Create: `tsconfig.build.json`, `tsconfig.test.json`, `tsconfig.services.json`
- Modify: `package.json` (build script using `tsc --build`)
- Test: `pnpm build` speed comparison

**Interfaces:**
- Consumes: Current monolithic tsconfig
- Produces: Incremental builds via project references

- [ ] **Step 1: Analyze current build graph**
```bash
pnpm build -- --explainFiles 2>&1 | head -50
```

- [ ] **Step 2: Define project reference structure**
```json
// tsconfig.json (root)
{
  "compilerOptions": { "composite": true },
  "references": [
    { "path": "./tsconfig.core.json" },
    { "path": "./tsconfig.plugins.json" },
    { "path": "./tsconfig.queue.json" },
    { "path": "./tsconfig.generated.json" }
  ]
}
```

- [ ] **Step 3: Create sub-tsconfigs for each domain**
```json
// tsconfig.core.json - src/core, src/utils, src/config
// tsconfig.plugins.json - src/plugins/*
// tsconfig.queue.json - src/queue, src/gateway
// tsconfig.generated.json - src/generated (no emit, just types)
```

- [ ] **Step 4: Update build script**
```json
// package.json
"build": "tsc --build"
```

- [ ] **Step 5: Benchmark build time before/after**
```bash
time pnpm build  # before
time pnpm build  # after (should be incremental)
```

- [ ] **Step 6: Verify all tests still pass**
```bash
pnpm test
```

- [ ] **Step 7: Commit**
```bash
git add tsconfig*.json package.json
git commit -m "perf: add TypeScript project references for incremental builds"
```

---

### Task 2.4: Evaluate Argon2 for Credential Hashing

**Files:**
- Modify: `src/utils/encryption.ts` or auth utilities
- Modify: `package.json` (add @node-rs/argon2)
- Test: Hash/verify benchmarks, migration path for existing bcrypt hashes

**Interfaces:**
- Consumes: Current bcryptjs usage
- Produces: Argon2id implementation with migration strategy

- [ ] **Step 1: Locate all bcryptjs usage**
```bash
grep -r "bcrypt" src/ --include="*.ts"
```
Expected: Operator secret hashing, possibly plugin verification

- [ ] **Step 2: Add @node-rs/argon2**
```bash
pnpm add @node-rs/argon2
```

- [ ] **Step 3: Implement Argon2id wrapper with bcrypt compatibility**
```typescript
// src/utils/hash.ts
import { hash, verify } from '@node-rs/argon2';
import * as bcrypt from 'bcryptjs';

export async function hashSecret(secret: string): Promise<string> {
  return hash(secret, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  if (hash.startsWith('$argon2')) {
    return verify(hash, secret);
  }
  // Legacy bcrypt migration path
  return bcrypt.compare(secret, hash);
}
```

- [ ] **Step 4: Write migration test (bcrypt → argon2)**
```typescript
// tests/utils/hash.test.ts
// - Hash with bcrypt
// - Verify with new verifySecret (should use bcrypt path)
// - Re-hash with Argon2 on next successful verify
```

- [ ] **Step 5: Benchmark**
```bash
# Compare bcryptjs vs @node-rs/argon2 speed
```

- [ ] **Step 6: Commit**
```bash
git add src/utils/hash.ts package.json tests/utils/hash.test.ts
git commit -m "feat: add Argon2id for credential hashing with bcrypt migration"
```

---

### Task 2.5: Result-Type Experiment in One Plugin

**Files:**
- Create: `src/utils/result.ts` (Result<T, E> type)
- Modify: One plugin (e.g., `src/plugins/utility/`) to use Result
- Test: Plugin tests pass, error handling improved

**Interfaces:**
- Consumes: Current try/catch patterns
- Produces: Type-safe error handling pattern

- [ ] **Step 1: Define Result type**
```typescript
// src/utils/result.ts
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- [ ] **Step 2: Pick one plugin command with multiple external calls**
```bash
# e.g., utility plugin: weather, http, or api commands
```

- [ ] **Step 3: Refactor to use Result**
```typescript
// Before: try/catch with null checks
// After: Result chaining
const result = await fetchWeather(city)
  .then(parseResponse)
  .then(formatEmbed);
if (!result.ok) return reply(result.error.message);
```

- [ ] **Step 4: Run plugin tests**
```bash
pnpm vitest run tests/plugins/utility/
```

- [ ] **Step 5: Commit**
```bash
git add src/utils/result.ts src/plugins/utility/ tests/plugins/utility/
git commit -m "experiment: Result type for error handling in utility plugin"
```

---

## Phase 3: Risk Mitigation (Cross-Cutting)

### Task 3.1: CI Cross-Runtime Protobuf Contract Check

**Files:**
- Create: `.github/workflows/proto-contract.yml`
- Modify: `buf.yaml` / `buf.gen.yaml` (ensure all targets)

**Interfaces:**
- Consumes: protos/interlink/, protos/nsfw/
- Produces: CI gate preventing cross-runtime drift

- [ ] **Step 1: Design cross-codegen verification**
```yaml
# .github/workflows/proto-contract.yml
# 1. buf generate for TS
# 2. buf generate for Go (services/interlink)
# 3. buf generate for Rust (services/nsfw)
# 4. Compare generated interfaces match expectations
# 5. Run buf breaking against main branch
```

- [ ] **Step 2: Implement workflow**
```bash
# Use buf's multi-language generation
# Add step to verify TS/Go/Rust generated code compiles
```

- [ ] **Step 3: Test on feature branch with intentional proto change**
```bash
# Verify CI catches drift
```

- [ ] **Step 4: Commit**
```bash
git add .github/workflows/proto-contract.yml
git commit -m "ci: add cross-runtime protobuf contract verification"
```

---

### Task 3.2: Leader Election Failover Integration Test

**Files:**
- Create: `tests/integration/leader-failover.test.ts`
- Modify: `src/gateway/leader.ts` (if test hooks needed)

**Interfaces:**
- Consumes: Leader election, scheduler `withLock`
- Produces: Test proving no double-run on failover

- [ ] **Step 1: Design test scenario**
```typescript
// 1. Start 2 gateway pods (leader + follower)
// 2. Trigger scheduler job
// 3. Kill leader pod
// 4. Verify follower becomes leader
// 5. Verify scheduler job ran exactly once (not twice)
```

- [ ] **Step 2: Implement test with testcontainers or mock Redis**
```typescript
// Use Vitest with Redis testcontainer
// Mock Discord client
// Use real leader election + scheduler
```

- [ ] **Step 3: Run test multiple times for flakiness**
```bash
for i in {1..10}; do pnpm vitest run tests/integration/leader-failover.test.ts; done
```

- [ ] **Step 4: Commit**
```bash
git add tests/integration/leader-failover.test.ts
git commit -m "test: add leader election failover integration test"
```

---

### Task 3.3: CI Guard Against ALLOW_UNVERIFIED_PLUGINS

**Files:**
- Modify: `.github/workflows/ci.yml` (add env check)
- Modify: `scripts/verify-manifest.ts` (if exists)

**Interfaces:**
- Consumes: CI environment
- Produces: Build failure if ALLOW_UNVERIFIED_PLUGINS=1

- [ ] **Step 1: Add CI check**
```yaml
# .github/workflows/ci.yml
- name: Verify plugin manifest verification enabled
  run: |
    if [ "$ALLOW_UNVERIFIED_PLUGINS" = "1" ]; then
      echo "ERROR: ALLOW_UNVERIFIED_PLUGINS=1 not allowed in CI"
      exit 1
    fi
```

- [ ] **Step 2: Test CI fails when set**
```bash
ALLOW_UNVERIFIED_PLUGINS=1 pnpm build  # or CI simulation
```

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/ci.yml
git commit -m "ci: fail build if ALLOW_UNVERIFIED_PLUGINS=1"
```

---

### Task 3.4: Dependency Deduplication Tooling

**Files:**
- Modify: `package.json` (add syncpack or sherif)
- Create: `.syncpackrc` or similar config
- Modify: CI to run dedupe check

**Interfaces:**
- Consumes: Current dependency tree
- Produces: Deduplicated, consistent dependency versions

- [ ] **Step 1: Add syncpack**
```bash
pnpm add -D syncpack
```

- [ ] **Step 2: Configure syncpack**
```json
// .syncpackrc
{
  "versionGroups": [
    {
      "packages": ["@opentelemetry/*"],
      "dependencies": ["dependencies", "devDependencies"]
    }
  ],
  "devDependencies": ["**/package.json"],
  "semverRange": "^"
}
```

- [ ] **Step 3: Add to CI**
```yaml
# .github/workflows/ci.yml
- name: Check dependency consistency
  run: pnpm syncpack list-mismatches
```

- [ ] **Step 4: Run locally to fix existing mismatches**
```bash
pnpm syncpack fix-mismatches
pnpm install
pnpm test
```

- [ ] **Step 5: Commit**
```bash
git add .syncpackrc package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "chore: add dependency deduplication with syncpack"
```

---

## Execution Order & Dependencies

```
Phase 0 (P0 - Parallel):
  0.1 → 0.2 → 0.3 → 0.4  (can run in parallel, all independent)

Phase 1 (P1 - Sequential within, parallel across):
  1.1 (RPC) ──► 1.2 (SQLite) ──► 1.3 (Encryption) ──► 1.4 (Planning)
      │
      └─► All must complete before Phase 2

Phase 2 (P2 - Parallel):
  2.1 (HTTP)  2.2 (Bull Board)  2.3 (TS Refs)  2.4 (Argon2)  2.5 (Result)

Phase 3 (Risk - Parallel, can start after Phase 0):
  3.1 (Proto CI)  3.2 (Leader Test)  3.3 (Plugin Guard)  3.4 (Dedupe)
```

---

## Verification Gates Per Phase

| Phase | Required Verification |
|-------|----------------------|
| P0 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, docs review |
| P1 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm proto:lint`, `pnpm proto:breaking`, NSFW tests |
| P2 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, build benchmark |
| Risk | `pnpm test` (new integration tests), CI pipeline validation |

---

## Estimated Effort

| Task | Estimate | Risk |
|------|----------|------|
| 0.1 Doc drift | 30 min | Low |
| 0.2 Typecheck | 2-4 hrs | Medium (unknown error count) |
| 0.3 Worker entry | 1 hr | Low |
| 0.4 OTel grouping | 30 min | Low |
| 1.1 RPC unification | 1-2 days | High (cross-runtime) |
| 1.2 SQLite hardening | 2-4 hrs | Medium |
| 1.3 Encryption rotation | 4-6 hrs | Medium |
| 1.4 v15 planning | 2 hrs | Low (planning only) |
| 2.1 HTTP layer | 3-4 hrs | Low |
| 2.2 Bull Board | 2 hrs | Low |
| 2.3 TS project refs | 2-3 hrs | Medium |
| 2.4 Argon2 | 3-4 hrs | Medium |
| 2.5 Result type | 2-3 hrs | Low |
| 3.1 Proto CI | 2-3 hrs | Medium |
| 3.2 Leader test | 4-6 hrs | High (integration) |
| 3.3 Plugin guard | 30 min | Low |
| 3.4 Dedupe | 1-2 hrs | Low |

---

**Plan complete and saved to `docs/superpowers/plans/2026-10-07-stack-improvements.md`. Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

**For this plan I recommend Subagent-driven, because the tasks have significant cross-cutting dependencies (RPC unification affects NSFW/Go/Rust, SQLite affects both DB modes, leader test requires real Redis), and a shipped mistake in any P0/P1 task would require reverting multiple dependent changes. Does the plan capture what you want, and which approach should we use?**