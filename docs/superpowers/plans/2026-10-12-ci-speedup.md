# CI Speedup: Rust Cache Repair, Test Sharding, Setup Trims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the CI critical path from roughly 6-7 minutes to roughly 2-3 minutes by repairing the poisoned Rust cache, sharding the vitest suite four ways with a single coverage pass, and removing dead weight from the Setup job.

**Architecture:** All changes are in `.github/workflows/ci.yml` plus minor docs. The Rust jobs replace their hand-rolled `actions/cache` blocks (which can never save because the Setup job permanently claimed the exact key with a 0.01GB empty cache) with `Swatinem/rust-cache` using distinct prefix keys per profile. The Test job becomes a 4-shard matrix that runs the suite exactly once per shard with coverage folded in, replacing today's double full-suite run; Codecov merges partial coverage by commit SHA. The Setup job loses the Rust toolchain and cache block it never uses and gains a version-keyed cache for buf and the global npm protoc plugins.

**Tech Stack:** GitHub Actions (SHA-pinned actions per repo convention), vitest 3.x sharding, Swatinem/rust-cache v2, Codecov per-job merge-by-SHA.

**Spec:** none - this plan is driven by measured evidence, embedded below as "Measured Baseline". Every design decision cites a measurement.

## Measured Baseline (evidence for every task)

| Surface | Measured | Evidence |
|---|---|---|
| `pnpm build` local | 3s cold, 1s warm (TS 7.0.2 native) | timed this session; nothing to optimize in the TypeScript build |
| Test job | 4.2 min | `gh api .../runs/38314453680/jobs`; runs `pnpm test` then `pnpm test:coverage` (ci.yml lines 178-183): two full sequential passes |
| Vitest execution model | sequential | `vitest.config.ts:27-29`: `pool: 'forks'`, `maxWorkers: 1`, `fileParallelism: false` - deliberate, do not change; sharding supplies parallelism across runners instead |
| Rust Build job | 3.3 min | same API call; workspace `Cargo.toml` members `crates/nsfw-proto`, `crates/nsfw-server`, `Cargo.lock` committed |
| Rust cache | poisoned | `gh cache list`: `Linux-cargo-5b12a874e903c99b5912abcf2180afe2ca9cc365d85ccf2752523a04f4fd1eb9` is **0.01GB**, created 2026-10-06 by the Setup job (which never builds Rust); `actions/cache` skips the post-save when the exact key exists, so rust-build's multi-GB `target/` is never saved |
| Rust Tests job | 2.1 min | same API call; `cargo test --workspace --exclude nsfw-server` plus `cargo test -p nsfw-server`, debug profile |
| Setup job | 0.9 min | gates every other job (`needs: setup`); includes a Rust toolchain install (lines 76-80) and cargo cache block (lines 82-93) that nothing in Setup uses; installs buf via curl (lines 95-100), apt protobuf-compiler (lines 102-103), two global npm protoc plugins (lines 105-115) |
| Go jobs | 0.8-0.9 min each | `actions/setup-go` already runs with `cache: true` (ci.yml lines 447-450, 464-468, 482-486) - no work needed |
| Docker job | 2m17s | already uses `cache-from/cache-to: type=gha,scope=bot` (docker.yml lines 128-129) plus BuildKit cache mounts for pnpm store, corepack, tsbuildinfo (Dockerfile.prod lines 10, 22, 38-39) - no work needed |
| pnpm cache | healthy | `Linux-pnpm-99ac...` 0.14GB, restore-hit path works; downstream jobs restore `node_modules` (ci.yml lines 139-146 and equivalents) |
| Test isolation | shard-safe | `tests/setup.ts` runs `resetTestDb` + `runMigrations` + i18n init in `beforeAll` per process; every runner is a fresh VM with its own temp DB; no fixed-port binding found outside `tests/nsfw-fidelity.test.ts` (single file, lands on one shard) |
| Coverage config | non-gating | `vitest.config.ts:10-22`: v8 provider, reporters text/json/html, no thresholds; Test job's coverage step is `continue-on-error: true` (ci.yml line 183) - partial per-shard coverage is acceptable and Codecov merges by SHA |
| CI trigger model | workflow_dispatch available | ci.yml lines 3-8: push only to main/develop/experimental; feature branches verify via `gh workflow run CI --ref <branch>` or a draft PR |

