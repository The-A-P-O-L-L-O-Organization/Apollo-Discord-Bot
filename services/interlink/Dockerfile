# syntax=docker/dockerfile:1.4
# Multi-stage build for Interlink Go ConnectRPC service (h2c, no TLS)

# ─── Builder Stage ──────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

# Cache modules
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build static binary
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /interlink .

# ─── Runtime Stage ──────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /interlink /usr/local/bin/interlink

ENV INTERLINK_GRPC_ADDR=[::]:50052
ENV INTERLINK_REDIS_URL=redis://redis:6379
ENV INTERLINK_RATE_LIMIT=100
ENV INTERLINK_BURST=200

# NOTE: INTERLINK_AUTH_KEY is intentionally NOT set here. It must be
# provided at runtime (compose passes ${INTERLINK_AUTH_KEY:-}); the
# binary exits if it is empty.
#
# NOTE: No HEALTHCHECK: distroless has no shell/wget, and grpc_health_probe
# cannot be used because the server does not implement grpc.health.v1.Health
# (it exposes plain HTTP /healthz instead). Probe
# http://interlink:50052/healthz from the orchestrator / gateway side.

EXPOSE 50052
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/interlink"]
