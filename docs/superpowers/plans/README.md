# Polyglot Architecture Implementation Plans Overview

This directory contains three implementation plans for selective polyglot adoption in Apollo Discord Bot, derived from the architecture analysis in `../../polyglot-architecture.md`.

## Plan Summary

| Plan | Component | Language | Protocol | Phase | Status | Effort |
|------|-----------|----------|----------|-------|--------|--------|
| `2026-09-19-nsfw-detection-rust-worker.md` | NSFW Detection Worker | Rust (`ort`) | gRPC | 2 | **Ready** | 2-3 weeks |
| `2026-09-19-interlink-go-service.md` | Interlink Bot-to-Bot RPC | Go (ConnectRPC) | gRPC/HTTP2 | 3 | **Ready** | 3-4 weeks |
| `2026-09-19-plugin-sandbox-wasm.md` | Plugin Sandbox | Rust (Wasmtime) | WASM Component Model | 4 | **Deferred** | 6-8 weeks |

## Execution Order

1. **NSFW Detection Worker** (Highest ROI, lowest risk)
   - Replaces `@tensorflow/tfjs-node` blocking inference
   - Enables GPU acceleration
   - Canary deploy behind feature flag
   - Full TFJS removal after validation

2. **Interlink Go Service** (Medium ROI, medium risk)
   - Replaces Express + Redis pub/sub
   - Binary protobuf, streaming, built-in auth/rate-limit
   - Sidecar deployment, gradual migration
   - Express deprecation after validation

3. **Plugin Sandbox** (High ROI, high risk - **Deferred**)
   - Requires Wasm Component Model maturity
   - Needs ecosystem demand (≥3 plugin authors)
   - Significant plugin author migration effort

## Shared Infrastructure (Prerequisites)

All plans require these foundation tasks (complete before Phase 2):

- [ ] **OpenTelemetry integration** across all services (Rust `opentelemetry-rust`, Node.js `@opentelemetry/sdk-node`)
- [ ] **Protobuf contract definitions** (`protos/` directory, `buf` generation)
- [ ] **Turborepo pipeline** with Rust/Go/Node.js tasks
- [ ] **Multi-stage Docker builds** for each language
- [ ] **CI/CD updates** (`.github/workflows/ci.yml` with `cargo`, `go`, `pnpm` jobs)
- [ ] **Observability stack** (Jaeger, Prometheus, Grafana dashboards)

## Go/No-Go Gates

### NSFW Detection Worker
- [ ] Prototype: ONNX model loads, inference < 50ms p99
- [ ] Canary: 10% → 50% → 100% traffic, zero regressions
- [ ] Benchmark: P99 < 100ms, memory < 200MB (vs 500ms/300MB TFJS)
- [ ] Cleanup: TFJS dependencies removed

### Interlink Go Service
- [ ] Prototype: gRPC streaming 10k msg/s, P99 < 5ms
- [ ] Auth: HMAC verification, replay protection, key rotation
- [ ] Rate limit: Token bucket per bot, burst handling
- [ ] Migration: Zero-downtime cutover from Express

### Plugin Sandbox (Deferred)
- [ ] Wasmtime 25+ stable `wasi-capabilities`
- [ ] `jco` 1.0+ full TypeScript support
- [ ] ≥3 plugin authors request Wasm target
- [ ] Security audit mandates stronger isolation

## Reviewer Focus Areas

For each plan, reviewers should verify:

1. **Spec Coverage**: Every requirement in `../../polyglot-architecture.md` has a task
2. **No Placeholders**: All steps contain actual code, not "TBD" or "implement later"
3. **Type Consistency**: Protobuf types match across Go/Rust/TypeScript
4. **Test Coverage**: Unit + integration + benchmark tests for each component
5. **Operational Readiness**: Health checks, graceful shutdown, config via env vars
6. **Rollback Plan**: Feature flags, canary steps, rollback triggers documented

## Execution Method Recommendation

**Subagent-driven development** for all three plans because:
- Tasks have clear interfaces (protobuf contracts) enabling independent work
- High risk of cross-language integration bugs requires independent review per task
- 30+ tasks across plans benefit from fresh context per task
- Mistake in gRPC contract or Wasm capability model would be costly

## Next Steps

1. Human review of all three plans
2. Confirm execution approach (subagent-driven recommended)
3. Execute foundation tasks (OTel, protobuf, Turborepo, CI)
4. Begin Plan 1 (NSFW Detection Worker) Task 1