# Phase 6: TypeScript Hygiene & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden TypeScript type safety, add runtime contract validation at service boundaries, enable cross-service distributed tracing, and reduce Discord.js memory footprint.

**Architecture:** Five independent tasks that can be executed in any order. Each task adds one observability/safety layer with its own test cycle. No task depends on another's interfaces.

**Tech Stack:** TypeScript 5.x, ESLint flat config, Vitest, Zod 3.x, OpenTelemetry SDK, Discord.js v14, pnpm.

**Spec:** This plan implements the "Recommended Next Steps" from the technical debt detection guide.

---

## Global Constraints

- **Node.js:** 22 LTS (pinned in `.nvmrc`, Docker, CI)
- **Package Manager:** pnpm only (workspace)
- **Module System:** ESM only (`"type": "module"`)
- **Code Style:** 4-space indent, single quotes, semicolons, no trailing commas, `eqeqeq`, `curly: all`
- **No emojis** in source or docs
- **No code comments** unless explicitly requested
- **Tests:** Vitest, placed in `tests/unit/` or `tests/integration/`
- **Lint:** ESLint flat config (`eslint.config.js`), `pnpm lint`
- **Coverage:** Excludes `src/index.js`, `src/handlers/**`, `tests/mocks/**`

---

## Review Focus

| Input Class / Failure Mode | Expected Behavior | Test Location |
|---------------------------|-------------------|---------------|
| `any` type used in new source file | ESLint error (not warning) on `no-explicit-any` | `tests/unit/eslint-rules.test.ts` |
| Floating promise in async handler | ESLint error on `no-floating-promises` | `tests/unit/eslint-rules.test.ts` |
| Invalid Interlink payload received | Zod validation throws before handler executes | `tests/integration/interlink-validation.test.ts` |
| Missing trace headers in Interlink RPC | OpenTelemetry context propagates across TS→Go/Rust boundary | `tests/integration/otel-trace.test.ts` |
| `messageCacheLifetime` not set to 0/1 | Discord client options enforce ≤1 second | `tests/unit/discord-client-config.test.ts` |

---

### Task 1: Enable Stricter Lint Rules for New Code

**Files:**
- Modify: `eslint.config.js` (add strict rules for new files)
- Create: `tests/unit/eslint-rules.test.ts`
- Modify: `.github/workflows/ci.yml` (ensure lint runs on new files)

**Interfaces:**
- Consumes: Existing ESLint flat config structure
- Produces: Stricter rule configuration that applies to `src/**/*.ts` (not test files)

- [ ] **Step 1: Write failing test for stricter rules**

```typescript
// tests/unit/eslint-rules.test.ts
import { describe, it, expect } from 'vitest'
import { Linter } from 'eslint'
import eslintConfig from '../../eslint.config.js'

describe('ESLint stricter rules for new code', () => {
  const linter = new Linter()
  linter.defineRules(eslintConfig.rules)

  it('errors on explicit any in source files', () => {
    const code = `const x: any = 1`
    const messages = linter.verify(code, {
      ...eslintConfig,
      filename: 'src/test.ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    })
    expect(messages.some(m => m.ruleId === 'no-explicit-any')).toBe(true)
  })

  it('errors on floating promises', () => {
    const code = `Promise.resolve().then(x => console.log(x))`
    const messages = linter.verify(code, {
      ...eslintConfig,
      filename: 'src/test.ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    })
    expect(messages.some(m => m.ruleId === 'no-floating-promises')).toBe(true)
  })

  it('errors on unnecessary type assertion', () => {
    const code = `const x = "hello" as string`
    const messages = linter.verify(code, {
      ...eslintConfig,
      filename: 'src/test.ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    })
    expect(messages.some(m => m.ruleId === '@typescript-eslint/no-unnecessary-type-assertion')).toBe(true)
  })

  it('allows any in test files', () => {
    const code = `const x: any = 1`
    const messages = linter.verify(code, {
      ...eslintConfig,
      filename: 'tests/unit/test.ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    })
    expect(messages.some(m => m.ruleId === 'no-explicit-any')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/eslint-rules.test.ts
# Expected: FAIL - rules not yet configured
```

- [ ] **Step 3: Update eslint.config.js with stricter rules**

