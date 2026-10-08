# Docker Build Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut cold and warm build times for all three Docker images (TypeScript bot, Go interlink, Rust nsfw-server) and add CI coverage for the nsfw image.

**Architecture:** No refactors. Each task is a surgical Dockerfile or workflow edit: cache mounts for incremental compilers, fewer layers, a prebuilt toolchain base, and one new CI job cloned from an existing one. Every task verifies with a real `docker buildx build`.

**Tech Stack:** Docker BuildKit (cache mounts, multi-stage), TypeScript `tsc --incremental`, Go module/build cache, Rust `cargo fetch`, GitHub Actions (`docker/build-push-action`, GHA cache).

**Spec:** Conversational spec from the human partner (2026-10-06): fix speed problems in the rust, go, and main typescript bot docker builds, and implement a `build-nsfw-server` job in `docker.yml` that mirrors `build-interlink`. Prior analysis (this session) ranked: tsc full rebuilds, unused QEMU setup, uncached Go builds, rustup re-downloads, and missing nsfw CI coverage.

## Global Constraints

- Node.js 22 minimum, production targets Node.js 26; base images stay `node:26-alpine` (bot), `golang:1.25-alpine` (interlink), `ubuntu:noble` runtime (nsfw-server, glibc 2.39 for ort binaries).
- pnpm only; never npm/yarn. Bot builder uses pnpm 11 via corepack.
- Never commit secrets, `.env`, runtime data, or model files (`./models` is a mounted volume, not image content).
- No emojis in code, docs, commit messages, or PR text.
- `docker-compose.yml` builds nsfw-worker from repo-root context with `dockerfile: crates/nsfw-server/Dockerfile, target: runtime` — all `COPY` paths in that Dockerfile are repo-root-relative and must stay so.
- `Dockerfile` (dev, tsx-based) is out of scope; only `Dockerfile.prod`, `services/interlink/Dockerfile`, `crates/nsfw-server/Dockerfile`, and `.github/workflows/docker.yml` change.

## Review Focus

- Filenames with spaces or newlines would break the tar file-list pipe in Task 3; `tsc` output never contains them, and a violation fails the build loudly rather than silently skipping files.
- If the `rust:1.88-slim-bookworm` tag does not exist upstream, Task 1 Step 2 fails at pull time; the fallback is `rust:1.88-bookworm`.
- If `Cargo.lock` drifts out of sync with the manifests, Task 1's `--locked` flags fail the build loudly; that is intended, and the fix is `cargo update` committed separately, never `--locked` removal.
- A stale `tsbuildinfo` after a TypeScript version bump is self-healing (`tsc` invalidates on version change and rebuilds once); no manual cache busting is needed.
- Three `mode=max` GHA caches may pressure the 10 GB repo cache limit and evict each other; builds stay correct, only slower — if observed, scope nsfw/interlink caches to `mode=min`.

---

## File Map

- Modify: `tsconfig.build.json` — add `incremental` + `tsBuildInfoFile` under `compilerOptions`.
- Modify: `.gitignore` — ignore `.cache/` (local tsbuildinfo residue).
- Modify: `Dockerfile.prod` — builder: merged corepack layer, cache mounts on install/build, single combined build RUN; runtime: tar-pipe overlay replaces find/cp loop.
- Modify: `services/interlink/Dockerfile` — cache mounts on `go mod download` and `go build`.
- Modify: `crates/nsfw-server/Dockerfile` — rust base image, merged apt layer, fetch split, `--locked` builds.
- Modify: `.github/workflows/docker.yml` — remove QEMU steps, fix path filters, add `build-nsfw` job, extend `scan` to three images.

---

### Task 1: Rust nsfw-server Dockerfile — prebuilt toolchain, fewer layers, split fetch

**Files:**
- Modify: `crates/nsfw-server/Dockerfile` (lines 4–43, builder stage only; runtime stage untouched)

**Interfaces:**
- Consumes: workspace manifests (`Cargo.toml`, `Cargo.lock`, `crates/*/Cargo.toml`), sources (`crates/`, `protos/`), BuildKit cache mounts.
- Produces: `/artifacts/nsfw-server` static binary consumed unchanged by the existing runtime stage; repo-root-relative `COPY` paths preserved for `docker-compose.yml`.

- [ ] **Step 1: Trim the rustup install (keep noble base)**

> Ruling: the original draft swapped the builder to `rust:1.88-slim-bookworm`, but ort's prebuilt onnxruntime fails to LINK there (`__isoc23_strtol`, `_M_replace_cold` need glibc 2.38+/newer libstdc++). Noble stays for both stages; the durable wins are the minimal profile below plus Steps 2–4.

Keep `FROM ubuntu:noble AS builder` and replace the rustup `RUN` + `ENV PATH` with:

