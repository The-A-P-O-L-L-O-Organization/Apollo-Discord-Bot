# syntax=docker/dockerfile:1.4
# Multi-stage build for NSFW Detection gRPC Server

# ─── Builder Stage ──────────────────────────────────────────────────────
# Ubuntu noble (24.04): REQUIRED even for the builder. ort's prebuilt
# onnxruntime binaries reference glibc 2.38+ versioned symbols
# (__isoc23_strtol, _M_replace_cold) and fail to LINK on older distros
# such as Debian bookworm (glibc 2.36) — verified by a failed build.
FROM ubuntu:noble AS builder

# Install Go 1.27 (for building grpc_health_probe from source with latest stdlib fixes)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl -fsSL "https://go.dev/dl/go1.27.1.linux-amd64.tar.gz" -o /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/go/bin:${PATH}"

# Install Rust (minimal profile: skips rust-docs, the bulk of the download)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain 1.99 \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

# Install build dependencies + git for grpc_health_probe in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    protobuf-compiler \
    cmake \
    libssl-dev \
    pkg-config \
    git \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Build grpc_health_probe from source with Go 1.27 (includes stdlib security fixes)
ARG GRPC_HEALTH_PROBE_VERSION=v0.4.57
RUN git clone --depth 1 --branch ${GRPC_HEALTH_PROBE_VERSION} https://github.com/grpc-ecosystem/grpc-health-probe.git /tmp/grpc-health-probe \
    && cd /tmp/grpc-health-probe \
    && CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/grpc_health_probe . \
    && rm -rf /tmp/grpc-health-probe

WORKDIR /app

# Copy manifests first so dependency downloads cache independently of sources
COPY Cargo.toml Cargo.lock ./
COPY crates/nsfw-server/Cargo.toml ./crates/nsfw-server/Cargo.toml
COPY crates/nsfw-proto/Cargo.toml ./crates/nsfw-proto/Cargo.toml
# Stub targets so `cargo fetch` can parse workspace members without sources
# (the real `COPY crates` below overwrites these stubs before compiling)
RUN mkdir -p ./crates/nsfw-server/src ./crates/nsfw-proto/src \
    && echo 'fn main() {}' > ./crates/nsfw-server/src/main.rs \
    && echo '' > ./crates/nsfw-proto/src/lib.rs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo fetch --locked
# Copy sources (invalidates only the compile step below, not the fetch above)
COPY crates ./crates
COPY protos ./protos

# Build the nsfw-server binary and copy to artifacts in same step (cache mount doesn't persist target dir)
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --locked --release -p nsfw-server && \
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