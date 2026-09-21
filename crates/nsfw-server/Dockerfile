# syntax=docker/dockerfile:1.4
# Multi-stage build for NSFW Detection gRPC Server

# ─── Builder Stage ──────────────────────────────────────────────────────
# Use Ubuntu noble (24.04) with Rust 1.88+ for glibc 2.39 compatibility with ort binaries
FROM ubuntu:noble AS builder

# Install Rust
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.88 \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

# Install build dependencies + wget for grpc_health_probe
RUN apt-get update && apt-get install -y --no-install-recommends \
    protobuf-compiler \
    cmake \
    libssl-dev \
    pkg-config \
    wget \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install grpc_health_probe for health checks
ARG GRPC_HEALTH_PROBE_VERSION=v0.4.26
RUN wget -qO /bin/grpc_health_probe "https://github.com/grpc-ecosystem/grpc-health-probe/releases/download/${GRPC_HEALTH_PROBE_VERSION}/grpc_health_probe-linux-amd64" \
    && chmod +x /bin/grpc_health_probe

WORKDIR /app

# Copy entire workspace
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY protos ./protos

# Build the nsfw-server binary and copy to artifacts in same step (cache mount doesn't persist target dir)
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release -p nsfw-server && \
    mkdir -p /artifacts && cp /app/target/release/nsfw-server /artifacts/

# ─── Runtime Stage ──────────────────────────────────────────────────────
# Use Ubuntu noble (24.04) for glibc 2.39 compatibility with builder
FROM ubuntu:noble AS runtime

# Install runtime dependencies
# tonic uses rustls (not OpenSSL) via the "tls" feature, prost handles protobuf natively
# Only ca-certificates needed for HTTPS/TLS verification
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Use existing ubuntu user (UID 1000)
WORKDIR /app

# Copy binary from builder artifacts
COPY --from=builder /artifacts/nsfw-server /usr/local/bin/nsfw-server

# Copy grpc_health_probe from builder
COPY --from=builder /bin/grpc_health_probe /usr/local/bin/grpc_health_probe

# Create models directory
RUN mkdir -p /models && chown -R ubuntu:ubuntu /models

USER ubuntu

# Expose gRPC port
EXPOSE 50051

# Health check using grpc_health_probe
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD grpc_health_probe -addr=localhost:50051 || exit 1

# Default command
ENTRYPOINT ["nsfw-server"]