Replace lines 4–15 (`FROM ubuntu:noble AS builder` through the rustup `RUN` and `ENV PATH`) with:

```dockerfile
# ─── Builder Stage ──────────────────────────────────────────────────────
# Ubuntu noble (24.04): REQUIRED even for the builder. ort's prebuilt
# onnxruntime binaries reference glibc 2.38+ versioned symbols
# (__isoc23_strtol, _M_replace_cold) and fail to LINK on older distros
# such as Debian bookworm (glibc 2.36) — verified by a failed build
# (Ruling, Task 1: `rust:1.88-slim-bookworm` base reverted for this reason).
FROM ubuntu:noble AS builder

# Install Rust (minimal profile: skips rust-docs, the bulk of the download)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.88 \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"
```

No pull check needed: `ubuntu:noble` is already used by the current Dockerfile, so the tag is known good.

- [ ] **Step 2: Merge the two apt-get layers and drop curl**

Replace the second apt `RUN` block (old lines 17–25) with one combined layer (keeps curl for rustup above; wget stays for grpc_health_probe):

```dockerfile
# Install build dependencies + wget for grpc_health_probe in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    protobuf-compiler \
    cmake \
    libssl-dev \
    pkg-config \
    wget \
    g++ \
    && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 3: Split dependency fetch from source copy**

Replace the copy block (old lines 34–37):

```dockerfile
# Copy manifests first so dependency downloads cache independently of sources
COPY Cargo.toml Cargo.lock ./
COPY crates/nsfw-server/Cargo.toml ./crates/nsfw-server/Cargo.toml
COPY crates/nsfw-proto/Cargo.toml ./crates/nsfw-proto/Cargo.toml
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo fetch --locked
# Copy sources (invalidates only the compile step below, not the fetch above)
COPY crates ./crates
COPY protos ./protos
```

- [ ] **Step 4: Enforce the lockfile on the release build**

In the build `RUN`, change `cargo build --release -p nsfw-server` to `cargo build --locked --release -p nsfw-server`. Full line becomes:

```dockerfile
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --locked --release -p nsfw-server && \
    mkdir -p /artifacts && cp /app/target/release/nsfw-server /artifacts/
```

- [ ] **Step 5: Build the image and verify the binary**

Run: `docker buildx build --target runtime -f crates/nsfw-server/Dockerfile -t apollo-nsfw-worker:plan-test .`
Expected: BUILD SUCCEEDS with no `--locked` error (proves lockfile is in sync). Then confirm the binary and probe landed in the runtime image (runtime is ubuntu, so `sh` is available): `docker run --rm --entrypoint sh apollo-nsfw-worker:plan-test -c "ls -l /usr/local/bin/nsfw-server /usr/local/bin/grpc_health_probe"`.
Expected: both paths listed.

- [ ] **Step 6: Commit**

```bash
git add crates/nsfw-server/Dockerfile
git commit -m "perf(docker): speed up nsfw-server builds with rust base image and split fetch"
```

---

### Task 2: Go interlink Dockerfile — cache module downloads and build cache

**Files:**
- Modify: `services/interlink/Dockerfile` (lines 11–17, builder stage only; distroless runtime untouched)

**Interfaces:**
- Consumes: `go.mod`/`go.sum`, Go sources, BuildKit cache mounts.
- Produces: `/interlink` static binary consumed unchanged by the runtime stage.

- [ ] **Step 1: Add cache mounts to module download and build**

Replace lines 11–17 with:

```dockerfile
# Cache modules (mount keeps the module cache warm across builds)
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source and build static binary (build cache avoids recompiling unchanged packages)
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -ldflags="-s -w" -o /interlink .
```

No other lines change. `COPY . .` after `go mod download` preserves the existing layer ordering (source edits do not invalidate module download).

- [ ] **Step 2: Build twice and confirm the second is fast**

Run: `docker buildx build -f services/interlink/Dockerfile -t apollo-interlink:plan-test ./services/interlink`
Expected: first BUILD SUCCEEDS. Run the exact same command again immediately.
Expected: second build completes in seconds with `CACHED` on the `go build` step.

- [ ] **Step 3: Commit**

```bash
git add services/interlink/Dockerfile
git commit -m "perf(docker): cache go modules and build cache in interlink image"
```

---

### Task 3: TypeScript bot build — incremental tsc, cached corepack, tar overlay

**Files:**
- Modify: `tsconfig.build.json` (add 2 lines under `compilerOptions`)
- Modify: `.gitignore` (append `.cache/`)
- Modify: `Dockerfile.prod` (builder lines 8–42, runtime line 74)

**Interfaces:**
- Consumes: Task 3's own tsconfig change (the Dockerfile mounts assume the `tsBuildInfoFile` path below).
- Produces: identical `dist/`, `dist/bin/apollo.js`, and overlaid `src/**/*.js` artifacts; no runtime behavior change.

- [ ] **Step 1: Enable incremental builds in tsconfig.build.json**

In `tsconfig.build.json`, under `compilerOptions`, add:

```json
"incremental": true,
"tsBuildInfoFile": "./.cache/tsbuildinfo/app.tsbuildinfo",
```

(The path is repo-root-relative. Local `pnpm build` runs also become incremental; the file stays out of git per Step 2. `tsc` self-invalidates it on compiler version changes.)

- [ ] **Step 2: Ignore the local build-info cache**

Append to `.gitignore`:

```gitignore
.cache/
```

- [ ] **Step 3: Merge corepack setup into the apk layer and cache its downloads**

Replace builder lines 8–14 with:

```dockerfile
# Install build dependencies for better-sqlite3 native bindings and pnpm in one layer
RUN --mount=type=cache,target=/root/.cache/node/corepack \
    apk add --no-cache python3 make g++ && \
    npm install -g corepack && corepack enable && corepack prepare pnpm@11 --activate