```javascript
// eslint.config.js - ADD to the rules section for source files

// Find the rule configuration for TypeScript files and add:
{
  'no-explicit-any': ['error', { ignoreRestArgs: true }],
  'no-floating-promises': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  '@typescript-eslint/no-explicit-any': ['error', { ignoreRestArgs: true }]
}

// Apply only to src/**/*.ts (not tests)
// Use overrides or separate config object for src/
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/eslint-rules.test.ts
# Expected: PASS
```

- [ ] **Step 5: Run full lint to verify no new errors in existing code (or only in test files)**

```bash
pnpm lint 2>&1 | head -100
# Expected: Errors only in test files or pre-existing, not in new source files
```

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js tests/unit/eslint-rules.test.ts
git commit -m "lint: enable stricter rules for new source files (no-explicit-any, no-floating-promises, no-unnecessary-type-assertion)"
```

---

### Task 2: Add Zod Runtime Contract Validation at Interlink Boundary

**Files:**
- Create: `src/plugins/interlink/validation.ts`
- Modify: `src/plugins/interlink/connectClient.ts` (add validation to RPC calls)
- Create: `tests/integration/interlink-validation.test.ts`
- Modify: `package.json` (add zod dependency)

**Interfaces:**
- Consumes: `InterlinkClient` from `connectClient.ts`, protobuf-generated types
- Produces: `validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T` and `validateResponse<T>(schema: z.ZodSchema<T>, data: unknown): T`

- [ ] **Step 1: Write failing test for validation**

```typescript
// tests/integration/interlink-validation.test.ts
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { validateRequest, validateResponse } from '../../src/plugins/interlink/validation.js'

const TestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  count: z.number().int().positive()
})

