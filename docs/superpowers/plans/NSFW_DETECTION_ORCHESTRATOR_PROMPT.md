# NSFW Detection Rust Worker — Orchestrator Execution Prompt

## Context
You are the **Orchestrator** for the Apollo Discord Bot project. Execute the **NSFW Detection Rust Worker** implementation plan located at:

**`docs/superpowers/plans/2026-09-19-nsfw-detection-rust-worker.md`**

This plan has been reviewed and fixed. All reviewer/verifier blockers have been addressed.

## Goal
Implement a Rust gRPC service using ONNX Runtime (`ort` crate v2.0) to replace the existing TensorFlow.js NSFW detection, with a phased canary rollout.

## Plan Structure (9 Tasks)
| Task | Description | Key Deliverables |
|------|-------------|------------------|
| 1 | Protobuf Contract | `protos/nsfw/v1/nsfw.proto`, `buf.yaml`, `buf.gen.yaml`, root `Cargo.toml` workspace |
| 2 | Rust gRPC Server | `crates/nsfw-server/` with `ort` v2.0, `reqwest`, `num_cpus`, telemetry, `map_error_to_status`, `fetch_image`, `new_test()` |
| 3 | Model Conversion | Python script `scripts/convert_nsfw_model.py` (TFJS → ONNX via `tf2onnx`) |
| 4 | Node.js gRPC Client | `src/queue/nsfwClient.ts` with retry/backoff, `nice-grpc` + `@bufbuild/protobuf`, `buf` codegen |
| 5 | Docker & Compose | Multi-stage `Dockerfile.nsfw`, `docker-compose.yml` with `multi` profile, 2 replicas, `grpc_health_probe` |
| 6 | CI/CD | `.github/workflows/ci.yml` — Rust jobs (clippy, fmt, test, build), `buf`/`grpcurl` install, Docker buildx |
| 7 | Integration Tests + Benchmark | `tests/nsfw-fidelity.test.ts` (100+ images, F1 > 0.95), `benches/nsfw_bench.rs` (P99 < 100ms) |
| 8 | Canary Deployment | `USE_RUST_NSFW` feature flag, 10%→50%→100% rollout, rollback triggers, runbook |
| 9 | TFJS Cleanup | Remove `@tensorflow/tfjs-node`, `nsfwjs`, TFJS model assets after 100% verified |

## Key Technical Decisions (Fixed in Plan)
- **Protobuf location:** `protos/nsfw/v1/nsfw.proto` (shared root)
- **Code generation:** `buf generate` (not `tonic-build`) for multi-language (Rust via `protoc-gen-rust`, TypeScript via `@bufbuild/protobuf`)
- **Error handling:** `map_error_to_status` → proper gRPC codes; client retries on UNAVAILABLE/DEADLINE_EXCEEDED
- **Fail-open:** ONLY on codes 14, 4, 8 after retries exhausted
- **URL fetch:** Server-side via `reqwest` (10s timeout, 10MB limit)
- **Config path:** `src/config/config.ts` (not `index.ts`)
- **Docker profile:** All new services in `multi` profile
- **Model fidelity:** Per-class tolerance 0.1, maxConfidence 0.05 vs TFJS baseline

## Subagent Delegation Strategy
| Phase | Subagent | Scope |
|-------|----------|-------|
| 1–2 | `@fixer` | Protobuf contract + Rust server crate (bounded, mechanical) |
| 3 | `@fixer` | Python conversion script (standalone) |
| 4 | `@fixer` | Node.js gRPC client + buf config (bounded) |
| 5 | `@fixer` | Dockerfile + docker-compose updates |
| 6 | `@fixer` | CI workflow modifications |
| 7 | `@explorer` + `@fixer` | Integration tests (explore existing test patterns) + benchmark |
| 8 | `@oracle` | Canary strategy review before execution |
| 9 | `@fixer` | Cleanup (mechanical removal) |

## Verification Gates (Run After Each Task)
```bash
# Task 1–2: Rust
cd crates/nsfw-server && cargo check && cargo test

# Task 3: Model conversion
python scripts/convert_nsfw_model.py --verify

# Task 4: Node client
pnpm lint && pnpm test -- tests/nsfwClient.test.ts

# Task 5: Docker
docker compose -f docker-compose.yml --profile multi build nsfw-service
docker compose -f docker-compose.yml --profile multi up -d nsfw-service
grpcurl -plaintext localhost:50051 nsfw.v1.NsfwService/HealthCheck

# Task 6: CI
# Push to trigger GitHub Actions; verify all jobs pass

# Task 7: Tests
pnpm test tests/nsfw-fidelity.test.ts
cargo bench -p nsfw-server

# Task 8: Canary
# Deploy with USE_RUST_NSFW=10; monitor metrics; promote

# Task 9: Cleanup
pnpm lint && pnpm test && cargo check
```

## Constraints & Conventions
- **pnpm only** — never `npm`/`npx`
- **ESM only** — `import`/`export`, `"type": "module"`
- **Lint:** `pnpm lint` (ESLint flat config, 4-space indent, single quotes, semicolons)
- **Test:** `pnpm test` (Vitest, coverage excludes `src/index.js` and `src/handlers/**`)
- **No emojis** in source or docs
- **No code comments** unless explicitly requested
- **Formatters:** JS/TS → `biome` (fallback `prettier`); Rust → `rustfmt`

## Environment Prerequisites
- `.env` with `DISCORD_TOKEN`, `REDIS_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- Redis running (for BullMQ queue)
- `buf` and `grpcurl` installed (`pnpm dlx @bufbuild/buf@latest`, `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`)

## Execution Instructions
1. **Read the full plan first** — understand all 9 tasks and dependencies
2. **Execute sequentially** — Tasks 1–2 must complete before 3–4; 5–6 before 7–8
3. **Delegate to subagents** as mapped above; synthesize results
4. **Run verification gates** after each task; do not proceed on failure
5. **After Task 8 (canary 100%)**, spawn `@reviewer` for read-only review, then `@verifier` for lint/test
6. **Only after verification passes**, execute Task 9 cleanup

## Go/No-Go Criteria for Canary Promotion
| Stage | Criteria |
|-------|----------|
| 10% → 50% | P99 latency < 100ms, error rate < 0.1%, fidelity F1 > 0.95 on shadow traffic |
| 50% → 100% | 24h stable at 50%, no regressions, operator sign-off |
| Rollback | P99 > 200ms OR error rate > 1% OR fidelity F1 < 0.90 |

## Runbook Reference (Plan Task 8)
- **Rollback:** `USE_RUST_NSFW=0` + restart workers
- **Logs:** `docker compose logs -f nsfw-service`
- **Metrics:** Jaeger traces, Prometheus `nsfw_inference_duration_seconds_bucket`
- **Debug:** `grpcurl -plaintext localhost:50051 nsfw.v1.NsfwService/Analyze -d '{"image_data": "...", "threshold": 0.5}'`

---

**Start by reading the plan file in full, then begin Task 1.**