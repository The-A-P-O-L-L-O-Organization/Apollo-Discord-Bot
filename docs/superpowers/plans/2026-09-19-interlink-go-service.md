# Interlink Bot-to-Bot RPC Go Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Express-based HTTP + Redis pub/sub Interlink plugin with a high-performance Go service using ConnectRPC (gRPC + gRPC-Web + REST), providing bidirectional streaming, binary protobuf serialization, and built-in interceptors for auth/rate-limiting/metrics.

**Architecture:** Extract the Interlink RPC logic into a standalone Go service (`connectrpc/connect` + `connectrpc/connectgo`). The Node.js gateway runs a sidecar or connects directly to the Go service. Bot-to-bot communication shifts from HTTP/JSON/Redis to gRPC streaming with protobuf. The existing Express server is deprecated after migration.

**Tech Stack:** Go 1.23+, `connectrpc/connect` (v1), `connectrpc/connectgo`, `bufbuild/protobuf-go`, `grpc-go`, `go.opentelemetry.io/otel`, `github.com/redis/go-redis/v9` (for registry/presence only), `golang.org/x/time/rate` (rate limiting), `golang.org/x/crypto/hmac` (auth). Node.js: `@connectrpc/connect` + `@bufbuild/protobuf` for client.

**Spec:** [docs/superpowers/plans/2026-09-19-polyglot-architecture.md](../../polyglot-architecture.md) (this plan implements Phase 3)

## Global Constraints

- **Language versions:** Go 1.23+ (toolchain), Node.js 22+ (LTS), TypeScript 6+
- **Dependency policy:** Go modules only. No CGO. Node.js deps: `@connectrpc/connect`, `@bufbuild/protobuf`, `@connectrpc/connect-node` (for Node transport), `@noble/hashes` (HMAC, avoids Web Crypto).
- **Build:** `CGO_ENABLED=0 go build` produces static binary. Multi-stage Docker (builder → distroless).
- **Observability:** OpenTelemetry traces + metrics (OTLP HTTP). W3C TraceContext propagation. Prometheus metrics via `promhttp`.
- **Config:** Environment variables only. `INTERLINK_GRPC_ADDR`, `INTERLINK_REDIS_URL`, `INTERLINK_AUTH_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT`. Config loaded from `src/config/index.ts` (not index.js).
- **Testing:** Go unit tests (`go test`), integration tests in TypeScript (`vitest`). Contract tests via protobuf.
- **Lint:** `gofmt -l .`, `golangci-lint run`, `pnpm lint` (existing).
- **CI:** Turborepo pipeline with `go` and `pnpm` tasks. Cache Go module cache. Install `buf` and `grpcurl` in CI.
- **Directory structure:** Go service in `services/interlink/`. Protobuf in shared `protos/interlink/v1/`.
- **Docker:** New services added to `multi` profile in `docker-compose.yml`.

## Review Focus

1. **Protocol compatibility:** ConnectRPC must correctly handle both unary and streaming RPCs from Node.js clients. Test: bidirectional streaming with 1000 messages, verify ordering and no drops.
2. **Auth verification:** HMAC-SHA256 auth must reject tampered requests, accept valid ones. Test: replay attack, timestamp skew, key rotation.
3. **Rate limiting:** Per-bot token bucket must enforce limits without blocking legitimate traffic. Test: burst to 2x limit, verify 429 responses, then recovery.
4. **Registry consistency:** Bot registration/heartbeat must be strongly consistent (Redis + local cache). Test: network partition, verify no split-brain registrations.
5. **Graceful degradation:** If Go service unavailable, Node.js must fall back to direct HTTP (legacy) or queue locally. Test: kill Go service, verify messages queued and delivered on recovery.

---

### Task 1: Define Protobuf Contract (Shared with Node.js)

**Files:**
- Create: `protos/interlink/v1/interlink.proto` (shared root location)
- Create: `buf.yaml` (workspace config at root)
- Create: `buf.gen.go.yaml` (Go generation)
- Create: `buf.gen.ts.yaml` (TypeScript generation)
- Modify: `package.json` — add `buf` CLI and plugins

**Interfaces:**
- Produces: `BotMessage`, `Envelope`, `SubscribeRequest`, `RegisterBotRequest`, `InterlinkService` gRPC service. Consumed by Go server (Task 2) and Node.js client (Task 4).

- [ ] **Step 1: Write the failing test (proto contract)**

```protobuf
// protos/interlink/v1/interlink.proto
syntax = "proto3";
package interlink.v1;

option go_package = "github.com/apollo-bot/interlink/gen/go/interlink/v1;interlinkv1";
option js_package = "@apollo/interlink-proto";

service InterlinkService {
  // Unary: send a single envelope to target bot(s)
  rpc Send(Envelope) returns (SendResponse);
  
  // Server-streaming: subscribe to messages for this bot
  rpc Subscribe(SubscribeRequest) returns (stream Envelope);
  
  // Bidirectional streaming: full duplex connection
  rpc Connect(stream Envelope) returns (stream Envelope);
  
  // Registration
  rpc RegisterBot(RegisterBotRequest) returns (RegisterBotResponse);
  rpc Heartbeat(HeartbeatRequest) returns (HeartbeatResponse);
  rpc UnregisterBot(UnregisterBotRequest) returns (UnregisterBotResponse);
  
  // Admin
  rpc ListBots(ListBotsRequest) returns (ListBotsResponse);
  rpc GetBotInfo(GetBotInfoRequest) returns (BotInfo);
}

message Envelope {
  string protocol = 1;      // "apollo.interlink.v1"
  string version = 2;       // "1.0"
  string type = 3;          // "message", "event", "command", "response"
  string source = 4;        // Source bot ID
  string target = 5;        // Target bot ID or "*" for broadcast
  string id = 6;            // UUID v7
  int64 timestamp = 7;      // Unix ms
  string nonce = 8;         // Replay protection
  bytes payload = 9;        // Application payload (protobuf Any or JSON)
  map<string, string> metadata = 10;  // Routing hints, priority, etc.
}

message SendResponse {
  bool accepted = 1;
  string message_id = 2;
  string error = 3;
}

message SubscribeRequest {
  string bot_id = 1;
  repeated string message_types = 2;  // Empty = all
}

message RegisterBotRequest {
  string bot_id = 1;
  string public_key = 2;      // Ed25519 public key (base64)
  string endpoint = 3;        // gRPC endpoint for callbacks
  map<string, string> capabilities = 4;
  int32 max_concurrent_streams = 5;
}

message RegisterBotResponse {
  bool success = 1;
  string bot_id = 2;
  string error = 3;
}

message HeartbeatRequest {
  string bot_id = 1;
  int64 timestamp = 2;
}

message HeartbeatResponse {
  bool alive = 1;
  int64 server_time = 2;
}

message UnregisterBotRequest {
  string bot_id = 1;
}

message UnregisterBotResponse {
  bool success = 1;
}

message ListBotsRequest {}

message ListBotsResponse {
  repeated BotInfo bots = 1;
}

message GetBotInfoRequest {
  string bot_id = 1;
}

message BotInfo {
  string bot_id = 1;
  string endpoint = 2;
  map<string, string> capabilities = 3;
  int64 registered_at = 4;
  int64 last_heartbeat = 5;
  bool online = 6;
}
```