## Global Constraints

- pnpm only; never npm/yarn. Node 26 (`NODE_VERSION` env), Rust 1.88 (`RUST_VERSION` env) - both already set in ci.yml env block.
- Every `uses:` must stay pinned to a commit SHA (repo convention; all current actions use SHAs). Swatinem/rust-cache pinned to `6323deb102c322ba6fcbdcafc7e3dddab59af2b6` (v2 branch head, tag v2.9.2) - verify at execution with `gh api repos/Swatinem/rust-cache/commits/v2 --jq .sha` and use what it returns.
- Job IDs (`setup`, `lint`, `test`, `rust-build`, `rust-test`, `audit`, `manifest-check`, `verify-plugins`, `syncpack-check`, `buf-lint`, `go-build`, `go-test`, `golangci-lint`) feed `ci-success.needs` (ci.yml line 497) and must not change. Matrix jobs fan in automatically: `needs.test.result` is `failure` if any shard fails.
- Coverage stays non-gating. Do not add thresholds, do not remove `continue-on-error` from codecov steps.
- Do not modify `vitest.config.ts`, test files, source files, or `package.json`. This plan touches CI workflow YAML and docs only.
- GitHub cache quota is 10GB per repo with LRU eviction. After this plan, expected steady-state caches: pnpm ~0.15GB, rust-release ~1-2GB, rust-test ~1-2GB, tools <0.05GB, buildkit blobs ~1GB - well under quota.
- Do not mutate branch protection without explicit user confirmation; Task 4 only inspects it and reports.

## Review Focus

1. **Cache poisoning recurrence** - a job that restores-but-never-populates a cache (like Setup today) must never share an exact cache key with a job that populates it, or the populating job's save is silently skipped forever. Pinned in Task 1 verification: `gh cache list` must show `v1-rust-release-*` and `v1-rust-test-*` keys above 100MB after the second CI run, and the Setup job must contain no cargo cache step.
2. **Sharded run losing tests** - a bad shard expression or env interpolation silently drops test files, and CI goes green with 150 files instead of 196. Pinned in Task 2 verification: the vitest summary line of each shard logs its file count, and the four counts sum to the unsharded total (196 files, 2090 tests; 13 skipped are env-gated and may vary - compare file counts, not test counts).
3. **Coverage merge gaps** - four partial `coverage/` directories must reach Codecov or merged coverage silently regresses. Pinned in Task 2 verification: codecov-action step logs `ProcessCompleted... uploaded` on all four shards (step output visible in run logs), flags `shard-1..4` present.
4. **Required-check name drift** - matrix renames the check from `Test` to `Test (1/4)` ... `Test (4/4)`; if branch protection requires a check literally named `Test`, PRs will hang on a missing check. Pinned in Task 4: query protection rules and report; only mutate with user confirmation.
5. **Concurrent cache-save races** - rust-build and rust-test run in parallel; identical cache keys would make one save a no-op and lose a whole profile's artifacts. Pinned by the two distinct `prefix-key` values in Task 1 and their separate appearance in `gh cache list`.

---

### Task 1: Repair the Rust build cache

**Files:**
- Modify: `.github/workflows/ci.yml` (setup job lines 82-93; rust-build job lines 217-228; rust-test job lines 251-262)

**Interfaces:**
- Consumes: existing job IDs `rust-build`, `rust-test`; `RUST_VERSION` env; committed `Cargo.lock` at repo root.
- Produces: two independent Swatinem/rust-cache entries with prefix keys `v1-rust-release` (release profile, consumed by Docker image builds implicitly via speedup only) and `v1-rust-test` (debug profile). Later tasks rely on nothing from this task except faster jobs.

- [ ] **Step 1: Remove the cargo cache block from the Setup job**

Delete the step named `Cache Rust dependencies` at ci.yml lines 82-93 (the `uses: actions/cache@3edfce9056124e459a23f683a21433670d47daca` block with `path` including `target/`, `key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}`, and `restore-keys: |${{ runner.os }}-cargo-`). The Setup job never runs cargo; its post-save wrote the 0.01GB empty cache under the exact key that blocks rust-build from ever saving its real artifacts.

