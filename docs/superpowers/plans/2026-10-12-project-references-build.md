# Project-References Build Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inert 13-project tsconfig reference set with a working 3-layer composite graph driven by `tsc --build`, giving incremental rebuilds, parallel-friendly CI, and compile-time enforcement of dependency direction.

**Architecture:** Three composite projects layered along the real import graph - `foundation` (types, config, i18n, observability, utils, db), `services` (core, queue, gateway), `app` (plugins, admin, cli, root entries) - each emitting into the same `dist/` layout as today's single pass. `tsconfig.build.json` becomes a solution root; `tsconfig.generated.json` stays standalone because CI invokes it directly. Two utils files that import upward into queue are moved into `src/queue/` first so the layer graph is acyclic.

**Tech Stack:** TypeScript 5 project references (`tsc --build`, composite projects), Vitest architecture fitness tests, pnpm scripts.

**Spec:** Discussion captured in the PR #80 review thread (2026-10-12): the prior plan `docs/superpowers/plans/2026-10-06-docker-build-speed.md` added incremental tsbuildinfo but the reference set was never made buildable. This plan supersedes the reference wiring from `efb4cb0a`.

## Global Constraints

- pnpm only; never npm/npx/yarn.
- Relative ESM imports keep the `.js` suffix even in `.ts` sources.
- No `any` in `src/`; `noUncheckedIndexedAccess` is enabled - handle possibly undefined indexing explicitly.
- No code comments in source or tests; no emojis anywhere.
- 4-space indent, single quotes, semicolons, no trailing commas, `eqeqeq`, `curly: all`.
- `node dist/index.js` is the production entry - the emitted `dist/` layout must not change.
- `tsc --noEmit -p tsconfig.generated.json` must keep passing; `.github/workflows/proto-contract.yml:144` invokes it.
- `tsconfig.docker.json` and the Dockerfile `tsc -p tsconfig.docker.json` line are untouched.
- Typecheck baseline: `pnpm typecheck` reports exactly 77 errors in 16 pre-existing test files; this count must not grow.
- `pnpm lint` stays at 19 pre-existing warnings, 0 errors.
- Tests use isolated temp databases and never touch `src/data/`.

## Review Focus

1. Clean-checkout emission layout: after `rm -rf dist .cache/tsbuildinfo`, a fresh `pnpm build` must emit `dist/index.js`, `dist/core/EventBus.js`, and `dist/generated/nsfw/v1/*` at today's exact paths; a person deploying with `node dist/index.js` expects zero path changes. Pinned by the clean-room build step in Task 3.
2. Upward imports reintroduced: a new `utils -> queue`, `utils -> core`, `db -> queue`, or `services -> plugins` style edge must fail CI, not silently widen a layer; a reasonable person expects layering violations to be compile-time or test-time errors. Pinned by the Task 1 fitness test, kept green through Tasks 2-4.
3. Proto contract CI: `tsconfig.generated.json` must still typecheck standalone under `--noEmit` exactly as `proto-contract.yml` runs it; a person regenerating protos expects the workflow to stay green. Pinned in Task 3.
4. Docker build: the image build uses `tsconfig.docker.json` (no references, single pass); a person building the container expects it untouched and green. Pinned in Task 3.
5. Typecheck baseline drift: `pnpm typecheck` must stay at exactly 77 pre-existing errors; a person relying on the baseline to detect new type errors expects no silent growth. Pinned in Tasks 2, 3 and 4.

---

### Task 1: Layer-direction fitness test

**Files:**
- Create: `tests/architecture/tsconfig-layers.test.ts`

**Interfaces:**
- Consumes: nothing; static source scan only.
- Produces: test file `tests/architecture/tsconfig-layers.test.ts` exporting no API; later tasks rely on `pnpm vitest run tests/architecture/tsconfig-layers.test.ts` exiting 0.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FOUNDATION = ['types', 'config', 'i18n', 'observability', 'utils', 'db'];
const SERVICES = ['core', 'queue', 'gateway'];
const APP = ['plugins', 'admin', 'cli'];

function listSourceFiles(area: string): string[] {
    const root = join(process.cwd(), 'src', area);
    const out: string[] = [];
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) {
                walk(full);
            } else if (name.endsWith('.ts')) {
                out.push(full);
            }
        }
    };
    walk(root);
    return out;
}