```

- [ ] **Step 4: Mount the tsbuildinfo cache and combine the compile steps**

Replace the three separate `RUN pnpm build`, `RUN pnpm build:cli`, `RUN pnpm manifest` lines (old 32–38) with one layer sharing both mounts:

```dockerfile
# Compile gateway/worker/shard entries to dist/ with source maps (incremental:
# unchanged files skip emit via the tsbuildinfo cache). Bundle the CLI entry,
# then regenerate plugin-manifest.json from current sources.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=tsbuildinfo,target=/app/.cache/tsbuildinfo \
    pnpm build && pnpm build:cli && pnpm manifest
```

(The `pnpm install` line above keeps its existing store mount unchanged.)

- [ ] **Step 5: Replace the find/cp overlay loop with a single tar pipe**

Replace runtime line 74 (`RUN cd ./dist && find . -type f -name '*.js' | while read -r f; do ...`) with the GNU-tar pipe below.

> Ruling, Task 3: the draft's bare `tar -cf - -T -` / `--null` variants both fail on BusyBox tar (`tar: short read`, plus a `--null` usage error). Verified fix: install GNU tar and remove it in the same layer:

```dockerfile
# BusyBox tar cannot do NUL-delimited file lists, so use GNU tar for the pipe
# (installed and removed in the same layer, leaving no trace in the image).
RUN apk add --no-cache tar && cd ./dist && find . -type f -name '*.js' -print0 | tar --null -cf - --files-from=- | tar -xf - -C ../src && apk del tar
```

```dockerfile
# Overlay compiled JS files onto src so ESM '.js' imports resolve at runtime.
# Only '*.js' files are copied: '.d.ts'/'.map' files must not pollute src/
# or the plugin command/event loader will try to import type declarations.
RUN cd ./dist && find . -type f -name '*.js' | tar -cf - -T - | tar -xf - -C ../src
```

If this `RUN` fails (busybox tar flag incompatibility), revert to the original loop line and note it in the commit message — correctness over speed here.

- [ ] **Step 6: Build twice and confirm incrementality**

Run: `docker buildx build -f Dockerfile.prod -t apollo-bot:plan-test .`
Expected: BUILD SUCCEEDS and `dist/index.js` exists in the image (`docker run --rm apollo-bot:plan-test node -e "require('fs').statSync('dist/index.js'); console.log('DIST_OK')"` — the container CMD needs Discord credentials, so override the entrypoint; the file check is the assertion, and a missing overlay would already have failed the build).

Run the exact same build command again with no source changes.
Expected: completes quickly with the compile layer `CACHED`.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.build.json .gitignore Dockerfile.prod
git commit -m "perf(docker): incremental tsc, cached corepack, and tar overlay for bot image"
```

---

### Task 4: docker.yml — drop QEMU, fix path filters, add build-nsfw job, scan three images

**Files:**
- Modify: `.github/workflows/docker.yml` (triggers lines 5–36, build job QEMU lines 67–68, interlink QEMU lines 140–141, new job after `build-interlink`, `scan` job lines 196–230)

**Interfaces:**
- Consumes: Task 1's Dockerfile (the new job builds it), existing `build`/`build-interlink` jobs as copy templates.
- Produces: `build-nsfw` job outputs (`digest`, `image`, `tags`) in the exact shape the `scan` job consumes.

- [ ] **Step 1: Remove the unused QEMU steps**

Delete the `Set up QEMU` step from both the `build` job (lines 67–68) and the `build-interlink` job (lines 140–141). Both jobs build `platforms: linux/amd64` only, so emulation is never exercised.

- [ ] **Step 2: Fix stale path filters and add Rust triggers**