describe('Interlink Zod validation', () => {
  it('validates correct request payload', () => {
    const payload = { id: '550e8400-e29b-41d4-a716-446655440000', name: 'test', count: 5 }
    const result = validateRequest(TestSchema, payload)
    expect(result).toEqual(payload)
  })

  it('rejects invalid request payload (missing required field)', () => {
    const payload = { name: 'test', count: 5 } // missing id
    expect(() => validateRequest(TestSchema, payload)).toThrow()
  })

  it('rejects invalid request payload (wrong type)', () => {
    const payload = { id: 'not-uuid', name: 'test', count: 'five' }
    expect(() => validateRequest(TestSchema, payload)).toThrow()
  })

  it('validates correct response payload', () => {
    const payload = { success: true, data: { id: '550e8400-e29b-41d4-a716-446655440000', value: 42 } }
    const ResponseSchema = z.object({ success: z.boolean(), data: z.object({ id: z.string().uuid(), value: z.number() }) })
    const result = validateResponse(ResponseSchema, payload)
    expect(result).toEqual(payload)
  })

  it('rejects malformed response', () => {
    const payload = { success: 'yes', data: null }
    const ResponseSchema = z.object({ success: z.boolean(), data: z.object({ id: z.string(), value: z.number() }) })
    expect(() => validateResponse(ResponseSchema, payload)).toThrow()
  })

  it('includes path in error message for debugging', () => {
    const payload = { items: [{ id: 123 }] }
    const Schema = z.object({ items: z.array(z.object({ id: z.string() })) })
    try {
      validateRequest(Schema, payload)
    } catch (e) {
      expect(e.message).toContain('items.0.id')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/integration/interlink-validation.test.ts
# Expected: FAIL - validation module not created
```

- [ ] **Step 3: Add zod dependency**

```bash
pnpm add zod
```

- [ ] **Step 4: Create validation module**

```typescript
// src/plugins/interlink/validation.ts
import { z, ZodError, ZodSchema } from 'zod'

export class ValidationError extends Error {
  public readonly issues: ZodError['issues']
  constructor(message: string, issues: ZodError['issues']) {
    super(message)
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export function validateRequest<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = `Request validation failed: ${formatIssues(result.error.issues)}`
    throw new ValidationError(message, result.error.issues)
  }
  return result.data
}

export function validateResponse<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const message = `Response validation failed: ${formatIssues(result.error.issues)}`
    throw new ValidationError(message, result.error.issues)
  }
  return result.data
}

function formatIssues(issues: ZodError['issues']): string {
  return issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
}

// Common schemas for Interlink RPC
export const InterlinkSchemas = {
  // Define schemas matching protobuf definitions
  HealthCheckRequest: z.object({ service: z.string() }),
  HealthCheckResponse: z.object({ status: z.enum(['healthy', 'degraded', 'unhealthy']), details: z.record(z.string()).optional() }),
  CommandRequest: z.object({ command: z.string(), args: z.record(z.unknown()).optional(), correlationId: z.string().uuid() }),
  CommandResponse: z.object({ success: z.boolean(), result: z.unknown().optional(), error: z.string().optional(), correlationId: z.string().uuid() })
} as const
```

- [ ] **Step 5: Integrate validation into connectClient.ts**

```typescript
// src/plugins/interlink/connectClient.ts - MODIFY InterlinkClient class

// ADD import:
import { validateRequest, validateResponse, InterlinkSchemas, ValidationError } from './validation.js'

// In callUnary method, wrap request/response:
async callUnary<TReq, TRes>(method: string, request: TReq, requestSchema: ZodSchema<TReq>, responseSchema: ZodSchema<TRes>): Promise<TRes> {
  const validatedRequest = validateRequest(requestSchema, request)
  const response = await this.client[method](validatedRequest)
  return validateResponse(responseSchema, response)
}

// Update existing call sites to pass schemas
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm test tests/integration/interlink-validation.test.ts
# Expected: PASS
```

- [ ] **Step 7: Commit**

```bash
git add src/plugins/interlink/validation.ts src/plugins/interlink/connectClient.ts tests/integration/interlink-validation.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add Zod runtime validation at Interlink boundary"
```

---

### Task 3: Add OpenTelemetry for Cross-Service Tracing

**Files:**
- Create: `src/observability/otel.ts`
- Modify: `src/index.ts` (initialize OTel at startup)
- Modify: `src/plugins/interlink/connectClient.ts` (add trace headers to RPC)
- Create: `tests/integration/otel-trace.test.ts`
- Modify: `package.json` (add OpenTelemetry dependencies)

**Interfaces:**
- Consumes: `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`
- Produces: `initializeOtel()` function, `getTracer()` function, trace context propagation helpers

- [ ] **Step 1: Write failing test for OTel initialization**

```typescript
// tests/integration/otel-trace.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { trace, context, propagation } from '@opentelemetry/api'
import { initializeOtel, getTracer, injectTraceContext, extractTraceContext } from '../../src/observability/otel.js'

describe('OpenTelemetry tracing', () => {
  beforeAll(() => {
    initializeOtel({ serviceName: 'apollo-test', endpoint: 'http://localhost:4318/v1/traces' })
  })

  afterAll(async () => {
    await trace.getTracerProvider().shutdown()
  })

  it('initializes tracer provider', () => {
    const tracer = getTracer('test')
    expect(tracer).toBeDefined()
    expect(typeof tracer.startActiveSpan).toBe('function')
  })

  it('creates spans with attributes', () => {
    const tracer = getTracer('test')
    const span = tracer.startSpan('test-operation', { 'test.attr': 'value' })
    expect(span.spanContext().traceId).toBeDefined()
    span.end()
  })

  it('injects trace context into carrier', () => {
    const carrier: Record<string, string> = {}
    const ctx = trace.setSpan(context.active(), trace.wrapSpanContext({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }))
    injectTraceContext(ctx, carrier)
    expect(carrier['traceparent']).toBeDefined()
    expect(carrier['traceparent']).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/)
  })

  it('extracts trace context from carrier', () => {
    const carrier = { traceparent: '00-a'.repeat(32)+'-b'.repeat(16)+'-01' }
    const ctx = extractTraceContext(carrier)
    const spanContext = trace.getSpanContext(ctx)
    expect(spanContext?.traceId).toBe('a'.repeat(32))
    expect(spanContext?.spanId).toBe('b'.repeat(16))
  })

  it('propagates context through async boundaries', async () => {
    const tracer = getTracer('test')
    const parentSpan = tracer.startSpan('parent')
    const ctx = trace.setSpan(context.active(), parentSpan)

    await context.with(ctx, async () => {
      const childSpan = tracer.startSpan('child')
      expect(trace.getSpanContext(context.active())?.traceId).toBe(parentSpan.spanContext().traceId)
      childSpan.end()
    })
    parentSpan.end()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/integration/otel-trace.test.ts
# Expected: FAIL - otel module not created
```

- [ ] **Step 3: Add OpenTelemetry dependencies**

```bash
pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions
```

- [ ] **Step 4: Create OTel initialization module**

```typescript
// src/observability/otel.ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { trace, context, propagation, SpanStatusCode, Span } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'

let initialized = false

export interface OtelConfig {
  serviceName: string
  serviceVersion?: string
  endpoint?: string
}

export function initializeOtel(config: OtelConfig): void {
  if (initialized) return

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.serviceVersion || 'unknown'
    })
  })

  if (config.endpoint) {
    const exporter = new OTLPTraceExporter({ url: config.endpoint })
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
  }

  provider.register({ propagator: new W3CTraceContextPropagator() })

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new GrpcInstrumentation()
    ],
    tracerProvider: provider
  })

  initialized = true
}