- [ ] **Step 2: Replace the cache block in rust-build with Swatinem/rust-cache**

Replace the step at lines 217-228 with:

```yaml
      - name: Cache Rust release build
        uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6
        with:
          prefix-key: v1-rust-release
          cache-on-failure: true
```

Swatinem/rust-cache keys on lockfile + Cargo.toml contents + rustc version, caches `./target` plus cargo registry/git dirs, prunes stale dependency artifacts, and never saves an empty cache.

- [ ] **Step 3: Replace the cache block in rust-test with a distinct prefix**

Replace the step at lines 251-262 with:

```yaml
      - name: Cache Rust test build
        uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6
        with:
          prefix-key: v1-rust-test
          cache-on-failure: true
```

The distinct prefix is required because both jobs run concurrently on the same lockfile; an identical key would let whichever job finishes first claim the key and silently discard the other profile's artifacts. `cargo test` builds the debug profile and `cargo build --release` the release profile, so their `target/` subtrees are disjoint.

- [ ] **Step 4: Delete the poisoned legacy cache key**

```bash
gh cache delete "Linux-cargo-5b12a874e903c99b5912abcf2180afe2ca9cc365d85ccf2752523a04f4fd1eb9"
```

Requires `actions:write` on the token. If deletion fails on permissions, note it and continue: new Swatinem keys (`v1-rust-release-*`) never collide with the legacy `Linux-cargo-*` format, so deletion is quota hygiene, not correctness.

- [ ] **Step 5: Verify with a workflow_dispatch run**

```bash
git checkout -b ci-speedup
git add .github/workflows/ci.yml
git commit -m "ci: repair poisoned Rust cache with Swatinem/rust-cache"
git push -u origin ci-speedup
gh workflow run CI --ref ci-speedup
sleep 300
gh cache list --json key,sizeInBytes --jq '.[] | select(.key | startswith("v1-rust-")) | "\(.key | .[0:24]) \(.sizeInBytes / 1048576 | floor)MB"'
```

Expected: the FIRST run still takes ~3.5 min for rust-build (it populates the cache). Its post-run cache list must show `v1-rust-release-...` above 100MB. Then trigger a second run (`gh workflow run CI --ref ci-speedup`) and confirm rust-build drops to roughly 1-2 min and a `v1-rust-test-...` key appears after rust-test completes.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: repair poisoned Rust cache with Swatinem/rust-cache"
```

(If Step 5 already committed, this step is the final commit for the task; keep one focused commit for the ci.yml change.)

### Task 2: Shard the test suite and run coverage once

**Files:**
- Modify: `.github/workflows/ci.yml` (test job lines 151-201)

**Interfaces:**
- Consumes: Setup job's cache outputs (`needs.setup.outputs.cache-key`); vitest CLI (`--shard`, `--coverage`); codecov-action.
- Produces: four check runs named `Test (1/4)` ... `Test (4/4)` under job ID `test`; per-shard codecov uploads flagged `unittests,shard-N` that Codecov merges by commit SHA; `ci-success` keeps depending on job ID `test` unchanged.

- [ ] **Step 1: Rewrite the test job as a 4-shard matrix**

Replace the test job (lines 151-201) with:

```yaml
  test:
    name: Test (${{ matrix.shard }}/4)
    runs-on: ubuntu-latest
    needs: setup
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - name: Checkout repository
        uses: actions/checkout@f548e57e544e1ff5a4c46bf1e1b8685f8e4a348a

      - name: Setup pnpm
        uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@ae0d4ed08881f17d1511386f5be3e62356acd4a6
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore dependencies cache
        uses: actions/cache@3edfce9056124e459a23f683a21433670d47daca
        with:
          path: |
            node_modules
            **/node_modules
            ~/.pnpm-store
          key: ${{ needs.setup.outputs.cache-key }}

      - name: Run tests (shard ${{ matrix.shard }}/4)
        run: pnpm vitest run --shard=${{ matrix.shard }}/4 --coverage

      - name: Upload coverage to Codecov
        if: always()
        uses: codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f
        continue-on-error: true
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          fail_ci_if_error: false
          flags: unittests,shard-${{ matrix.shard }}
          name: codecov-${{ github.sha }}-shard-${{ matrix.shard }}

      - name: Upload coverage artifact
        if: always() && matrix.shard == 1
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a
        with:
          name: test-results
          path: |
            coverage/
          retention-days: 7