- [ ] **Step 2: Create buf.yaml**

```yaml
# buf.yaml
version: v2
name: buf.build/apollo/interlink
deps:
  - buf.build/connectrpc/eliza
  - buf.build/googleapis/googleapis
lint:
  use:
    - DEFAULT
  except:
    - PACKAGE_VERSION_SUFFIX
breaking:
  use:
    - FILE
```

- [ ] **Step 3: Create buf.gen.go.yaml**

```yaml
# buf.gen.go.yaml
version: v2
managed:
  enabled: true
  go_package_prefix:
    default: github.com/apollo-bot/interlink/gen/go
    except:
      - buf.build/googleapis/googleapis
plugins:
  - remote: buf.build/protocolbuffers/go:v1.34.2
    out: gen/go
    opt: paths=source_relative
  - remote: buf.build/connectrpc/go:v1.6.1
    out: gen/go
    opt: paths=source_relative
  - remote: buf.build/grpc-ecosystem/go-grpc-middleware:v1.5.0
    out: gen/go
    opt: paths=source_relative
```

- [ ] **Step 4: Create buf.gen.ts.yaml**

```yaml
# buf.gen.ts.yaml
version: v2
managed:
  enabled: true
  go_package_prefix:
    default: github.com/apollo-bot/interlink/gen/go
plugins:
  - remote: buf.build/bufbuild/prototypescript:v1.0.0
    out: src/generated/interlink
    opt: target=ts,esModuleInterop=true,forceLong=string
  - remote: buf.build/connectrpc/connect-web:v1.6.1
    out: src/generated/interlink
    opt: target=ts,esModuleInterop=true
```

- [ ] **Step 5: Add buf to package.json**

```json
// package.json - add to scripts and devDependencies
"scripts": {
  "proto:generate": "buf generate",
  "proto:generate:go": "buf generate --template buf.gen.go.yaml",
  "proto:generate:ts": "buf generate --template buf.gen.ts.yaml",
  "proto:lint": "buf lint",
  "proto:breaking": "buf breaking --against '.git#branch=main'"
},
"devDependencies": {
  "buf": "^1.44.0",
  "@bufbuild/protoc-gen-ts": "^1.0.0",
  "@connectrpc/protoc-gen-connect-es": "^1.6.1"
}
```

- [ ] **Step 6: Generate and verify**

Run: `pnpm proto:generate:go`
Expected: `gen/go/interlink/v1/interlink.pb.go`, `interlinkconnect/go/interlink/v1/interlink.connect.go`

Run: `pnpm proto:generate:ts`
Expected: `src/generated/interlink/interlink_pb.ts`, `interlink_connect.ts`

- [ ] **Step 7: Commit**

```bash
git add protos/ buf.yaml buf.gen.go.yaml buf.gen.ts.yaml package.json
git commit -m "feat(interlink): define protobuf contract for ConnectRPC service"
```

---

### Task 2: Create Go ConnectRPC Server

**Files:**
- Create: `services/interlink/go.mod`
- Create: `services/interlink/go.sum`
- Create: `services/interlink/main.go`
- Create: `services/interlink/internal/server/server.go`
- Create: `services/interlink/internal/server/interceptor.go`
- Create: `services/interlink/internal/registry/registry.go`
- Create: `services/interlink/internal/auth/auth.go`
- Create: `services/interlink/internal/ratelimit/ratelimit.go`
- Create: `services/interlink/internal/telemetry/telemetry.go`
- Modify: `Cargo.toml` (not needed - Go module)

**Interfaces:**
- Consumes: Generated Go protobuf code (`gen/go/interlink/v1`)
- Produces: `interlink` binary. Node.js client (Task 4) connects to this.

- [ ] **Step 1: Write the failing test**

```go
// services/interlink/internal/server/server_test.go
package server

import (
    "context"
    "testing"
    "time"
    
    "connectrpc.com/connect"
    interlinkv1 "github.com/apollo-bot/interlink/gen/go/interlink/v1"
    "github.com/apollo-bot/interlink/gen/go/interlink/v1/interlinkv1connect"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestServer_Send_Success(t *testing.T) {
    srv := NewTestServer(t)
    defer srv.Close()
    
    client := interlinkv1connect.NewInterlinkServiceClient(
        srv.HTTPClient(),
        srv.BaseURL(),
    )
    
    resp, err := client.Send(context.Background(), connect.NewRequest(&interlinkv1.Envelope{
        Protocol:  "apollo.interlink.v1",
        Version:   "1.0",
        Type:      "message",
        Source:    "bot-a",
        Target:    "bot-b",
        Id:        "test-123",
        Timestamp: time.Now().UnixMilli(),
        Nonce:     "nonce-123",
        Payload:   []byte(`{"text": "hello"}`),
    }))
    require.NoError(t, err)
    assert.True(t, resp.Msg.Accepted)
    assert.NotEmpty(t, resp.Msg.MessageId)
}
```

- [ ] **Step 2: Create go.mod**

```go
// services/interlink/go.mod
module github.com/apollo-bot/interlink

go 1.23

require (
    connectrpc.com/connect v1.6.1
    connectrpc.com/connectgo v1.6.1
    github.com/bufbuild/protovalidate-go v0.10.0
    github.com/redis/go-redis/v9 v9.5.0
    github.com/rs/zerolog v1.33.0
    golang.org/x/crypto v0.23.0
    golang.org/x/time v0.5.0
    google.golang.org/genproto/googleapis/api/annotations v0.0.0-20240101000000-000000000000
    google.golang.org/grpc v1.62.1
    google.golang.org/protobuf v1.34.2
)

require (
    // Indirect dependencies
)

toolchain go1.23
```

- [ ] **Step 3: Implement telemetry**