export function getTracer(name: string) {
  return trace.getTracer(name)
}

export function injectTraceContext(ctx: context.Context, carrier: Record<string, string>): void {
  propagation.inject(ctx, carrier)
}

export function extractTraceContext(carrier: Record<string, string | string[] | undefined>): context.Context {
  return propagation.extract(context.active(), carrier)
}

export function startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  return getTracer('apollo').startSpan(name, { attributes })
}

export function withTraceContext<T>(ctx: context.Context, fn: () => Promise<T>): Promise<T> {
  return context.with(ctx, fn)
}
```

- [ ] **Step 5: Initialize OTel in src/index.ts**

```typescript
// src/index.ts - ADD at top after dotenv/config import
import { initializeOtel } from './observability/otel.js'

// ADD after startup checks, before bot login:
if (process.env.OTEL_ENDPOINT) {
  initializeOtel({
    serviceName: 'apollo-bot',
    serviceVersion: process.env.APP_VERSION || 'dev',
    endpoint: process.env.OTEL_ENDPOINT
  })
}
```

- [ ] **Step 6: Add trace headers to Interlink RPC**

```typescript
// src/plugins/interlink/connectClient.ts - MODIFY callUnary

import { injectTraceContext, getTracer } from '../../observability/otel.js'

async callUnary<TReq, TRes>(method: string, request: TReq, requestSchema: ZodSchema<TReq>, responseSchema: ZodSchema<TRes>): Promise<TRes> {
  const validatedRequest = validateRequest(requestSchema, request)
  
  // Add trace context to metadata
  const carrier: Record<string, string> = {}
  injectTraceContext(context.active(), carrier)
  
  const metadata = new Metadata()
  if (carrier.traceparent) metadata.add('traceparent', carrier.traceparent)
  if (carrier.tracestate) metadata.add('tracestate', carrier.tracestate)
  
  const response = await this.client[method](validatedRequest, metadata)
  return validateResponse(responseSchema, response)
}
```

- [ ] **Step 7: Run test to verify it passes**

```bash
pnpm test tests/integration/otel-trace.test.ts
# Expected: PASS
```

- [ ] **Step 8: Commit**

```bash
git add src/observability/otel.ts src/index.ts src/plugins/interlink/connectClient.ts tests/integration/otel-trace.test.ts package.json pnpm-lock.yaml
git commit -m "feat: add OpenTelemetry distributed tracing with W3C trace context"
```

---

### Task 4: Set messageCacheLifetime: 0 in Discord Client Options

**Files:**
- Modify: `src/index.ts` (Discord client options)
- Create: `tests/unit/discord-client-config.test.ts`

**Interfaces:**
- Consumes: Discord.js `ClientOptions`
- Produces: Client configured with `messageCacheLifetime: 0`

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/discord-client-config.test.ts
import { describe, it, expect } from 'vitest'
import { createBotClient } from '../../src/index.js' // or wherever client is created

describe('Discord client configuration', () => {
  it('sets messageCacheLifetime to 0 or 1', () => {
    const client = createBotClient() // or inspect the client options directly
    expect(client.options.messageCacheLifetime).toBeLessThanOrEqual(1)
    expect(client.options.messageCacheLifetime).toBeGreaterThanOrEqual(0)
    client.destroy()
  })

  it('does not use default unlimited cache (-1)', () => {
    const client = createBotClient()
    expect(client.options.messageCacheLifetime).not.toBe(-1)
    client.destroy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/discord-client-config.test.ts
# Expected: FAIL - client options not set or test needs adjustment
```