```

Design notes: one vitest pass per shard replaces the current two passes (`pnpm test` at line 179 plus `pnpm test:coverage` at line 182) - this alone halves the suite's wall time. `fail-fast: false` keeps a failing shard from cancelling the others so failures report in parallel. The artifact upload keeps its original name `test-results` for compatibility, emitted from shard 1 only. `ci-success.needs: [test, ...]` (line 497) fans in across all four matrix legs automatically; `needs.test.result` is `failure` when any shard fails, preserving the gate semantics.

- [ ] **Step 2: Run a dispatch workflow and count files per shard**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: shard test suite 4 ways with single coverage pass"
git push
gh workflow run CI --ref ci-speedup
```

Wait for completion (`gh run watch`), then inspect each shard's vitest summary line in the run logs:

```bash
gh run view --log-failed 2>/dev/null; gh run view --job $(gh run view --json jobs --jq '.jobs[] | select(.name | startswith("Test (1/4")) | .databaseId') --log | grep -E "Test Files|tests? [0-9]+ passed"
```

Expected: each shard reports roughly 49 test files (196 / 4; vitest balances by file size so exact counts differ per shard); the four counts sum to 196. If the sum is lower, a shard expression is broken - STOP and fix before proceeding.

- [ ] **Step 3: Verify coverage uploads and shard wall time**

```bash
gh run view --json jobs --jq '.jobs[] | select(.name | startswith("Test")) | "\(.name): \(.conclusion)"'
```

Expected: four `Test (i/4)` checks, all `success`, each well under 2 minutes (single pass, one quarter of files, plus ~30-40s of checkout/cache overhead). All four codecov steps must log a successful upload in their job logs (search for `ProcessCompleted` or `Uploaded` in the Codecov step output).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: shard test suite 4 ways with single coverage pass"
```

### Task 3: Trim the Setup job

**Files:**
- Modify: `.github/workflows/ci.yml` (setup job lines 76-115)

**Interfaces:**
- Consumes: `BUF_VERSION` (hardcoded `v1.50.0` at line 97), `ts-proto@2.12.4` (line 107), `@bufbuild/protoc-gen-es@2.16.0` (line 113).
- Produces: a version-keyed tools cache; Setup completes in roughly 0.5 min instead of 0.9 min. `buf generate` (line 117-119) still runs unconditionally on every dispatch.

- [ ] **Step 1: Remove the unused Rust toolchain step from Setup**

Delete the `Setup Rust toolchain` step (lines 76-80, the `dtolnay/rust-toolchain` step with components rustfmt, clippy). Nothing between it and the end of the setup job invokes cargo; the Rust jobs install their own toolchains (lines 211-215, 245-249).

- [ ] **Step 2: Cache the buf and protoc plugin installs**

Replace the three install steps (lines 95-115) with a cached variant. Insert a restore step before them and guard the installs on a miss:

```yaml
      - name: Restore CLI tools cache
        id: tools-cache
        uses: actions/cache@3edfce9056124e459a23f683a21433670d47daca
        with:
          path: |
            /usr/local/bin/buf
            ~/.npm
          key: linux-tools-buf-v1.50.0-ts-proto-2.12.4-protoc-gen-es-2.16.0

      - name: Install buf
        if: steps.tools-cache.outputs.cache-hit != 'true'
        run: |
          BUF_VERSION="v1.50.0"
          sudo curl -sSL -o /usr/local/bin/buf "https://github.com/bufbuild/buf/releases/download/${BUF_VERSION}/buf-Linux-x86_64"
          sudo chmod +x /usr/local/bin/buf

      - name: Install protobuf-compiler
        if: steps.tools-cache.outputs.cache-hit != 'true'
        run: sudo apt-get update && sudo apt-get install -y protobuf-compiler

      - name: Install ts-proto and protoc-gen-es plugins
        if: steps.tools-cache.outputs.cache-hit != 'true'
        run: |
          npm install -g ts-proto@2.12.4
          npm install -g @bufbuild/protoc-gen-es@2.16.0

      - name: Put global npm bin on PATH
        run: echo "$HOME/.npm/bin" >> $GITHUB_PATH
