# Interlink Go Service — Orchestrator Execution Prompt

## Context
You are the **Orchestrator** for the Apollo Discord Bot project. Execute the **Interlink Go Service** implementation plan located at:

**`docs/superpowers/plans/2026-09-19-interlink-go-service.md`**

This plan has been reviewed and fixed. All reviewer/verifier blockers have been addressed.

## Goal
Replace the existing Express-based Interlink HTTP server with a Go ConnectRPC service featuring HMAC-SHA256 auth, Redis-backed nonce replay protection, rate limiting, and bot registry — consumed by a Node.js ConnectRPC client.

## Plan Structure (7 Tasks)
| Task | Description | Key Deliverables |
|------|-------------|------------------|
| 1 | Protobuf Contract | `protos/interlink/v1/interlink.proto`, `buf.yaml`, `buf.gen.go.yaml`, `buf.gen.ts.yaml` |
| 2 | Go ConnectRPC Server | `services/interlink/` with OTLP+Prometheus telemetry, HMAC auth, `RedisNonceStore`, in-memory + Redis rate limit, Redis registry, all 7 service methods implemented, stream auth on every message |
| 3 | Docker & Compose | Multi-stage `Dockerfile.interlink` (distroless), `docker-compose.yml` with `multi` profile, 2 replicas, `/healthz` |
| 4 | Node.js ConnectRPC Client | `src/interlink/client.ts` with `@connectrpc/connect-node`, `@noble/hashes` HMAC (no Web Crypto), canonical string matching Go exactly |
| 5 | CI/CD | `.github/workflows/ci.yml` — Go jobs (golangci-lint, test, build), `buf`/`grpcurl` install, Docker buildx |
| 6 | Integration Tests | `tests/interlink.integration.test.ts` — register, heartbeat, list, streaming, auth, rate limit |
| 7 | Express Cleanup | Archive `src/plugins/interlink/server.ts`, remove pub/sub from `redis.ts`, remove `express`, `compression`, `helmet` deps |

## Key Technical Decisions (Fixed in Plan)
- **Protobuf location:** `protos/interlink/v1/interlink.proto` (shared root)
- **Code generation:** `buf generate` via `buf.gen.go.yaml` (Go + ConnectRPC) and `buf.gen.ts.yaml` (TypeScript + ConnectRPC)
- **Auth:** HMAC-SHA256 with 5-min timestamp skew + Redis nonce replay protection (SETNX with TTL)
- **Rate limit:** In-memory token bucket per bot (single-replica) + Redis-backed for multi-replica (planned)
- **Registry:** Redis-backed with 2-min heartbeat TTL, JSON serialization
- **Stream auth:** **Every message authenticated** via `streamInterceptor` (not just first)
- **Canonical string:** `method\npath\ntimestamp\nnonce\nbodyHash` — **identical** on Go and Node
- **Node crypto:** `@noble/hashes` HMAC-SHA256 (works on Node 18+, no `crypto.subtle`)
- **Config path:** `src/config/index.ts` (existing config)
- **Docker profile:** All new services in `multi` profile
- **Go module:** `services/interlink/go.mod` (isolated)

## Subagent Delegation Strategy
| Phase | Subagent | Scope |
|-------|----------|-------|
| 1 | `@fixer` | Protobuf contract + buf configs (bounded, mechanical) |
| 2 | `@fixer` | Go server — telemetry, auth, nonce, rate limit, registry, all 7 methods, interceptors |
| 3 | `@fixer` | Dockerfile + docker-compose updates |
| 4 | `@fixer` | Node.js ConnectRPC client + auth interceptor (bounded) |
| 5 | `@fixer` | CI workflow modifications |
| 6 | `@explorer` + `@fixer` | Integration tests (explore existing patterns) |
| 7 | `@fixer` | Express cleanup (mechanical removal) |