- [ ] **Step 3: Update Discord client options in src/index.ts**

```typescript
// src/index.ts - FIND client creation and modify options

const client = new Client({
  intents: [...],
  // ADD:
  messageCacheLifetime: 0,
  messageCacheMaxSize: 0,
  messageSweepInterval: 60,
  // Optional: disable other caches
  presenceCacheLifetime: 0,
  userCacheLifetime: 0
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/discord-client-config.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/unit/discord-client-config.test.ts
git commit -m "fix: set messageCacheLifetime to 0 to prevent unbounded message cache"
```

---

### Task 5: Run Churn Analysis to Identify Hot Spots

**Files:**
- Create: `scripts/churn-analysis.sh`
- Create: `docs/architecture/churn-report.md` (output)

**Interfaces:**
- Consumes: Git history
- Produces: Ranked list of most-changed files

- [ ] **Step 1: Create churn analysis script**

```bash
# scripts/churn-analysis.sh
#!/usr/bin/env bash
set -euo pipefail

# Analyze git churn for the last 6 months
SINCE="6 months ago"
OUTPUT="docs/architecture/churn-report.md"

mkdir -p docs/architecture

echo "# Git Churn Analysis (last 6 months)" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "Generated: $(date)" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "## Top 20 Most Changed Files" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Rank | Changes | File |" >> "$OUTPUT"
echo "|------|---------|------|" >> "$OUTPUT"

git log --since="$SINCE" --pretty=format: --name-only \
  | grep -v '^$' \
  | sort \
  | uniq -c \
  | sort -rn \
  | head -20 \
  | awk '{print "| " NR " | " $1 " | " substr($0, index($0,$2)) " |"}' >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Files Changed >10 Times (Potential Hot Spots)" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| Changes | File |" >> "$OUTPUT"
echo "|---------|------|" >> "$OUTPUT"

git log --since="$SINCE" --pretty=format: --name-only \
  | grep -v '^$' \
  | sort \
  | uniq -c \
  | awk '$1 > 10 {print "| " $1 " | " substr($0, index($0,$2)) " |"}' \
  | sort -rn >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "## Analysis Complete" >> "$OUTPUT"
echo "Review files with high churn for: technical debt, missing tests, coupling, or architectural issues." >> "$OUTPUT"

cat "$OUTPUT"
```

- [ ] **Step 2: Make script executable and run**

```bash
chmod +x scripts/churn-analysis.sh
./scripts/churn-analysis.sh
```

- [ ] **Step 3: Review output and document findings**

```bash
cat docs/architecture/churn-report.md
# Identify top 5 files needing attention
```

- [ ] **Step 4: Commit script and report**

```bash
git add scripts/churn-analysis.sh docs/architecture/churn-report.md
git commit -m "chore: add churn analysis script and initial report"
```

---

## Execution Order

```
Task 1: Stricter lint (independent, 30 min)
Task 2: Zod validation (independent, 45 min)
Task 3: OpenTelemetry (independent, 60 min)
Task 4: Discord cache fix (independent, 15 min)
Task 5: Churn analysis (independent, 10 min)
```

**Total estimated time:** ~2.5 hours

---

## Post-Phase Verification

```bash
# All new tests
pnpm test tests/unit/eslint-rules.test.ts tests/integration/interlink-validation.test.ts tests/integration/otel-trace.test.ts tests/unit/discord-client-config.test.ts

# Full test suite
pnpm test

# Lint (should be clean for new code)
pnpm lint

# Verify Discord cache setting
grep -r "messageCacheLifetime" src/

# Verify OTel initialization
grep -r "initializeOtel" src/
```

---

## Notes

- **Task 1 (lint)**: Apply stricter rules only to `src/**/*.ts` — keep test files permissive for mocks. Use ESLint overrides.
- **Task 2 (Zod)**: Define schemas matching protobuf exactly. Use `z.infer<typeof Schema>` for type inference.
- **Task 3 (OTel)**: Requires OTLP endpoint (Jaeger, Tempo, or collector). In CI, use `jaegertracing/all-in-one` service container.
- **Task 4 (cache)**: `messageCacheLifetime: 0` disables caching entirely. Use `1` if you need recent message access.
- **Task 5 (churn)**: Run quarterly. High churn + low test coverage = refactoring priority.