In both `push.paths` and `pull_request.paths`: replace `scripts/deploy-commands.js` with `scripts/deploy-commands.ts`, and add `tsconfig.json`, `tsconfig.build.json`, `buf.yaml`, `buf.gen.yaml`, `buf.gen.ts.yaml`, `buf.gen.go.yaml`, `protos/**`, `Cargo.toml`, `Cargo.lock`, `crates/**`, `crates/nsfw-server/Dockerfile`. The `services/interlink/**` entry already exists; keep it.

- [ ] **Step 3: Add the build-nsfw job mirroring build-interlink**

Insert after the `build-interlink` job (the job spans the `build-interlink:` key through its `Export build digest` step — copy that whole block), then apply these substitutions to the copy, every other line staying byte-identical: job id `build-nsfw`, `name: Build NSFW`, `context: .`, `file: ./crates/nsfw-server/Dockerfile`, image-name line `echo "name=$(echo ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}-nsfw | tr '[:upper:]' '[:lower:]')"`, summary title `## NSFW Docker Build Summary`. The tags block, `platforms: linux/amd64`, `cache-from: type=gha`, and `cache-to: type=gha,mode=max` are copied unchanged. No QEMU step, no build-args (matches interlink).

- [ ] **Step 4: Extend the scan job to three images**

Change `needs: [build, build-interlink]` to `needs: [build, build-interlink, build-nsfw]`. Add after the interlink scan step:

```yaml
      - name: Scan nsfw image
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25
        with:
          image-ref: ${{ needs.build-nsfw.outputs.image }}@${{ needs.build-nsfw.outputs.digest }}
          format: sarif
          output: nsfw-trivy.sarif
```

Replace the merge step with the three-file fold (same offset pattern as the existing two-file version, extended):

```bash
jq -s '.[0] as $a | .[1] as $b | .[2] as $c | ($a.runs[0].tool.driver.rules // [] | length) as $o1 | ($o1 + ($b.runs[0].tool.driver.rules // [] | length)) as $o2 | $a | .runs[0].results += ([($b.runs[0].results // [])[] | if has("ruleIndex") then .ruleIndex += $o1 else . end] + [(($c.runs[0].results // [])[]) | if has("ruleIndex") then .ruleIndex += $o2 else . end]) | .runs[0].tool.driver.rules += ((($b.runs[0].tool.driver.rules // []) + ($c.runs[0].tool.driver.rules // [])))' bot-trivy.sarif interlink-trivy.sarif nsfw-trivy.sarif > trivy.sarif
```

- [ ] **Step 5: Validate the workflow file**

Run: `node -e "require('js-yaml')"` — if js-yaml is unavailable, instead run `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/docker.yml'))"`.
Expected: parses with no error. Then run `git diff --stat` and confirm only `.github/workflows/docker.yml` changed.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/docker.yml
git commit -m "ci(docker): add nsfw image build and scan, drop qemu, fix path filters"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only; fixes go back into their owning task).

- [ ] **Step 1: Rebuild all three images from scratch**

Run each (cold, no cache):
```bash
docker buildx build --no-cache -f Dockerfile.prod -t apollo-bot:verify .
docker buildx build --no-cache -f services/interlink/Dockerfile -t apollo-interlink:verify ./services/interlink
docker buildx build --no-cache --target runtime -f crates/nsfw-server/Dockerfile -t apollo-nsfw-worker:verify .
```
Expected: all three BUILD SUCCEED. Record wall-clock times as the new baseline.

- [ ] **Step 2: Confirm warm rebuilds are fast**

Touch one source file per image (`touch src/index.ts`, `touch services/interlink/main.go`, `touch crates/nsfw-server/src/main.rs` — check the actual main file name first with `ls crates/nsfw-server/src/`), then rerun the three builds without `--no-cache`.
Expected: each completes markedly faster than its cold build, with the compile step `CACHED` (go) or incremental (tsc/cargo). Restore the touched files with `git checkout -- <files>` if the touch modified mtimes only (touch changes mtime; restore via `git status` check and `git checkout` if needed — content is untouched, only timestamps change, so no commit risk).

- [ ] **Step 3: Confirm compose still builds nsfw-worker**

Run: `docker compose build nsfw-worker`
Expected: BUILD SUCCEEDS (proves repo-root-relative `COPY` paths still satisfy the compose build).

- [ ] **Step 4: Confirm nothing else changed**

Run: `git status --short`
Expected: only the six files from Tasks 1–4 are modified (`tsconfig.build.json`, `.gitignore`, `Dockerfile.prod`, `services/interlink/Dockerfile`, `crates/nsfw-server/Dockerfile`, `.github/workflows/docker.yml`). No secrets, no `.env`, no model files.
