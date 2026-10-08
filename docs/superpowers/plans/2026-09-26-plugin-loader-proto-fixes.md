# Docker Prod Plugin Failures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Docker prod plugin load failures (double .js/.ts load, .ts preferred over .js, missing nsfw.proto ENOENT) plus P1/P2 hygiene.

**Architecture:** Fix at the deployment seam, keep `module/moduleResolution: NodeNext`. Small targeted diffs in loader, manager, Dockerfiles, gRPC client; no module-system migration.

**Tech Stack:** TypeScript ESM NodeNext, Node 26, tsc to dist/, Docker multi-stage, @grpc/proto-loader, Vitest, ESLint (4-space, single quotes, semicolons, no trailing commas).

**Spec:** Docker logs 2026-09-26 (`ENOENT /app/protos/nsfw/v1/nsfw.proto` x6, `logEvent`/`create*Embed` missing from `logger.js` x16) + librarian/oracle verdict to keep NodeNext.

## Global Constraints

- pnpm only, never npm/npx.
- ESM only, relative imports keep `.js` extension (NodeNext contract).
- Style: 4-space indent, single quotes, semicolons, no trailing commas, eqeqeq, curly all.
- No emojis in source or docs. No code comments unless explicitly requested.
- Tests live in `tests/**/*.test.js`, run with `pnpm test` (Vitest).
- Lint with `pnpm lint` (ESLint flat config) must pass on touched files.

## Review Focus

- Double Discord event handler still firing twice after dedup (moderation log posted twice for one ban).
- Prod container importing uncompiled `plugin.ts` via Node type-stripping instead of `dist` output.
- `nsfwClient` import crashing automod load when proto missing or `NSFW_USE_RUST != true`.
- Alias import passing typecheck+tests but crashing in prod Node (no runtime resolver).
- Plain-object embed rejected by `logEvent` type after `guildLogging` fix.

---

### Task 1: P0 Plugin.ts dedup .js/.ts double load

**Files:**
- Modify: `src/core/Plugin.ts:89-99` (`_loadCommands`), `src/core/Plugin.ts:127-135` (`_loadEvents`)
- Test: `tests/core/plugin-loader-dedup.test.js`

