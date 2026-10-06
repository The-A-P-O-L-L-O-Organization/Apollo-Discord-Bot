# services/interlink/

## Responsibility
Go ConnectRPC relay for trusted bot-to-bot delivery with at-most-once semantics, backed by Redis state.

## Files

| File | Purpose |
|---|---|
| `main.go` | Relay entrypoint wiring flags, logging, health/metrics endpoints, Redis, auth, and telemetry. |
| `go.mod` | Go module definition and dependency requirements for the relay. |
| `go.sum` | Pinned dependency checksums for reproducible relay builds. |
| `Dockerfile` | Multi-stage build producing the static distroless relay image (port 50052). |
| `internal/auth/auth.go` | Enforces HMAC-SHA256 signatures with timestamp skew and nonce replay protection. |
| `internal/auth/auth_test.go` | Tests for signature verification, skew, and replay rejection. |
| `internal/registry/registry.go` | Redis-backed bot presence registry (register/heartbeat/unregister/list). |
| `internal/registry/registry_test.go` | Tests for registry presence lifecycle. |
| `internal/ratelimit/ratelimit.go` | Per-bot token-bucket rate limiter. |
| `internal/ratelimit/ratelimit_test.go` | Tests for rate-limit allow/deny behavior. |
| `internal/server/server.go` | ConnectRPC service handlers (Send/Subscribe/Connect/register flows). |
| `internal/server/interceptor.go` | Auth and rate-limit interceptors for incoming RPCs. |
| `internal/server/server_test.go` | Tests for server handler behavior. |
| `internal/telemetry/telemetry.go` | OpenTelemetry tracing and Prometheus metrics setup for the relay. |
| `testharness/main.go` | Test-only hermetic relay backed by in-process miniredis for Node integration tests. |
| `gen/go/interlink/interlink.pb.go` | Generated Go message types for the interlink contract (never hand-edit). |
| `gen/go/interlink/interlinkv1connect/interlink.connect.go` | Generated Go ConnectRPC handlers for the interlink contract (never hand-edit). |

## Design
- `main.go` wires flags and environment, zerolog logging, Prometheus `/healthz` and metrics endpoints, Redis registry, rate limiting, auth interceptors, and OTel telemetry.
- `internal/auth/` enforces HMAC-SHA256 signatures with timestamp skew and nonce replay protection; trust groups require JWT material of at least 32 chars with mTLS and Ed25519 bot identity kept distinct per group.
- `internal/registry/`, `internal/ratelimit/`, `internal/server/`, and `internal/telemetry/` own presence, per-bot token buckets, Connect handlers, and tracing; `gen/go/` holds generated Protobuf code.
- Own Go module with multi-stage `Dockerfile` building a static binary onto distroless nonroot, exposing port 50052 with no shell healthcheck.
- Patterns: Middleware/Interceptor (auth and rate-limit interceptors on incoming RPCs), Registry (Redis-backed bot presence), Token Bucket (per-bot rate limiter).

## Flow
1. Relay starts after `INTERLINK_AUTH_KEY` is validated, connecting to Redis and initializing telemetry.
2. Bots register with public key, endpoint, and capabilities; heartbeats maintain presence.
3. `Send`, `Subscribe`, and bidirectional `Connect` move `Envelope` messages between registered bots.
4. Auth and rate-limit interceptors reject unknown, replayed, skewed, or over-limit traffic; delivery is at-most-once so callers must not assume remote success without confirmation.

## Integration
- Depends on Redis for registry and nonce state plus OTLP and Prometheus endpoints for observability.
- Pairs with `protos/interlink/v1/interlink.proto` and TypeScript clients in `src/generated/`; plain HTTP `/healthz` is probed from the orchestrator side.
- Runtime configuration comes from `INTERLINK_GRPC_ADDR`, `INTERLINK_REDIS_URL`, `INTERLINK_AUTH_KEY`, rate and burst flags, and OTLP endpoint variables.