```

The `buf --version` echo from the original step is dropped (installation success is proven by `buf generate` at the end of the job). The PATH echo must always run, hit or miss. The cache key embeds all three tool versions; bumping any of them invalidates the key automatically. Note `~/.npm` is npm's default global prefix here (the original workflow already relied on `$HOME/.npm/bin`), so caching it preserves both plugin binaries.

- [ ] **Step 3: Verify buf generate still succeeds**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: cache CLI tools in setup job, drop unused Rust toolchain"
git push
gh workflow run CI --ref ci-speedup
```

Expected: `buf generate` succeeds on both a cold run (cache miss, installs run) and the following warm run (cache hit, installs skipped, generate still green because plugins come from the restored cache). Setup job wall time should drop to roughly 0.5 min on a warm run. If `buf generate` fails on the warm run, the system `protobuf-compiler` was needed despite buf's native compiler - restore the apt step unconditionally and re-verify.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: cache CLI tools in setup job, drop unused Rust toolchain"
```

### Task 4: Branch protection check, docs, and before/after measurement

**Files:**
- Modify: `README.md` and/or `CONTRIBUTING.md` only where they mention CI internals (grep first)
- Create: none

**Interfaces:**
- Consumes: all prior tasks merged on branch `ci-speedup`.
- Produces: a before/after job-duration table reported to the user; a documented decision on required checks.

- [ ] **Step 1: Inspect branch protection for the renamed Test checks**

```bash
gh api repos/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot/branches/main/protection/required_status_checks --jq '{strict, contexts}' 2>&1
```

If the output lists `Test` as a required context, matrix sharding renames it to `Test (1/4)` ... `Test (4/4)` and PRs will hang on the missing check. Report the exact `contexts` list to the user and propose either (a) adding the four matrix names alongside existing contexts, or (b) requiring only `CI Success` (the aggregate). Do NOT mutate protection without explicit user approval; if `gh api` returns 403/404, the token lacks admin scope - report that the user must check Settings > Branches manually.

- [ ] **Step 2: Update docs where CI internals are mentioned**

```bash
grep -rn "ci.yml\|Rust Build\|cargo build --release\|pnpm test:coverage" README.md CONTRIBUTING.md docs/ 2>/dev/null
```

Update any hits that describe the Test job as a single run, the Rust cache as `actions/cache`, or the old job name `Test`. Expected touchpoints: a README badge/troubleshooting line, a CONTRIBUTING workflow paragraph, or `docs/runbooks/` CI notes. If grep finds nothing, no doc changes are needed - record that in the commit body instead of inventing edits.

- [ ] **Step 3: Produce the before/after table**

```bash
gh run list --branch ci-speedup --limit 5
gh run view <latest-run-id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion) \(.started_at) -> \(.completed_at)"'
```

Expected steady-state (warm caches, second and later runs): Test slowest shard under 2 min (was 4.2 min), Rust Build 1-2 min (was 3.3 min), Rust Tests 1-1.5 min (was 2.1 min), Setup ~0.5 min (was 0.9 min), critical path (`ci-success` wall time) roughly 2-3 min (was 6-7 min). Report the table to the user; do not claim the speedup without quoting this output.

- [ ] **Step 4: Commit docs**

```bash
git add README.md CONTRIBUTING.md docs/ 2>/dev/null
git commit -m "docs: update CI notes for sharded tests and Rust cache repair"
```

Skip the commit if Step 2 found nothing to update.

## Out of Scope (explicitly not in this plan)

- Go job caching (already enabled via `actions/setup-go` `cache: true`).
- Docker job optimization (already uses gha layer cache scope=bot plus BuildKit cache mounts in Dockerfile.prod).
- Enabling vitest `fileParallelism`/`maxWorkers` locally (deliberately disabled; changing it risks port and shared-state collisions inside a single runner - sharding achieves the parallelism safely).
- The TypeScript project-references plan (`docs/superpowers/plans/2026-10-12-project-references-build.md`) - parked; it optimizes a 3-second build.