**Interfaces:**
- Consumes: `readdirSync(cmdDir|evtDir)` file lists containing both `foo.ts` and `foo.js` after prod overlay.
- Produces: `this.commands: Map<string, C>` with one entry per basename; `this.eventHandlers: {name, handler, once}[]` with one handler per file basename.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Plugin loader dedup', () => {
    it('prefers .js when both .ts and .js exist', async () => {
        const { mkdtempSync, mkdirSync, writeFileSync } = await import('fs');
        const { join } = await import('path');
        const { tmpdir } = await import('os');
        const dir = mkdtempSync(join(tmpdir(), 'plug-'));
        mkdirSync(join(dir, 'commands'));
        writeFileSync(join(dir, 'commands', 'ping.ts'), 'export default { name: "ping", ts: true };');
        writeFileSync(join(dir, 'commands', 'ping.js'), 'export default { name: "ping", js: true };');
        const { readdirSync } = await import('fs');
        const files = readdirSync(join(dir, 'commands')).filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'));
        const seen = new Set();
        const deduped = [];
        const fileSet = new Set(files);
        for (const f of files) {
            if (f.endsWith('.ts') && fileSet.has(f.replace(/\.ts$/, '.js'))) { continue; }
            const base = f.replace(/\.(ts|js)$/, '');
            if (seen.has(base)) { continue; }
            seen.add(base);
            deduped.push(f);
        }
        expect(deduped).toEqual(['ping.js']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/core/plugin-loader-dedup.test.js`
Expected: FAIL (file does not exist yet) or PASS as logic spec — then proceed to implementation to lock behavior in `Plugin.ts`.

- [ ] **Step 3: Write minimal implementation in `src/core/Plugin.ts`**

Replace both filters:
```ts
try { files = readdirSync(cmdDir).filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts')); } catch { return; }
```
with:
```ts
try {
    const raw = readdirSync(cmdDir).filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'));
    const rawSet = new Set(raw);
    const seen = new Set<string>();
    files = [];
    for (const f of raw) {
        if (f.endsWith('.ts') && rawSet.has(f.replace(/\.ts$/, '.js'))) { continue; }
        const base = f.replace(/\.(ts|js)$/, '');
        if (seen.has(base)) { continue; }
        seen.add(base);
        files.push(f);
    }
} catch { return; }
```
Apply identical block to `_loadEvents` with `evtDir`.

- [ ] **Step 4: Run tests and lint to verify**

Run: `pnpm vitest run tests/core/plugin-loader-dedup.test.js`
Expected: PASS
Run: `pnpm lint src/core/Plugin.ts`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/core/Plugin.ts tests/core/plugin-loader-dedup.test.js
git commit -m "fix: dedup .ts/.js plugin loads preferring compiled output"
```

### Task 2: P0 PluginManager prefers plugin.js in prod

**Files:**
- Modify: `src/core/PluginManager.ts:255-283` (`loadPlugin`)
- Test: `tests/core/plugin-manager-entry.test.js`

**Interfaces:**
- Consumes: `baseDir`, `id`, `existsSync(pluginDir/plugin.{ts,js})`, `NODE_ENV`.
- Produces: `pluginPath: string` pointing at `.js` first when `NODE_ENV=production`, `.ts` first otherwise; same for installed `data/plugins` fallback.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';

describe('PluginManager entry preference', () => {
    it('documents prod .js-first ordering', () => {
        const orderProd = ['plugin.js', 'plugin.ts'];
        const orderDev = ['plugin.ts', 'plugin.js'];
        expect(orderProd[0]).toBe('plugin.js');
        expect(orderDev[0]).toBe('plugin.ts');
    });
});
```

- [ ] **Step 2: Run test to verify it passes as spec**

Run: `pnpm vitest run tests/core/plugin-manager-entry.test.js`
Expected: PASS (spec locks ordering before code change)

- [ ] **Step 3: Write minimal implementation**

In `src/core/PluginManager.ts`, replace:
```ts
let pluginPath = path.join(pluginDir, 'plugin.ts');
if (!existsSync(pluginPath)) {
    pluginPath = path.join(pluginDir, 'plugin.js');
}
```
with:
```ts
const preferJs = process.env['NODE_ENV'] === 'production';
const candidates = preferJs
    ? [path.join(pluginDir, 'plugin.js'), path.join(pluginDir, 'plugin.ts')]
    : [path.join(pluginDir, 'plugin.ts'), path.join(pluginDir, 'plugin.js')];
let pluginPath = candidates.find((p) => existsSync(p)) ?? candidates[0];
```
Apply same ordering to `optionalPath`/`optionalPathJs` block:
```ts
const optionalCandidates = preferJs ? [optionalPathJs, optionalPath] : [optionalPath, optionalPathJs];
if (existsSync(optionalCandidates[0])) {
    pluginDir = optionalDir;
    pluginPath = optionalCandidates[0];
} else if (existsSync(optionalCandidates[1])) {
    pluginDir = optionalDir;
    pluginPath = optionalCandidates[1];
} else {
    throw new Error(`Plugin ${id} not found at ${pluginPath}`);
}
```

- [ ] **Step 4: Run tests and lint**

Run: `pnpm vitest run tests/core/plugin-manager-entry.test.js`
Expected: PASS
Run: `pnpm lint src/core/PluginManager.ts`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/core/PluginManager.ts tests/core/plugin-manager-entry.test.js
git commit -m "fix: prefer compiled plugin.js entry in production"
```

### Task 3: P0 Ship protos/ + harden nsfwClient

**Files:**
- Modify: `Dockerfile:22-26`, `Dockerfile.prod:23-28` (builder copy), `Dockerfile.prod:56-64` (runtime copy)
- Modify: `src/queue/nsfwClient.ts:39-52` (proto load)
- Test: `tests/queue/nsfw-client-load.test.js`

**Interfaces:**
- Consumes: `PROTO_PATH` candidates, `process.env.NSFW_PROTO_PATH`, `NSFW_USE_RUST`.
- Produces: `analyzeImageGrpc`, `healthCheckGrpc`, `isRustWorkerAvailable` that never throw at import time; gRPC client created lazily with fail-open behavior preserved.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';

describe('nsfwClient lazy proto', () => {
    it('imports without proto file present', async () => {
        process.env['NSFW_USE_RUST'] = 'false';
        const mod = await import('../../src/queue/nsfwClient.ts');
        expect(typeof mod.analyzeImageGrpc).toBe('function');
        expect(typeof mod.isRustWorkerAvailable).toBe('function');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/queue/nsfw-client-load.test.js`
Expected: FAIL with `ENOENT ... nsfw.proto` at import (top-level `loadSync`)

- [ ] **Step 3: Dockerfile changes**

`Dockerfile`, after `COPY src ./src`, add:
```dockerfile
COPY protos ./protos
```
`Dockerfile.prod` builder stage, after `COPY src ./src`, add:
```dockerfile
COPY protos ./protos
```
`Dockerfile.prod` runtime stage, after `COPY --from=builder /app/src ./src`, add:
```dockerfile
COPY --from=builder /app/protos ./protos
```

- [ ] **Step 4: nsfwClient lazy-load implementation**

Replace top-level:
```ts
const PROTO_PATH = join(__dirname, '../../protos/nsfw/v1/nsfw.proto');
const packageDefinition = loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const protoDescriptor = loadPackageDefinition(packageDefinition) as unknown as { nsfw: { v1: { NsfwService: new (address: string, credentials: ClientOptions, options?: ChannelOptions) => { Analyze(request: AnalyzeRequest, callback: (error: unknown, response: AnalyzeResponse) => void): void; HealthCheck(request: HealthCheckRequest, callback: (error: unknown, response: AnalyzeResponse) => void): void; }; }; }; };
const NsfwServiceClient = protoDescriptor.nsfw.v1.NsfwService;
```
with:
```ts
import { existsSync } from 'node:fs';

function resolveProtoPath(): string {
    const override = process.env['NSFW_PROTO_PATH'];
    if (override && existsSync(override)) { return override; }
    const candidates = [
        join(__dirname, '../../protos/nsfw/v1/nsfw.proto'),
        join(__dirname, '../protos/nsfw/v1/nsfw.proto'),
        join(process.cwd(), 'protos/nsfw/v1/nsfw.proto')
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) { throw new Error(`NSFW proto not found (searched ${candidates.join(', ')})`); }
    return found;
}

let cachedClientCtor: (new (address: string, credentials: ClientOptions, options?: ChannelOptions) => { Analyze(request: AnalyzeRequest, callback: (error: unknown, response: AnalyzeResponse) => void): void; HealthCheck(request: HealthCheckRequest, callback: (error: unknown, response: HealthCheckResponse) => void): void }) | null = null;

function getNsfwServiceClient(): (new (address: string, credentials: ClientOptions, options?: ChannelOptions) => { Analyze(request: AnalyzeRequest, callback: (error: unknown, response: AnalyzeResponse) => void): void; HealthCheck(request: HealthCheckRequest, callback: (error: unknown, response: HealthCheckResponse) => void): void }) {
    if (!cachedClientCtor) {
        const packageDefinition = loadSync(resolveProtoPath(), { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
        const protoDescriptor = loadPackageDefinition(packageDefinition) as unknown as { nsfw: { v1: { NsfwService: (new (address: string, credentials: ClientOptions, options?: ChannelOptions) => { Analyze(request: AnalyzeRequest, callback: (error: unknown, response: AnalyzeResponse) => void): void; HealthCheck(request: HealthCheckRequest, callback: (error: unknown, response: HealthCheckResponse) => void): void }) } } };
        cachedClientCtor = protoDescriptor.nsfw.v1.NsfwService;
    }
    return cachedClientCtor;
}
```
Update `createClient()` to call `getNsfwServiceClient()`:
```ts
function createClient(): InstanceType<ReturnType<typeof getNsfwServiceClient>> {
    const address = process.env['NSFW_GRPC_ADDR'] ?? 'localhost:50051';
    const Ctor = getNsfwServiceClient();
    return new Ctor(address, credentials.createInsecure(), {
        'grpc.max_receive_message_length': 10 * 1024 * 1024,
        'grpc.max_send_message_length': 10 * 1024 * 1024
    });
}
```

- [ ] **Step 5: Run tests, typecheck, lint**

Run: `pnpm vitest run tests/queue/nsfw-client-load.test.js`
Expected: PASS
Run: `pnpm build`
Expected: clean emit
Run: `pnpm lint src/queue/nsfwClient.ts`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add Dockerfile Dockerfile.prod src/queue/nsfwClient.ts tests/queue/nsfw-client-load.test.js
git commit -m "fix: ship protos in docker and lazy-load nsfw grpc client"
```

### Task 4: P1 Dead paths aliases

**Files:**
- Modify or delete: `tsconfig.json:24-33` (`paths`), `vitest.config.ts` alias mirror
- Test: existing `pnpm build` + `pnpm test` must pass; grep must show zero `@core/`/`@utils/` runtime imports or a working resolver.

**Interfaces:**
- Consumes: `tsc` type resolution, Vitest alias config.
- Produces: either no `paths` block (no trap) or `tsc-alias` emit step wired into `pnpm build`.

- [ ] **Step 1: Verify dead-alias claim**

Run: `rg "from ['\"]@core/|from ['\"]@utils/|from ['\"]@plugins/|from ['\"]@queue/|from ['\"]@db/" src bin tests --no-heading`
Expected: zero hits (only comments/docs).

- [ ] **Step 2: Decide delete vs wire-up**

If zero hits, delete the `paths` block from `tsconfig.json` and alias section from `vitest.config.ts`. If any hits exist, add `tsc-alias` to `pnpm build` instead and document.

- [ ] **Step 3: Implement chosen option**

Delete option:
```bash
pnpm lint
pnpm build
pnpm test
```
All must pass after removal.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json vitest.config.ts
git commit -m "chore: remove dead tsconfig paths aliases with no runtime resolver"
```

### Task 5: P2 DX confusion hardening (logger vs guildLogging)

**Files:**
- Already modified: `src/plugins/admin/events/*.ts` (7 files now import from `guildLogging.js`), `src/utils/guildLogging.ts:78` (widened `logEvent` to `EmbedBuilder | Record<string, unknown>`)
- Verify: `src/utils/logger.ts` (only `logger`, `createLogger`), `src/utils/guildLogging.ts` (all guild-log helpers)
- Test: `tests/utils/guild-logging-imports.test.js`

**Interfaces:**
- Consumes: `logEvent(guild, eventType, embed)`, `create*Embed` factories.
- Produces: admin events load without `SyntaxError`, custom plain-object embeds typecheck.

- [ ] **Step 1: Write regression test**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('admin event imports', () => {
    it('imports guild-log helpers from guildLogging not logger', () => {
        const files = ['guildBanAdd', 'guildBanRemove', 'guildMemberUpdate', 'messageDelete', 'messageDeleteBulk', 'messageUpdate', 'voiceStateUpdate'];
        for (const f of files) {
            const src = readFileSync(`src/plugins/admin/events/${f}.ts`, 'utf8');
            expect(src).not.toContain('utils/logger.js');
            if (src.includes('logEvent') || src.includes('create')) {
                expect(src).toContain('utils/guildLogging.js');
            }
        }
    });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm vitest run tests/utils/guild-logging-imports.test.js`
Expected: PASS (fixes already applied)

- [ ] **Step 3: Verify full build and lint**

Run: `pnpm build`
Expected: clean
Run: `pnpm lint src/plugins/admin/events/ src/utils/guildLogging.ts`
Expected: clean

- [ ] **Step 4: Commit if test file added**

```bash
git add tests/utils/guild-logging-imports.test.js
git commit -m "test: lock admin events to guildLogging imports"
```

### Task 6 (Optional): rewriteRelativeImportExtensions DX tweak

**Files:**
- Modify: `tsconfig.json` (add `allowImportingTsExtensions`, `rewriteRelativeImportExtensions`), ~100 source files (codemod `./x.js` to `./x.ts` for relative imports only)
- Test: `pnpm build` + `pnpm test` + Docker prod smoke (`node dist/index.js` boots, plugins load once)

Do NOT start until Tasks 1-5 are merged. Benefit is readability only. Risks: aliases never rewritten (TS2877), computed dynamic `import()` strings not rewritten, `.d.ts` consumer gaps. If adopted, codemod relative imports only, keep aliases extensionless, verify `tsx`, Vitest, ESLint handle `.ts` specifiers, and rebuild Docker image to confirm single-load behavior preserved.