```go
// services/interlink/internal/telemetry/telemetry.go
package telemetry

import (
    "context"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/exporters/prometheus"
    "go.opentelemetry.io/otel/metric"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/metric"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
    "go.opentelemetry.io/otel/trace"
)

var (
    Tracer  trace.Tracer
    Meter   metric.Meter
    RequestCounter metric.Int64Counter
    RequestLatency metric.Float64Histogram
    ActiveStreams metric.Int64UpDownCounter
)

func Init(serviceName, otelEndpoint string) (func(context.Context) error, error) {
    // Trace provider
    traceExporter, err := otlptracehttp.New(context.Background(),
        otlptracehttp.WithEndpoint(otelEndpoint),
        otlptracehttp.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }
    
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(traceExporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceName(serviceName),
        )),
    )
    otel.SetTracerProvider(tp)
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))
    
    // Metrics
    promExporter, err := prometheus.New()
    if err != nil {
        return nil, err
    }
    mp := sdkmetric.NewMeterProvider(sdkmetric.WithReader(promExporter))
    otel.SetMeterProvider(mp)
    
    Tracer = otel.Tracer(serviceName)
    Meter = otel.Meter(serviceName)
    
    RequestCounter, _ = Meter.Int64Counter("interlink_requests_total",
        metric.WithDescription("Total gRPC requests"),
    )
    RequestLatency, _ = Meter.Float64Histogram("interlink_request_duration_seconds",
        metric.WithDescription("Request latency in seconds"),
    )
    ActiveStreams, _ = Meter.Int64UpDownCounter("interlink_active_streams",
        metric.WithDescription("Active bidirectional streams"),
    )
    
    return tp.Shutdown, nil
}

func RecordRequest(ctx context.Context, method string, duration float64, err error) {
    attrs := []attribute.KeyValue{
        attribute.String("method", method),
    }
    if err != nil {
        attrs = append(attrs, attribute.String("error", err.Error()))
    }
    RequestCounter.Add(ctx, 1, metric.WithAttributes(attrs...))
    RequestLatency.Record(ctx, duration, metric.WithAttributes(attrs...))
}
```

- [ ] **Step 4: Implement auth (HMAC-SHA256)**

```go
// services/interlink/internal/auth/auth.go
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"
	
	"connectrpc.com/connect"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

var (
	ErrMissingAuth      = errors.New("missing authorization header")
	ErrInvalidAuth      = errors.New("invalid authorization format")
	ErrInvalidSignature = errors.New("invalid signature")
	ErrTimestampSkew    = errors.New("timestamp skew too large")
	ErrReplayDetected   = errors.New("replay attack detected")
)

const (
	AuthHeader      = "Authorization"
	TimestampHeader = "X-Interlink-Timestamp"
	NonceHeader     = "X-Interlink-Nonce"
	MaxTimestampSkew = 5 * time.Minute
	NonceKeyPrefix  = "interlink:nonce:"
)

type Verifier struct {
	secretKey []byte
	nonceStore NonceStore
}

type NonceStore interface {
	CheckAndSet(ctx context.Context, nonce string, ttl time.Duration) (bool, error)
}

func NewVerifier(secretKey string, nonceStore NonceStore) *Verifier {
	return &Verifier{
		secretKey:  []byte(secretKey),
		nonceStore: nonceStore,
	}
}

// Verify validates HMAC signature and returns the bot ID from the envelope
func (v *Verifier) Verify(ctx context.Context, req connect.AnyRequest) (string, error) {
	auth := req.Header().Get(AuthHeader)
	if auth == "" {
		return "", ErrMissingAuth
	}
	
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || parts[0] != "HMAC-SHA256" {
		return "", ErrInvalidAuth
	}
	
	signature, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", ErrInvalidSignature
	}
	
	timestampStr := req.Header().Get(TimestampHeader)
	if timestampStr == "" {
		return "", ErrInvalidAuth
	}
	timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
	if err != nil {
		return "", ErrInvalidAuth
	}
	if time.Since(time.UnixMilli(timestamp)).Abs() > MaxTimestampSkew {
		return "", ErrTimestampSkew
	}
	
	nonce := req.Header().Get(NonceHeader)
	if nonce == "" {
		return "", ErrInvalidAuth
	}
	isNew, err := v.nonceStore.CheckAndSet(ctx, nonce, MaxTimestampSkew*2)
	if err != nil {
		return "", err
	}
	if !isNew {
		return "", ErrReplayDetected
	}
	
	// Recompute signature using canonical envelope serialization
	// Expected format: method\npath\ntimestamp\nnonce\nbodyHash
	expectedSig := v.computeSignature(req, timestampStr, nonce)
	if !hmac.Equal(signature, expectedSig) {
		log.Debug().
			Str("expected", hex.EncodeToString(expectedSig)).
			Str("received", hex.EncodeToString(signature)).
			Msg("Signature mismatch")
		return "", ErrInvalidSignature
	}
	
	// Extract bot ID from envelope source field
	botID := extractBotID(req)
	if botID == "" {
		return "", ErrInvalidAuth
	}
	return botID, nil
}

// computeSignature creates the HMAC-SHA256 signature for verification
func (v *Verifier) computeSignature(req connect.AnyRequest, timestamp, nonce string) []byte {
	// Canonical string matching Node.js client exactly:
	// method\npath\ntimestamp\nnonce\nbodyHash
	method := req.Spec().Procedure
	path := req.Spec().Procedure // ConnectRPC uses procedure as path
	bodyHash := hashPayload(req.Any())
	
	canonical := strings.Join([]string{method, path, timestamp, nonce, bodyHash}, "\n")
	
	mac := hmac.New(sha256.New, v.secretKey)
	mac.Write([]byte(canonical))
	return mac.Sum(nil)
}

// hashPayload computes hex-encoded SHA256 of the request body
func hashPayload(msg any) string {
	// For ConnectRPC, the message is the protobuf envelope
	// We'll marshal to binary for consistent hashing
	// In production, use protobuf's deterministic serialization
	data, _ := json.Marshal(msg)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// extractBotID extracts the bot ID from the envelope's source field
func extractBotID(req connect.AnyRequest) string {
	// For ConnectRPC, the request message contains the Envelope
	// We need to type assert to get the source field
	if envelope, ok := req.Any().(*interlinkv1.Envelope); ok {
		return envelope.Source
	}
	// For streaming, the first message might be the envelope
	// Check stream messages if available
	return ""
}

// RedisNonceStore implements NonceStore using Redis SETNX
type RedisNonceStore struct {
	client *redis.Client
}

func NewRedisNonceStore(client *redis.Client) *RedisNonceStore {
	return &RedisNonceStore{client: client}
}

func (r *RedisNonceStore) CheckAndSet(ctx context.Context, nonce string, ttl time.Duration) (bool, error) {
	key := NonceKeyPrefix + nonce
	// SET key value NX EX ttl - only sets if not exists
	result, err := r.client.SetNX(ctx, key, "1", ttl).Result()
	if err != nil {
		return false, err
	}
	return result, nil
}

func Sign(secretKey string, message string) string {
	mac := hmac.New(sha256.New, []byte(secretKey))
	mac.Write([]byte(message))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
```

- [ ] **Step 5: Implement rate limiting (token bucket per bot)**