## Verification Gates (Run After Each Task)
```bash
# Task 1: Protobuf
buf generate
buf lint

# Task 2: Go server
cd services/interlink && go build && go test ./...
golangci-lint run

# Task 3: Docker
docker compose -f docker-compose.yml --profile multi build interlink
docker compose -f docker-compose.yml --profile multi up -d interlink
grpcurl -plaintext localhost:50052 interlink.v1.InterlinkService/ListBots

# Task 4: Node client
pnpm lint && pnpm test -- tests/interlinkClient.test.ts

# Task 5: CI
# Push to trigger GitHub Actions; verify all jobs pass

# Task 6: Integration tests
pnpm test tests/interlink.integration.test.ts

# Task 7: Cleanup
pnpm lint && pnpm test && go build ./services/interlink
```

## Constraints & Conventions
- **pnpm only** — never `npm`/`npx`
- **ESM only** — `import`/`export`, `"type": "module"`
- **Lint:** `pnpm lint` (ESLint), `golangci-lint run` (Go)
- **Test:** `pnpm test` (Vitest), `go test ./...`
- **No emojis** in source or docs
- **No code comments** unless explicitly requested
- **Formatters:** JS/TS → `biome` (fallback `prettier`); Go → `gofmt`/`goimports`
- **Go:** `CGO_ENABLED=0`, modules only, no CGO

## Environment Prerequisites
- `.env` with `DISCORD_TOKEN`, `REDIS_URL`, `INTERLINK_AUTH_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- Redis running (for nonce store, registry, rate limit)
- `buf` and `grpcurl` installed (`pnpm dlx @bufbuild/buf@latest`, `go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest`)
- Go 1.23+ toolchain

## Execution Instructions
1. **Read the full plan first** — understand all 7 tasks and dependencies
2. **Execute sequentially** — Task 1 must complete before 2 & 4; 2–3 before 6
3. **Delegate to subagents** as mapped above; synthesize results
4. **Run verification gates** after each task; do not proceed on failure
5. **After Task 6 (integration tests pass)**, spawn `@reviewer` for read-only review, then `@verifier` for lint/test
6. **Only after verification passes**, execute Task 7 cleanup

## Critical Implementation Details (From Fixed Plan)

### Go Server — Auth Verifier (services/interlink/auth/verifier.go)
```go
// computeSignature — MUST match Node client exactly
canonical := strings.Join([]string{method, path, timestamp, nonce, bodyHash}, "\n")
mac := hmac.New(sha256.New, v.secretKey)
mac.Write([]byte(canonical))
return mac.Sum(nil)
```

### Node Client — Auth Interceptor (src/interlink/client.ts)
```typescript
private createCanonicalString(req, timestamp, nonce): string {
  // Match Go server EXACTLY:
  const method = req.method;
  const path = req.method;
  const bodyHash = this.hashPayload(req.message?.payload);
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
}

private sign(message: string): string {
  const key = new TextEncoder().encode(this.authKey);
  const msg = new TextEncoder().encode(message);
  return bytesToHex(hmac(sha256, key, msg)); // @noble/hashes
}
```

### RedisNonceStore (services/interlink/auth/nonce_redis.go)
```go
func (r *RedisNonceStore) CheckAndSet(ctx context.Context, nonce string, ttl time.Duration) (bool, error) {
  key := NonceKeyPrefix + nonce
  result, err := r.client.SetNX(ctx, key, "1", ttl).Result()
  return result, err  // true = new nonce, false = replay detected
}
```

### Stream Interceptor — Authenticates EVERY Message
```go
for conn.Receive(ctx) {
  msg := conn.Msg()
  authenticatedBotID, err := s.auth.Verify(ctx, connect.NewRequest(msg))
  // ... handle auth failure, register stream on first message
  // Background goroutine re-authenticates each incoming message
}
```

## Runbook
- **Health:** `grpcurl -plaintext localhost:50052 interlink.v1.InterlinkService/ListBots`
- **Metrics:** `curl localhost:9090/metrics` (Prometheus)
- **Logs:** `docker compose logs -f interlink`
- **Debug auth:** Check `X-Interlink-Timestamp`, `X-Interlink-Nonce`, `Authorization: HMAC-SHA256 <sig>` headers

---

**Start by reading the plan file in full, then begin Task 1.**