function importedArea(fromArea: string, spec: string): string | null {
    if (!spec.startsWith('.')) {
        return null;
    }
    const parts = spec.split('/');
    for (const part of parts) {
        if (part === '.' || part === '..') {
            continue;
        }
        if ([...FOUNDATION, ...SERVICES, ...APP].includes(part)) {
            return part === fromArea ? null : part;
        }
        return null;
    }
    return null;
}

function violations(fromAreas: string[], forbidden: string[]): string[] {
    const bad: string[] = [];
    for (const area of fromAreas) {
        for (const file of listSourceFiles(area)) {
            const text = readFileSync(file, 'utf8');
            const specs = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
            for (const spec of specs) {
                const target = importedArea(area, spec);
                if (target !== null && forbidden.includes(target)) {
                    bad.push(`${file} -> ${spec}`);
                }
            }
        }
    }
    return bad;
}

describe('tsconfig layer direction', () => {
    it('foundation modules never import services or app modules', () => {
        expect(violations(FOUNDATION, [...SERVICES, ...APP])).toEqual([]);
    });

    it('services modules never import app modules', () => {
        expect(violations(SERVICES, [...APP])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/architecture/tsconfig-layers.test.ts`
Expected: FAIL - the foundation test lists `src/utils/nsfwDetection.ts` importing `../queue/queue.js`, `../queue/jobs/nsfwAnalyze.js`, `../queue/nsfwClient.js`, and `src/utils/integrationPoller.ts` importing `../queue/nonceStore.js`.

- [ ] **Step 3: Commit**

```bash
git add tests/architecture/tsconfig-layers.test.ts
git commit -m "test(architecture): add layer-direction fitness test pinning the three-layer build graph"
```

### Task 2: Move queue-coupled utils into services layer

**Files:**
- Move: `src/utils/nsfwDetection.ts` -> `src/queue/nsfwDetection.ts`
- Move: `src/utils/integrationPoller.ts` -> `src/queue/integrationPoller.ts`
- Modify: `src/plugins/automod/commands/automod/scan.ts`, `src/plugins/automod/commands/scanMessage.ts`, `src/plugins/automod/events/messageCreate.ts`, `src/plugins/integrations/plugin.ts` (import paths only)

**Interfaces:**
- Consumes: Task 1 test.
- Produces: `src/queue/nsfwDetection.ts` and `src/queue/integrationPoller.ts` with identical exports; no symbol changes.

- [ ] **Step 1: Move the files**

```bash
git mv src/utils/nsfwDetection.ts src/queue/nsfwDetection.ts
git mv src/utils/integrationPoller.ts src/queue/integrationPoller.ts
```

- [ ] **Step 2: Fix intra-file import depths**

Both files sat one level under `src/`, and `src/queue/` is also one level under `src/`, so only their `../queue/...` imports collapse. In `src/queue/nsfwDetection.ts` change:

```ts
import { createQueue, JobNames } from './queue.js';
import { buildNsfwJobId, NSFW_DEDUPE_TTL_MS } from './jobs/nsfwAnalyze.js';
import { analyzeImageGrpc, isRustWorkerAvailable, getCircuitBreakerStatus, resetCircuitBreaker } from './nsfwClient.js';
```

In `src/queue/integrationPoller.ts` change:

```ts
import { NonceStore } from './nonceStore.js';
```

Leave every other relative import (`../utils/logger.js`, `../config/config.js`, etc.) unchanged - depth is identical.

- [ ] **Step 3: Update the four importers**

In `src/plugins/automod/commands/automod/scan.ts` line 4:

```ts
import { checkMessageAttachments } from '../../../../queue/nsfwDetection.js';
```

In `src/plugins/automod/commands/scanMessage.ts` line 6:

```ts
import { checkMessageAttachments, formatNsfwPredictions } from '../../../queue/nsfwDetection.js';
```

In `src/plugins/automod/events/messageCreate.ts` lines 6-7:

```ts
import { checkMessageAttachments, isNsfwDetectionAvailable } from '../../../queue/nsfwDetection.js';
import { enqueueNsfwAnalysis } from '../../../queue/nsfwDetection.js';
```

In `src/plugins/integrations/plugin.ts` lines 4-5:

```ts
import { initIntegrationPoller, stopIntegrationPoller } from '../../queue/integrationPoller.js';
import type { IntegrationConfig } from '../../queue/integrationPoller.js';
```

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "utils/nsfwDetection\|utils/integrationPoller" src/ --include="*.ts"`
Expected: no output.

- [ ] **Step 5: Run architecture test to verify it passes**

Run: `pnpm vitest run tests/architecture/tsconfig-layers.test.ts tests/plugins/automod tests/plugins/integrations tests/utils/metrics.test.ts`
Expected: PASS, 0 failures.

- [ ] **Step 6: Run typecheck baseline**

Run: `pnpm typecheck 2>&1 | grep -c "error TS"`
Expected: exactly `77`.

- [ ] **Step 7: Commit**

```bash
git add src/queue/nsfwDetection.ts src/queue/integrationPoller.ts src/plugins/automod src/plugins/integrations/plugin.ts
git commit -m "refactor(queue): move nsfwDetection and integrationPoller into queue to keep the layer graph acyclic"
```

### Task 3: Three-layer composite build graph

**Files:**
- Create: `tsconfig.foundation.json`, `tsconfig.services.json`, `tsconfig.app.json`
- Modify: `tsconfig.build.json` (becomes solution root), `package.json` (`build` script), `tsconfig.json` (references), `tsconfig.test.json` (drop inert references)
- Delete: `tsconfig.admin.json`, `tsconfig.cli.json`, `tsconfig.config.json`, `tsconfig.core.json`, `tsconfig.db.json`, `tsconfig.gateway.json`, `tsconfig.i18n.json`, `tsconfig.observability.json`, `tsconfig.plugins.json`, `tsconfig.queue.json`, `tsconfig.types.json`, `tsconfig.utils.json`
- Keep untouched: `tsconfig.generated.json`, `tsconfig.docker.json`

**Interfaces:**
- Consumes: Task 2 acyclic graph.
- Produces: `pnpm build` = `tsc --build tsconfig.build.json` emitting today's `dist/` layout; layer names `foundation`, `services`, `app` referenced by the Task 1 test and docs.

- [ ] **Step 1: Create the three layer configs**

`tsconfig.foundation.json`:

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "composite": true,
        "noEmit": false,
        "rootDir": "./src",
        "outDir": "./dist",
        "declaration": true,
        "declarationMap": true,
        "skipLibCheck": true,
        "incremental": true,
        "tsBuildInfoFile": "./.cache/tsbuildinfo/foundation.tsbuildinfo"
    },
    "include": [
        "src/types/**/*",
        "src/config/**/*",
        "src/i18n/**/*",
        "src/observability/**/*",
        "src/utils/**/*",
        "src/db/**/*"
    ],
    "exclude": ["src/handlers/**"],
    "references": [
        { "path": "./tsconfig.generated.json" }
    ]
}
```

`tsconfig.services.json`:

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "composite": true,
        "noEmit": false,
        "rootDir": "./src",
        "outDir": "./dist",
        "declaration": true,
        "declarationMap": true,
        "skipLibCheck": true,
        "incremental": true,
        "tsBuildInfoFile": "./.cache/tsbuildinfo/services.tsbuildinfo"
    },
    "include": [
        "src/core/**/*",
        "src/queue/**/*",
        "src/gateway/**/*"
    ],
    "exclude": ["src/handlers/**"],
    "references": [
        { "path": "./tsconfig.foundation.json" },
        { "path": "./tsconfig.generated.json" }
    ]
}
```

`tsconfig.app.json`:

```json
{
    "extends": "./tsconfig.json",
    "compilerOptions": {
        "composite": true,
        "noEmit": false,
        "rootDir": "./src",
        "outDir": "./dist",
        "declaration": true,
        "declarationMap": true,
        "skipLibCheck": true,
        "incremental": true,
        "tsBuildInfoFile": "./.cache/tsbuildinfo/app.tsbuildinfo"
    },
    "include": [
        "src/*.ts",
        "src/plugins/**/*",
        "src/admin/**/*",
        "src/cli/**/*"
    ],
    "exclude": ["src/handlers/**"],
    "references": [
        { "path": "./tsconfig.foundation.json" },
        { "path": "./tsconfig.services.json" },
        { "path": "./tsconfig.generated.json" }
    ]
}
```

- [ ] **Step 2: Make tsconfig.build.json a solution root**

Replace the entire content of `tsconfig.build.json` with:

```json
{
    "files": [],
    "references": [
        { "path": "./tsconfig.foundation.json" },
        { "path": "./tsconfig.services.json" },
        { "path": "./tsconfig.app.json" }
    ]
}
```

- [ ] **Step 3: Switch the build script**

In `package.json` change:

```json
"build": "tsc --build tsconfig.build.json",
```

- [ ] **Step 4: Rewire the remaining tsconfigs**

In `tsconfig.json` replace the 13-entry `references` array with:

```json
    "references": [
        { "path": "./tsconfig.foundation.json" },
        { "path": "./tsconfig.services.json" },
        { "path": "./tsconfig.app.json" }
    ]
```

In `tsconfig.test.json` delete the entire `references` block (it is inert under `--noEmit` with `include: ["src/**/*", "tests/**/*", ...]`).

- [ ] **Step 5: Delete the stale per-area configs**

```bash
git rm tsconfig.admin.json tsconfig.cli.json tsconfig.config.json tsconfig.core.json tsconfig.db.json tsconfig.gateway.json tsconfig.i18n.json tsconfig.observability.json tsconfig.plugins.json tsconfig.queue.json tsconfig.types.json tsconfig.utils.json
```

- [ ] **Step 6: Clean-room build**

Run: `rm -rf dist .cache/tsbuildinfo && pnpm build`
Expected: exit 0. Then run `ls dist/index.js dist/worker.js dist/core/EventBus.js dist/queue/nonceStore.js dist/generated/nsfw/v1/nsfw.js` and expect every path to exist (identical layout to the old single-pass build).

- [ ] **Step 7: Incremental rebuild check**

Run: `pnpm build` again immediately.
Expected: exit 0 with no recompilation output (up-to-date via tsbuildinfo), demonstrating the incremental win.

- [ ] **Step 8: Gate checks**

Run: `pnpm exec tsc --noEmit -p tsconfig.generated.json && echo PROTO_OK`
Expected: `PROTO_OK`.
Run: `pnpm exec tsc -p tsconfig.docker.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`.
Run: `pnpm typecheck 2>&1 | grep -c "error TS"`
Expected: exactly `77`.
Run: `pnpm lint 2>&1 | grep -cE " error "`
Expected: `19` (all pre-existing warning-severity lines whose rule names contain the word "error"; zero error-severity lines).
Run: `pnpm vitest run tests/architecture/tsconfig-layers.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add tsconfig.foundation.json tsconfig.services.json tsconfig.app.json tsconfig.build.json package.json tsconfig.json tsconfig.test.json
git commit -m "build: replace inert per-area tsconfigs with a three-layer composite tsc --build graph"
```

### Task 4: Docs and full verification

**Files:**
- Modify: `README.md` (Build row in the scripts table, around line 239), `INSTALLATION.md` (line 284), `codemap.md` and `src/core/codemap.md` (only if they name per-area tsconfigs)

**Interfaces:**
- Consumes: Tasks 1-3 complete.
- Produces: synchronized docs; verified branch.

- [ ] **Step 1: Update README build row**

Change the Build row to:

```markdown
| Build | `pnpm build` | `tsc --build tsconfig.build.json` into `dist/` via the three-layer composite graph (`foundation` -> `services` -> `app`) |
```

- [ ] **Step 2: Update INSTALLATION build sentence**

Rewrite line 284 to:

```markdown
`pnpm build` runs `tsc --build tsconfig.build.json`, compiling the `foundation`, `services` and `app` composite projects into `dist/`. Containers and process managers must run `dist/index.js`, not `src/index.ts`.
```

- [ ] **Step 3: Sweep codemaps**

Run: `grep -rn "tsconfig\." codemap.md src/core/codemap.md docs/architecture/ 2>/dev/null`
Update any row or bullet that names a deleted per-area config to name the three layer configs instead. If there are no matches, change nothing.

- [ ] **Step 4: Full verification**

Run: `pnpm lint 2>&1 | grep -cE " error "` - expected `19` (pre-existing warning rule names, zero error-severity lines).
Run: `pnpm typecheck 2>&1 | grep -c "error TS"` - expected exactly `77`.
Run: `pnpm test 2>&1 | tail -5` - expected `2090 passed | 13 skipped` or better, 0 failures.
Run: `pnpm vitest run tests/architecture/` - expected all green (26 prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add README.md INSTALLATION.md codemap.md src/core/codemap.md
git commit -m "docs: describe the three-layer tsc --build graph"
```