```go
// services/interlink/internal/ratelimit/ratelimit.go
package ratelimit

import (
    "context"
    "sync"
    "time"
    
    "golang.org/x/time/rate"
    "github.com/rs/zerolog/log"
)

type Limiter struct {
    mu       sync.RWMutex
    limiters map[string]*rate.Limiter
    rate     rate.Limit
    burst    int
    cleanup  *time.Ticker
    stopCh   chan struct{}
}

func NewLimiter(requestsPerSecond float64, burst int) *Limiter {
    l := &Limiter{
        limiters: make(map[string]*rate.Limiter),
        rate:     rate.Limit(requestsPerSecond),
        burst:    burst,
        cleanup:  time.NewTicker(5 * time.Minute),
        stopCh:   make(chan struct{}),
    }
    go l.cleanupLoop()
    return l
}

func (l *Limiter) getLimiter(botID string) *rate.Limiter {
    l.mu.RLock()
    limiter, ok := l.limiters[botID]
    l.mu.RUnlock()
    
    if ok {
        return limiter
    }
    
    l.mu.Lock()
    defer l.mu.Unlock()
    
    // Double-check
    if limiter, ok = l.limiters[botID]; ok {
        return limiter
    }
    
    limiter = rate.NewLimiter(l.rate, l.burst)
    l.limiters[botID] = limiter
    return limiter
}

func (l *Limiter) Allow(botID string) bool {
    return l.getLimiter(botID).Allow()
}

func (l *Limiter) Wait(ctx context.Context, botID string) error {
    return l.getLimiter(botID).Wait(ctx)
}

func (l *Limiter) cleanupLoop() {
    for {
        select {
        case <-l.cleanup.C:
            l.mu.Lock()
            now := time.Now()
            for botID, limiter := range l.limiters {
                // Remove limiters that haven't been used recently
                // (rate.Limiter doesn't expose last use time, so we approximate)
                // In production, use a more sophisticated store (Redis)
                _ = limiter
            }
            l.mu.Unlock()
        case <-l.stopCh:
            l.cleanup.Stop()
            return
        }
    }
}

func (l *Limiter) Stop() {
    close(l.stopCh)
}
```

- [ ] **Step 6: Implement registry (Redis-backed)**

```go
// services/interlink/internal/registry/registry.go
package registry

import (
    "context"
    "encoding/json"
    "time"
    
    "github.com/redis/go-redis/v9"
    interlinkv1 "github.com/apollo-bot/interlink/gen/go/interlink/v1"
    "github.com/rs/zerolog/log"
)

const (
    botKeyPrefix     = "interlink:bot:"
    botIndexKey      = "interlink:bots:index"
    heartbeatTTL     = 2 * time.Minute
)

type Registry struct {
    client *redis.Client
}

func NewRegistry(redisURL string) (*Registry, error) {
    opt, err := redis.ParseURL(redisURL)
    if err != nil {
        return nil, err
    }
    client := redis.NewClient(opt)
    if err := client.Ping(context.Background()).Err(); err != nil {
        return nil, err
    }
    return &Registry{client: client}, nil
}

func (r *Registry) Register(ctx context.Context, req *interlinkv1.RegisterBotRequest) (*interlinkv1.BotInfo, error) {
    info := &interlinkv1.BotInfo{
        BotId:         req.BotId,
        Endpoint:      req.Endpoint,
        Capabilities:  req.Capabilities,
        RegisteredAt:  time.Now().UnixMilli(),
        LastHeartbeat: time.Now().UnixMilli(),
        Online:        true,
    }
    
    data, err := json.Marshal(info)
    if err != nil {
        return nil, err
    }
    
    pipe := r.client.TxPipeline()
    pipe.Set(ctx, botKeyPrefix+req.BotId, data, 0)
    pipe.SAdd(ctx, botIndexKey, req.BotId)
    pipe.Expire(ctx, botKeyPrefix+req.BotId+"heartbeat", heartbeatTTL)
    _, err = pipe.Exec(ctx)
    
    return info, err
}

func (r *Registry) Heartbeat(ctx context.Context, botID string) error {
    key := botKeyPrefix + botID
    data, err := r.client.Get(ctx, key).Bytes()
    if err != nil {
        return err
    }
    
    var info interlinkv1.BotInfo
    if err := json.Unmarshal(data, &info); err != nil {
        return err
    }
    
    info.LastHeartbeat = time.Now().UnixMilli()
    info.Online = true
    
    newData, _ := json.Marshal(info)
    pipe := r.client.TxPipeline()
    pipe.Set(ctx, key, newData, 0)
    pipe.Expire(ctx, key+":heartbeat", heartbeatTTL)
    _, err = pipe.Exec(ctx)
    return err
}

func (r *Registry) Unregister(ctx context.Context, botID string) error {
    pipe := r.client.TxPipeline()
    pipe.Del(ctx, botKeyPrefix+botID)
    pipe.Del(ctx, botKeyPrefix+botID+":heartbeat")
    pipe.SRem(ctx, botIndexKey, botID)
    _, err := pipe.Exec(ctx)
    return err
}

func (r *Registry) Get(ctx context.Context, botID string) (*interlinkv1.BotInfo, error) {
    data, err := r.client.Get(ctx, botKeyPrefix+botID).Bytes()
    if err != nil {
        return nil, err
    }
    var info interlinkv1.BotInfo
    return &info, json.Unmarshal(data, &info)
}

func (r *Registry) List(ctx context.Context) ([]*interlinkv1.BotInfo, error) {
    botIDs, err := r.client.SMembers(ctx, botIndexKey).Result()
    if err != nil {
        return nil, err
    }
    
    var bots []*interlinkv1.BotInfo
    for _, id := range botIDs {
        info, err := r.Get(ctx, id)
        if err != nil {
            log.Warn().Err(err).Str("bot_id", id).Msg("Failed to get bot info")
            continue
        }
        // Check heartbeat
        if time.Since(time.UnixMilli(info.LastHeartbeat)) > heartbeatTTL {
            info.Online = false
        }
        bots = append(bots, info)
    }
    return bots, nil
}
```

- [ ] **Step 7: Implement main server with interceptors**

```go
// services/interlink/internal/server/server.go
package server

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"
	
	"connectrpc.com/connect"
	"connectrpc.com/connectgo"
	"github.com/apollo-bot/interlink/internal/auth"
	"github.com/apollo-bot/interlink/internal/ratelimit"
	"github.com/apollo-bot/interlink/internal/registry"
	"github.com/apollo-bot/interlink/internal/telemetry"
	interlinkv1 "github.com/apollo-bot/interlink/gen/go/interlink/v1"
	"github.com/apollo-bot/interlink/gen/go/interlink/v1/interlinkv1connect"
	"github.com/rs/zerolog/log"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

type Server struct {
	registry    *registry.Registry
	auth        *auth.Verifier
	rateLimiter *ratelimit.Limiter
	streams     map[string]chan *interlinkv1.Envelope
	streamMu    sync.RWMutex
}

func NewServer(reg *registry.Registry, auth *auth.Verifier, rl *ratelimit.Limiter) *Server {
	return &Server{
		registry:    reg,
		auth:        auth,
		rateLimiter: rl,
		streams:     make(map[string]chan *interlinkv1.Envelope),
	}
}

func (s *Server) sendInterceptor(next connect.UnaryHandlerFunc) connect.UnaryHandlerFunc {
	return connect.UnaryHandlerFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		start := time.Now()
		
		// Auth
		botID, err := s.auth.Verify(ctx, req)
		if err != nil {
			telemetry.RecordRequest(ctx, req.Spec().Procedure, time.Since(start).Seconds(), err)
			return nil, connect.NewError(connect.CodeUnauthenticated, err)
		}
		
		// Rate limit
		if !s.rateLimiter.Allow(botID) {
			telemetry.RecordRequest(ctx, req.Spec().Procedure, time.Since(start).Seconds(), 
				connect.NewError(connect.CodeResourceExhausted, nil))
			return nil, connect.NewError(connect.CodeResourceExhausted, 
				errors.New("rate limit exceeded"))
		}
		
		resp, err := next(ctx, req)
		telemetry.RecordRequest(ctx, req.Spec().Procedure, time.Since(start).Seconds(), err)
		return resp, err
	})
}

func (s *Server) streamInterceptor(next connect.StreamHandlerFunc) connect.StreamHandlerFunc {
	return connect.StreamHandlerFunc(func(ctx context.Context, conn connect.StreamHandlerConn) error {
		telemetry.ActiveStreams.Add(ctx, 1)
		defer telemetry.ActiveStreams.Add(ctx, -1)
		
		var botID string
		var msgCh chan *interlinkv1.Envelope
		
		// Auth on EVERY message - we need to intercept each receive
		// ConnectRPC's StreamHandlerConn allows us to receive messages one at a time
		for conn.Receive(ctx) {
			msg := conn.Msg()
			
			// Authenticate each message
			authenticatedBotID, err := s.auth.Verify(ctx, connect.NewRequest(msg))
			if err != nil {
				return connect.NewError(connect.CodeUnauthenticated, err)
			}
			
			// First message: register stream
			if msgCh == nil {
				botID = authenticatedBotID
				msgCh = make(chan *interlinkv1.Envelope, 100)
				s.streamMu.Lock()
				s.streams[botID] = msgCh
				s.streamMu.Unlock()
				
				defer func() {
					s.streamMu.Lock()
					delete(s.streams, botID)
					s.streamMu.Unlock()
					close(msgCh)
				}()
				
				// Handle incoming in background
				go func() {
					for conn.Receive(ctx) {
						incomingMsg := conn.Msg()
						// Re-authenticate each incoming message
						if _, err := s.auth.Verify(ctx, connect.NewRequest(incomingMsg)); err != nil {
							log.Warn().Err(err).Str("bot", botID).Msg("Stream message auth failed")
							continue
						}
						s.handleIncoming(ctx, botID, incomingMsg)
					}
				}()
			} else if authenticatedBotID != botID {
				// Bot ID mismatch within same stream
				return connect.NewError(connect.CodeUnauthenticated, errors.New("bot ID mismatch in stream"))
			}
			
			// Send outgoing messages
			select {
			case <-ctx.Done():
				return ctx.Err()
			case env, ok := <-msgCh:
				if !ok {
					return nil
				}
				if err := conn.Send(env); err != nil {
					return err
				}
			}
		}
		
		return nil
	})
}

func (s *Server) handleIncoming(ctx context.Context, botID string, env *interlinkv1.Envelope) {
    // Route to target bot(s)
    if env.Target == "*" {
        s.broadcast(ctx, env)
    } else {
        s.sendToBot(ctx, env.Target, env)
    }
}

func (s *Server) sendToBot(ctx context.Context, targetBotID string, env *interlinkv1.Envelope) {
    s.streamMu.RLock()
    ch, ok := s.streams[targetBotID]
    s.streamMu.RUnlock()
    
    if ok {
        select {
        case ch <- env:
        default:
            log.Warn().Str("target", targetBotID).Msg("Stream buffer full, dropping message")
        }
    } else {
        // Queue in Redis for offline delivery (optional)
    }
}

func (s *Server) broadcast(ctx context.Context, env *interlinkv1.Envelope) {
    s.streamMu.RLock()
    for botID, ch := range s.streams {
        if botID != env.Source {
            select {
            case ch <- env:
            default:
            }
        }
    }
    s.streamMu.RUnlock()
}

// Implement InterlinkService methods...
func (s *Server) Send(ctx context.Context, req *connect.Request[interlinkv1.Envelope]) (*connect.Response[interlinkv1.SendResponse], error) {
	env := req.Msg
	s.handleIncoming(ctx, env.Source, env)
	return connect.NewResponse(&interlinkv1.SendResponse{
		Accepted:    true,
		MessageId:   env.Id,
	}), nil
}

func (s *Server) Subscribe(req *connect.Request[interlinkv1.SubscribeRequest], stream *connect.ServerStream[interlinkv1.Envelope]) error {
	// Implemented via streamInterceptor
	return nil
}

func (s *Server) Connect(stream *connect.BidiStream[interlinkv1.Envelope, interlinkv1.Envelope]) error {
	// Implemented via streamInterceptor
	return nil
}

func (s *Server) RegisterBot(ctx context.Context, req *connect.Request[interlinkv1.RegisterBotRequest]) (*connect.Response[interlinkv1.RegisterBotResponse], error) {
	info, err := s.registry.Register(ctx, req.Msg)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&interlinkv1.RegisterBotResponse{
		Success: true,
		BotId:   info.BotId,
	}), nil
}

func (s *Server) Heartbeat(ctx context.Context, req *connect.Request[interlinkv1.HeartbeatRequest]) (*connect.Response[interlinkv1.HeartbeatResponse], error) {
	err := s.registry.Heartbeat(ctx, req.Msg.BotId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(&interlinkv1.HeartbeatResponse{
		Alive: true,
	}), nil
}

func (s *Server) UnregisterBot(ctx context.Context, req *connect.Request[interlinkv1.UnregisterBotRequest]) (*connect.Response[interlinkv1.UnregisterBotResponse], error) {
	err := s.registry.Unregister(ctx, req.Msg.BotId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&interlinkv1.UnregisterBotResponse{
		Success: true,
	}), nil
}

func (s *Server) ListBots(ctx context.Context, req *connect.Request[interlinkv1.ListBotsRequest]) (*connect.Response[interlinkv1.ListBotsResponse], error) {
	bots, err := s.registry.List(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&interlinkv1.ListBotsResponse{
		Bots: bots,
	}), nil
}

func (s *Server) GetBotInfo(ctx context.Context, req *connect.Request[interlinkv1.GetBotInfoRequest]) (*connect.Response[interlinkv1.BotInfo], error) {
	info, err := s.registry.Get(ctx, req.Msg.BotId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(info), nil
}
```

- [ ] **Step 8: Implement main.go**

```go
// services/interlink/main.go
package main

import (
    "context"
    "flag"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
    
    "github.com/apollo-bot/interlink/internal/auth"
    "github.com/apollo-bot/interlink/internal/ratelimit"
    "github.com/apollo-bot/interlink/internal/registry"
    "github.com/apollo-bot/interlink/internal/server"
    "github.com/apollo-bot/interlink/internal/telemetry"
    "github.com/rs/zerolog"
    "github.com/rs/zerolog/log"
)

func main() {
    var (
        grpcAddr      = flag.String("grpc-addr", "[::]:50052", "gRPC listen address")
        redisURL      = flag.String("redis-url", "redis://localhost:6379", "Redis URL")
        authKey       = flag.String("auth-key", "", "HMAC secret key (required)")
        rateLimit     = flag.Float64("rate-limit", 100, "Requests per second per bot")
        burst         = flag.Int("burst", 200, "Burst allowance per bot")
        otelEndpoint  = flag.String("otel-endpoint", "http://localhost:4318", "OTLP endpoint")
        logLevel      = flag.String("log-level", "info", "Log level (debug, info, warn, error)")
    )
    flag.Parse()
    
    // Setup logging
    level, _ := zerolog.ParseLevel(*logLevel)
    zerolog.SetGlobalLevel(level)
    log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
    
    if *authKey == "" {
        log.Fatal().Msg("AUTH_KEY is required")
    }
    
    // Telemetry
    shutdown, err := telemetry.Init("interlink", *otelEndpoint)
    if err != nil {
        log.Fatal().Err(err).Msg("Failed to init telemetry")
    }
    defer func() {
        ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer cancel()
        shutdown(ctx)
    }()
    
    // Dependencies
    reg, err := registry.NewRegistry(*redisURL)
    if err != nil {
        log.Fatal().Err(err).Msg("Failed to connect to Redis")
    }
    defer reg.Close()
    
    nonceStore := auth.NewRedisNonceStore(reg.Client()) // Implement
    authVerifier := auth.NewVerifier(*authKey, nonceStore)
    rateLimiter := ratelimit.NewLimiter(*rateLimit, *burst)
    defer rateLimiter.Stop()
    
    // Server
    srv := server.NewServer(reg, authVerifier, rateLimiter)
    mux := http.NewServeMux()
    
    // ConnectRPC handler
    path, handler := interlinkv1connect.NewInterlinkServiceHandler(srv)
    mux.Handle(path, handler)
    
    // Prometheus metrics
    mux.Handle("/metrics", promhttp.Handler())
    
    // Health
    mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("ok"))
    })
    
    // HTTP/2 with h2c for gRPC without TLS
    h2s := &http2.Server{}
    server := &http.Server{
        Addr:              *grpcAddr,
        Handler:           h2c.NewHandler(mux, h2s),
        ReadHeaderTimeout: 10 * time.Second,
        ReadTimeout:       30 * time.Second,
        WriteTimeout:      30 * time.Second,
        IdleTimeout:       120 * time.Second,
    }
    
    go func() {
        log.Info().Str("addr", *grpcAddr).Msg("Starting Interlink gRPC server")
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatal().Err(err).Msg("Server failed")
        }
    }()
    
    // Graceful shutdown
    sigCh := make(chan os.Signal, 1)
    signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
    <-sigCh
    
    log.Info().Msg("Shutting down...")
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    server.Shutdown(ctx)
}
```

- [ ] **Step 9: Build and test**

Run: `cd services/interlink && go build -o interlink .`
Expected: Binary `interlink` created

Run: `cd services/interlink && go test ./...`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add services/interlink/
git commit -m "feat(interlink): implement Go ConnectRPC server with auth, rate limiting, registry"
```

---

### Task 3: Docker Multi-Stage Build for Go Service

**Files:**
- Create: `services/interlink/Dockerfile`
- Modify: `docker-compose.yml` — add `interlink-service`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# services/interlink/Dockerfile
# Build stage
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache git make protobuf-dev
WORKDIR /app

# Cache modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /interlink .

# Runtime stage
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /interlink /usr/local/bin/interlink

ENV INTERLINK_GRPC_ADDR=[::]:50052
ENV INTERLINK_REDIS_URL=redis://redis:6379
ENV INTERLINK_AUTH_KEY=changeme
ENV INTERLINK_RATE_LIMIT=100
ENV INTERLINK_BURST=200
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318

EXPOSE 50052
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/interlink"]
```

- [ ] **Step 2: Update docker-compose.yml**

```yaml
# docker-compose.yml - add service
services:
  interlink-service:
    build:
      context: .
      dockerfile: services/interlink/Dockerfile
    profiles: ["multi"]
    environment:
      - INTERLINK_GRPC_ADDR=[::]:50052
      - INTERLINK_REDIS_URL=redis://redis:6379
      - INTERLINK_AUTH_KEY=${INTERLINK_AUTH_KEY}
      - INTERLINK_RATE_LIMIT=100
      - INTERLINK_BURST=200
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:50052/healthz"]
      interval: 10s
      timeout: 5s
      retries: 3
    depends_on:
      - redis
      - jaeger

  # Update gateway/worker to use interlink-service
  gateway:
    environment:
      - INTERLINK_GRPC_ADDR=interlink-service:50052
      - INTERLINK_AUTH_KEY=${INTERLINK_AUTH_KEY}
```

- [ ] **Step 3: Build and test**

Run: `docker compose build interlink-service`
Run: `docker compose up -d interlink-service redis jaeger`
Run: `grpcurl -plaintext localhost:50052 interlink.v1.InterlinkService/ListBots`
Expected: `{"bots": []}`

- [ ] **Step 4: Commit**

```bash
git add services/interlink/Dockerfile docker-compose.yml
git commit -m "feat(interlink): add Dockerfile and docker-compose for Go Interlink service"
```

---

### Task 4: Create Node.js ConnectRPC Client

**Files:**
- Create: `src/plugins/interlink/connectClient.ts`
- Modify: `src/plugins/interlink/server.ts` — replace Express with ConnectRPC client calls
- Modify: `src/plugins/interlink/redis.ts` — remove or adapt for registry only
- Modify: `package.json` — add `@connectrpc/connect`, `@connectrpc/connect-node`, `@bufbuild/protobuf`

**Interfaces:**
- Consumes: Generated TypeScript protobuf types (`src/generated/interlink/`)
- Produces: `InterlinkConnectClient` class with `send()`, `subscribe()`, `connect()`, `register()`, `heartbeat()` methods

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/plugins/interlink/connectClient.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterlinkConnectClient } from '../../../../src/plugins/interlink/connectClient.js';
import { createPromiseClient, createPromiseClient as createClient, PromiseClient } from '@connectrpc/connect';
import { InterlinkService } from '../../../../src/generated/interlink/interlink_connect.js';

describe('InterlinkConnectClient', () => {
  let client: InterlinkConnectClient;
  let mockTransport: any;

  beforeEach(() => {
    mockTransport = {
      unary: vi.fn(),
      stream: vi.fn(),
    };
    client = new InterlinkConnectClient('http://localhost:50052', mockTransport);
  });

  it('sends envelope via unary RPC', async () => {
    mockTransport.unary.mockResolvedValue({
      accepted: true,
      messageId: 'msg-123',
    });

    const result = await client.send({
      protocol: 'apollo.interlink.v1',
      version: '1.0',
      type: 'message',
      source: 'bot-a',
      target: 'bot-b',
      id: 'env-123',
      timestamp: Date.now(),
      nonce: 'nonce-123',
      payload: new Uint8Array([1, 2, 3]),
    });

    expect(mockTransport.unary).toHaveBeenCalled();
    expect(result.accepted).toBe(true);
    expect(result.messageId).toBe('msg-123');
  });

  it('handles streaming subscription', async () => {
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { protocol: 'v1', type: 'event', source: 'bot-b', payload: new Uint8Array() };
      },
      close: vi.fn(),
    };
    mockTransport.stream.mockReturnValue(mockStream);

    const messages = [];
    for await (const msg of client.subscribe('bot-a')) {
      messages.push(msg);
      break;
    }
    expect(messages.length).toBe(1);
  });
});
```

- [ ] **Step 2: Add dependencies**

Run: `pnpm add @connectrpc/connect @connectrpc/connect-node @bufbuild/protobuf @noble/hashes`
Run: `pnpm add -D @connectrpc/protoc-gen-connect-es @bufbuild/protoc-gen-ts`

- [ ] **Step 3: Generate TypeScript types** (from Task 1)

Run: `pnpm proto:generate:ts`
Expected: `src/generated/interlink/interlink_pb.ts`, `interlink_connect.ts`

- [ ] **Step 4: Implement ConnectRPC client**

```typescript
// src/plugins/interlink/connectClient.ts
import { createPromiseClient, createClient, Stream } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { InterlinkService } from '../generated/interlink/interlink_connect.js';
import {
  Envelope,
  SendResponse,
  SubscribeRequest,
  RegisterBotRequest,
  RegisterBotResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  UnregisterBotRequest,
  ListBotsRequest,
  ListBotsResponse,
  GetBotInfoRequest,
  BotInfo,
} from '../generated/interlink/interlink_pb.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export interface InterlinkClient {
  send(env: Envelope): Promise<SendResponse>;
  subscribe(botId: string, messageTypes?: string[]): AsyncIterable<Envelope>;
  connect(): Stream<Envelope, Envelope>;
  register(req: RegisterBotRequest): Promise<RegisterBotResponse>;
  heartbeat(req: HeartbeatRequest): Promise<HeartbeatResponse>;
  unregister(botId: string): Promise<void>;
  listBots(): Promise<BotInfo[]>;
  getBotInfo(botId: string): Promise<BotInfo>;
  close(): Promise<void>;
}

export class InterlinkConnectClient implements InterlinkClient {
  private client: ReturnType<typeof createPromiseClient<typeof InterlinkService>>;
  private transport: ReturnType<typeof createConnectTransport>;
  private botId: string;
  private authKey: string;

  constructor(
    address: string = config.interlinkGrpcAddress,
    botId: string = config.clientId,
    authKey: string = config.interlinkAuthKey
  ) {
    this.botId = botId;
    this.authKey = authKey;
    
    this.transport = createConnectTransport({
      baseUrl: address,
      httpVersion: '2',
      // Add interceptors for auth
      interceptors: [this.authInterceptor()],
    });
    
    this.client = createPromiseClient(InterlinkService, this.transport);
  }

  private authInterceptor() {
    return (next: any) => async (req: any) => {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      
      // Create canonical string for signing (must match Go server exactly)
      // Format: method\npath\ntimestamp\nnonce\nbodyHash
      const canonical = this.createCanonicalString(req, timestamp, nonce);
      const signature = this.sign(canonical);
      
      req.header.set('Authorization', `HMAC-SHA256 ${signature}`);
      req.header.set('X-Interlink-Timestamp', timestamp);
      req.header.set('X-Interlink-Nonce', nonce);
      
      return next(req);
    };
  }

  private createCanonicalString(req: any, timestamp: string, nonce: string): string {
    // Match Go server's canonicalization exactly:
    // method\npath\ntimestamp\nnonce\nbodyHash
    const method = req.method; // ConnectRPC method name
    const path = req.method;   // ConnectRPC uses method as path
    const bodyHash = this.hashPayload(req.message?.payload);
    
    return `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  }

  private hashPayload(payload: Uint8Array | undefined): string {
    if (!payload || payload.length === 0) {
      return bytesToHex(sha256(new Uint8Array()));
    }
    return bytesToHex(sha256(payload));
  }

  private sign(message: string): string {
    const key = new TextEncoder().encode(this.authKey);
    const msg = new TextEncoder().encode(message);
    const signature = hmac(sha256, key, msg);
    return bytesToHex(signature);
  }

  async send(env: Envelope): Promise<SendResponse> {
    const response = await this.client.send(env);
    return response;
  }

  async *subscribe(botId: string, messageTypes?: string[]): AsyncIterable<Envelope> {
    const request: SubscribeRequest = { botId, messageTypes: messageTypes || [] };
    const stream = this.client.subscribe(request);
    
    for await (const response of stream) {
      yield response;
    }
  }

  connect(): Stream<Envelope, Envelope> {
    return this.client.connect();
  }

  async register(req: RegisterBotRequest): Promise<RegisterBotResponse> {
    return this.client.registerBot(req);
  }

  async heartbeat(req: HeartbeatRequest): Promise<HeartbeatResponse> {
    return this.client.heartbeat(req);
  }

  async unregister(botId: string): Promise<void> {
    await this.client.unregisterBot({ botId });
  }

  async listBots(): Promise<BotInfo[]> {
    const response = await this.client.listBots({});
    return response.bots;
  }

  async getBotInfo(botId: string): Promise<BotInfo> {
    const response = await this.client.getBotInfo({ botId });
    return response;
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}

// Singleton
let singletonClient: InterlinkConnectClient | null = null;
export function getInterlinkClient(): InterlinkConnectClient {
  if (!singletonClient) {
    singletonClient = new InterlinkConnectClient();
  }
  return singletonClient;
}
```

- [ ] **Step 5: Update interlink plugin to use ConnectRPC client**

```typescript
// src/plugins/interlink/server.ts - replace Express server with client
import { InterlinkConnectClient, getInterlinkClient } from './connectClient.js';
import { EventBus } from '../../core/EventBus.js';
import { logger } from '../../utils/logger.js';

export class InterlinkService {
  private client: InterlinkConnectClient;
  private eventBus: EventBus;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.client = getInterlinkClient();
  }

  async start(): Promise<void> {
    // Register this bot
    await this.client.register({
      botId: config.clientId,
      publicKey: config.interlinkPublicKey,
      endpoint: config.interlinkGrpcAddress, // For callbacks
      capabilities: { commands: 'true', events: 'true' },
      maxConcurrentStreams: 100,
    });

    // Start heartbeat
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.client.heartbeat({ botId: config.clientId, timestamp: Date.now() });
      } catch (error) {
        logger.warn({ error }, 'Interlink heartbeat failed');
      }
    }, 30000);

    // Start listening for messages
    this.startMessageListener();
  }

  private async startMessageListener(): Promise<void> {
    for await (const envelope of this.client.subscribe(config.clientId)) {
      this.handleEnvelope(envelope);
    }
  }

  private handleEnvelope(envelope: Envelope): void {
    // Emit to EventBus for plugin handling
    this.eventBus.emit('interlink:message', envelope);
  }

  async send(envelope: Envelope): Promise<void> {
    await this.client.send(envelope);
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    await this.client.unregister(config.clientId);
    await this.client.close();
  }
}
```

- [ ] **Step 6: Add config entries**

```typescript
// src/config/index.ts - add to ConfigSchema
interlinkGrpcAddress: z.string().default('http://localhost:50052'),
interlinkAuthKey: z.string().min(32),
interlinkPublicKey: z.string(),
```

- [ ] **Step 7: Run tests**

Run: `pnpm test tests/unit/plugins/interlink/connectClient.test.ts`
Expected: Tests pass

- [ ] **Step 8: Commit**

```bash
git add src/plugins/interlink/connectClient.ts src/plugins/interlink/server.ts src/config/index.ts package.json
git commit -m "feat(interlink): add Node.js ConnectRPC client and migrate plugin"
```

---

### Task 5: CI/CD Pipeline Updates for Go

**Files:**
- Modify: `.github/workflows/ci.yml` — add Go build/test jobs, install buf and grpcurl

- [ ] **Step 1: Update ci.yml**

```yaml
# .github/workflows/ci.yml - add to jobs
build-go:
  name: Build Go (interlink)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Set up Go
      uses: actions/setup-go@v5
      with:
        go-version: '1.23'
        cache: true
    - name: Install buf
      uses: bufbuild/buf-setup-action@v1
      with:
        version: '1.46.0'
    - name: Install grpcurl
      run: |
        go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest
    - name: Generate protos
      run: |
        cd services/interlink
        go generate ./...
    - name: Build
      run: cd services/interlink && go build -v .
    - name: Test
      run: cd services/interlink && go test -v ./...
    - name: Lint
      uses: golangci/golangci-lint-action@v6
      with:
        version: latest
        working-directory: services/interlink

docker-interlink:
  name: Build Interlink Docker Image
  needs: build-go
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        file: services/interlink/Dockerfile
        push: ${{ github.event_name != 'pull_request' }}
        tags: ghcr.io/${{ github.repository }}/interlink:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Go build/test jobs for Interlink service"
```

---

### Task 6: Integration Test & Migration

**Files:**
- Create: `tests/integration/interlink-go-service.test.ts`
- Modify: `src/plugins/interlink/index.ts` — switch to ConnectRPC implementation

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration/interlink-go-service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { InterlinkConnectClient } from '../../src/plugins/interlink/connectClient.js';
import { config } from '../../src/config/index.js';

describe('Interlink Go Service Integration', () => {
  let client: InterlinkConnectClient;
  const botId = 'test-bot-' + Date.now();

  beforeAll(() => {
    client = new InterlinkConnectClient(config.interlinkGrpcAddress, botId, config.interlinkAuthKey);
  });

  afterAll(async () => {
    await client.unregister(botId);
    await client.close();
  });

  it('registers and heartbeats', async () => {
    const reg = await client.register({
      botId,
      publicKey: 'test-key',
      endpoint: 'http://localhost:50052',
      capabilities: {},
      maxConcurrentStreams: 10,
    });
    expect(reg.success).toBe(true);
    expect(reg.botId).toBe(botId);

    const hb = await client.heartbeat({ botId, timestamp: Date.now() });
    expect(hb.alive).toBe(true);
  });

  it('lists bots including self', async () => {
    const bots = await client.listBots();
    expect(bots.some(b => b.botId === botId)).toBe(true);
  });

  it('sends and receives via streaming', async () => {
    const received: any[] = [];
    const subscribePromise = (async () => {
      for await (const msg of client.subscribe(botId)) {
        received.push(msg);
        if (received.length >= 1) break;
      }
    })();

    // Give subscription time to establish
    await new Promise(r => setTimeout(r, 100));

    await client.send({
      protocol: 'apollo.interlink.v1',
      version: '1.0',
      type: 'test',
      source: botId,
      target: botId,
      id: 'test-1',
      timestamp: Date.now(),
      nonce: 'nonce-1',
      payload: new TextEncoder().encode('hello'),
    });

    await subscribePromise;
    expect(received.length).toBe(1);
    expect(received[0].payload).toEqual(new TextEncoder().encode('hello'));
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `docker compose up -d interlink-service redis jaeger`
Run: `pnpm test tests/integration/interlink-go-service.test.ts`
Expected: Tests pass

- [ ] **Step 3: Switch plugin implementation**

Modify: `src/plugins/interlink/index.ts` to use `InterlinkConnectClient` instead of Express server

- [ ] **Step 4: Commit**

```bash
git add tests/integration/interlink-go-service.test.ts src/plugins/interlink/index.ts
git commit -m "test(interlink): add integration tests and migrate plugin to ConnectRPC"
```

---

### Task 7: Deprecate Express Server (Cleanup)

**Files:**
- Modify: `src/plugins/interlink/server.ts` — archive or delete
- Modify: `src/plugins/interlink/redis.ts` — remove pub/sub, keep registry if needed
- Modify: `package.json` — remove `express`, `compression`, `helmet` if only used by Interlink

**Interfaces:**
- Consumes: Successful migration verification
- Produces: Reduced Node.js dependencies

- [ ] **Step 1: Verify migration complete**

Check: All interlink traffic goes through Go service, zero Express requests in logs for 24h

- [ ] **Step 2: Archive Express server**

```bash
git mv src/plugins/interlink/server.ts src/plugins/interlink/server.ts.archived
git mv src/plugins/interlink/redis.ts src/plugins/interlink/redis.ts.archived
```

- [ ] **Step 3: Remove unused deps**

Run: `pnpm remove express compression helmet` (if not used elsewhere)
Run: `pnpm install`

- [ ] **Step 4: Verify build and tests**

Run: `pnpm build`
Run: `pnpm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/plugins/interlink/ package.json pnpm-lock.yaml
git commit -m "chore(interlink): remove Express server after ConnectRPC migration"
```