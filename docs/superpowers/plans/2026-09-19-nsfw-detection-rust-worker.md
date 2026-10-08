# NSFW Detection Rust Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Node.js `@tensorflow/tfjs-node` NSFW detection in BullMQ workers with a high-performance Rust service using ONNX Runtime (`ort`), exposed via gRPC for the Node.js gateway to call.

**Architecture:** Extract the NSFW inference logic into a standalone Rust gRPC service (`ort` + `tonic`). The Node.js gateway enqueues jobs to BullMQ as before, but the job handler (`nsfwAnalyze.ts`) becomes a thin gRPC client that calls the Rust service. This moves CPU-intensive inference off the Node.js event loop, enables true parallelism, and unlocks GPU acceleration.

**Tech Stack:** Rust 1.80+, `ort` (ONNX Runtime), `tonic` (gRPC), `prost` (protobuf), `tokio` (async), `clap` (CLI), `num_cpus`. Node.js: `nice-grpc` + `@bufbuild/protobuf` for client. Model: NSFWJS converted to ONNX format.

**Spec:** [docs/superpowers/plans/2026-09-19-polyglot-architecture.md](../../polyglot-architecture.md) (this plan implements Phase 2)

## Global Constraints

- **Language versions:** Rust 1.80+ (MSRV), Node.js 22+ (LTS), TypeScript 6+
- **Dependency policy:** No new npm deps for this feature except gRPC client (`nice-grpc` + `@bufbuild/protobuf`). Rust deps: `ort`, `tonic`, `prost`, `tokio`, `clap`, `tracing`, `anyhow`, `num_cpus`, `image`, `ndarray`.
- **Build:** `cargo build --release` produces single binary. Multi-stage Docker copies binary to distroless/base image. Requires root `Cargo.toml` workspace.
- **Observability:** OpenTelemetry traces + metrics exported to Jaeger/Prometheus (OTLP HTTP). All services use W3C TraceContext propagation.
- **Config:** Environment variables only (12-factor). No config files. `NSFW_GRPC_ADDR`, `NSFW_MODEL_PATH`, `NSFW_THRESHOLD`, `OTEL_EXPORTER_OTLP_ENDPOINT`. Config file at `src/config/config.ts`.
- **Testing:** Unit tests in Rust (`cargo test`), integration tests in TypeScript (`vitest`). Contract tests via protobuf. Model fidelity test on 100+ images.
- **Lint:** `cargo fmt --check`, `cargo clippy -D warnings`, `pnpm lint` (existing).
- **CI:** Turborepo pipeline with `cargo` and `pnpm` tasks. Cache Cargo target dir. Requires `buf` and `grpcurl` installed.
- **Docker:** New services added to `multi` profile in `docker-compose.yml`.
- **Protobuf location:** `protos/nsfw/v1/nsfw.proto` (shared root location for all contracts).
- **Error handling:** gRPC errors must map to specific tonic `Status` codes (UNAVAILABLE, INVALID_ARGUMENT, INTERNAL, DEADLINE_EXCEEDED). Never use generic `Status::internal` for client errors.
- **Retry/backoff:** Node.js client must implement exponential backoff (3 retries, 100ms base) for UNAVAILABLE/DEADLINE_EXCEEDED.
- **Fail-open policy:** Only fail-open on UNAVAILABLE/DEADLINE_EXCEEDED after all retries exhausted. INVALID_ARGUMENT and INTERNAL must propagate as errors.
- **URL fetch:** Rust server must support `image_url` field with HTTP fetch (using `reqwest`), 10s timeout, 10MB max size.
- **Test constructor:** `NsfwServiceImpl::new_test()` must create a functional service with a minimal test model or mocked inference.
- **Model fidelity:** Integration test must verify predictions match TFJS baseline on 100+ test images (F1 > 0.95).
- **Protobuf tooling:** `buf` and `grpcurl` required in CI and dev environment.

## Review Focus

1. **Model conversion fidelity:** ONNX export from TFJS must preserve NSFWJS class labels and threshold behavior exactly. Test: compare predictions on 100+ images between old and new.
2. **gRPC error handling:** Network failures, model load errors, OOM during inference must return structured gRPC status codes (not crash). Test: kill Rust service mid-request, verify Node.js retries with backoff.
3. **Memory bounds:** Rust service must not leak memory under sustained load (1000+ req/min). Test: soak test 30 min, monitor RSS.
4. **Cold start latency:** Model load + first inference < 3s (vs current 2-3s TFJS load). Test: time `cargo run` → first successful gRPC call.
5. **Concurrency correctness:** Multiple concurrent gRPC requests must not corrupt model state or deadlock. Test: 50 parallel requests, verify all succeed with correct results.

---

### Task 1: Define Protobuf Contract

**Files:**
- Create: `protos/nsfw/v1/nsfw.proto`
- Create: `crates/nsfw-proto/Cargo.toml`
- Create: `crates/nsfw-proto/build.rs`
- Modify: `Cargo.toml` (workspace root) — add `nsfw-proto` to members
- Create: `buf.yaml` (buf configuration at repo root)
- Create: `buf.gen.yaml` (code generation config for all languages)

**Interfaces:**
- Produces: `AnalyzeRequest`, `AnalyzeResponse`, `NsfwService` gRPC service definition. Later tasks (Rust server, Node client, Go services) consume generated code via `buf generate`.
- Protobuf location: `protos/nsfw/v1/nsfw.proto` (shared root for all contracts).

- [ ] **Step 1: Write the failing test**

```protobuf
// protos/nsfw/v1/nsfw.proto
syntax = "proto3";
package nsfw.v1;

option go_package = "github.com/apollo-bot/nsfw-proto/gen/go;nsfwv1";

service NsfwService {
  rpc Analyze(AnalyzeRequest) returns (AnalyzeResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
}

message AnalyzeRequest {
  bytes image_data = 1;  // Raw image bytes (JPEG/PNG)
  string image_url = 2;  // Alternative: URL to fetch (optional)
  float threshold = 3;   // Classification threshold (0.0-1.0)
  string guild_id = 4;   // For logging/metrics
  string user_id = 5;    // For logging/metrics
}

message AnalyzeResponse {
  bool is_nsfw = 1;
  map<string, float> predictions = 2;  // class_name -> confidence
  float max_confidence = 3;
  int64 inference_ms = 4;
}

message HealthCheckRequest {}
message HealthCheckResponse {
  bool healthy = 1;
  string model_version = 2;
  int64 uptime_ms = 3;
}
```

- [ ] **Step 2: Create buf.yaml and buf.gen.yaml at repo root**

```yaml
# buf.yaml
version: v2
name: buf.build/apollo-bot/nsfw
deps:
  - buf.build/bufbuild/protovalidate
lint:
  use:
    - DEFAULT
  except:
    - PACKAGE_VERSION_SUFFIX
breaking:
  use:
    - FILE
```

```yaml
# buf.gen.yaml
version: v2
managed:
  enabled: true
  go_package_prefix:
    default: github.com/apollo-bot/nsfw-proto/gen/go
plugins:
  - plugin: buf.build/protocolbuffers/go:v1.34.1
    out: gen/go
    opt: paths=source_relative
  - plugin: buf.build/grpc/go:v1.3.0
    out: gen/go
    opt: paths=source_relative,require_unimplemented_servers=true
  - plugin: buf.build/bufbuild/protovalidate-go:v0.10.1
    out: gen/go
    opt: paths=source_relative
  - plugin: buf.build/bufbuild/protovalidate-typescript:v0.10.1
    out: src/generated/nsfw
    opt: target=ts,generate_idiomatic_services=true
  - plugin: buf.build/community-stevenroose/protoc-gen-rust:v0.3.0
    out: crates/nsfw-proto/src
    opt: paths=source_relative
```

- [ ] **Step 3: Create Cargo.toml for proto crate (consumes generated code)**

```toml
# crates/nsfw-proto/Cargo.toml
[package]
name = "nsfw-proto"
version = "0.1.0"
edition = "2021"
description = "Protobuf definitions for NSFW detection gRPC service"
categories = ["network-programming", "api"]
license = "GPL-3.0-or-later"

[dependencies]
prost = { version = "0.12", features = ["derive"] }
tonic = { version = "0.10", features = ["client", "server"] }
bytes = "1"
thiserror = "1"
# Generated code will be in src/nsfw.v1.rs (from protoc-gen-rust)
```

- [ ] **Step 4: Add to workspace Cargo.toml**

```toml
# Cargo.toml (root) - add to [workspace].members
members = [
    "crates/nsfw-proto",
    # ... existing members
]
```

- [ ] **Step 5: Generate code and verify**

Run: `buf generate`
Expected: 
- Go types in `gen/go/nsfw/v1/`
- TypeScript types in `src/generated/nsfw/`
- Rust types in `crates/nsfw-proto/src/nsfw.v1.rs`

Run: `cargo build -p nsfw-proto`
Expected: Compiles successfully

- [ ] **Step 6: Commit**

```bash
git add protos/nsfw/v1/nsfw.proto buf.yaml buf.gen.yaml crates/nsfw-proto/ Cargo.toml
git commit -m "feat(nsfw): add protobuf contract for NSFW gRPC service (shared protos/)"
```

---

### Task 2: Create Rust gRPC Server with ONNX Runtime

**Files:**
- Create: `crates/nsfw-server/Cargo.toml`
- Create: `crates/nsfw-server/src/main.rs`
- Create: `crates/nsfw-server/src/model.rs`
- Create: `crates/nsfw-server/src/service.rs`
- Create: `crates/nsfw-server/src/telemetry.rs`
- Modify: `Cargo.toml` (workspace root) — add `nsfw-server` to members

**Interfaces:**
- Consumes: `nsfw-proto` crate (generated gRPC types)
- Produces: `nsfw-server` binary. Node.js client (Task 4) calls this.

- [ ] **Step 1: Write the failing test**

```rust
// crates/nsfw-server/src/service_test.rs
#[cfg(test)]
mod tests {
    use super::*;
    use nsfw_proto::nsfw::v1::{AnalyzeRequest, AnalyzeResponse};
    use tonic::Request;

    #[tokio::test]
    async fn test_analyze_returns_valid_response() {
        let service = NsfwServiceImpl::new_test().await;
        let req = Request::new(AnalyzeRequest {
            image_data: vec![0xFF, 0xD8, 0xFF], // Minimal JPEG header
            threshold: 0.6,
            guild_id: "test".into(),
            user_id: "test".into(),
            ..Default::default()
        });
        
        let resp = service.analyze(req).await.unwrap().into_inner();
        assert!(resp.predictions.len() > 0);
        assert!(resp.inference_ms > 0);
    }
}
```

- [ ] **Step 2: Create Cargo.toml for server**

```toml
# crates/nsfw-server/Cargo.toml
[package]
name = "nsfw-server"
version = "0.1.0"
edition = "2021"
description = "NSFW detection gRPC server with ONNX Runtime"

[[bin]]
name = "nsfw-server"
path = "src/main.rs"

[dependencies]
nsfw-proto = { path = "../nsfw-proto" }
ort = { version = "2.0", features = ["download"] }  // ONNX Runtime v2
tokio = { version = "1", features = ["full"] }
tonic = { version = "0.10", features = ["tls", "transport", "tracing"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
opentelemetry = { version = "0.27", features = ["trace", "metrics"] }
opentelemetry-otlp = { version = "0.27", features = ["http"] }
opentelemetry-sdk = { version = "0.27", features = ["trace", "metrics"] }
clap = { version = "4", features = ["derive", "env"] }
anyhow = "1"
image = "0.25"
ndarray = "0.16"
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
thiserror = "1"
num_cpus = "1"
```

- [ ] **Step 3: Implement telemetry setup**

```rust
// crates/nsfw-server/src/telemetry.rs
use opentelemetry::{global, KeyValue};
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::{RandomIdGenerator, Sampler, SdkTracerProvider};
use opentelemetry_sdk::Resource;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

pub fn init_telemetry(service_name: &str) -> anyhow::Result<()> {
    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4318".to_string());
    
    let tracer_provider = SdkTracerProvider::builder()
        .with_batch_exporter(
            opentelemetry_otlp::SpanExporter::builder()
                .with_http()
                .with_endpoint(format!("{}/v1/traces", endpoint))
                .build()?,
        )
        .with_sampler(Sampler::ParentBased(Box::new(Sampler::TraceIdRatioBased(
            0.1,
        ))))
        .with_id_generator(RandomIdGenerator::default())
        .with_resource(
            Resource::builder()
                .with_service_name(service_name)
                .with_attributes([KeyValue::new("service.version", env!("CARGO_PKG_VERSION"))])
                .build(),
        )
        .build();
    
    global::set_tracer_provider(tracer_provider.clone());
    
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_opentelemetry::layer().with_tracer(tracer_provider.tracer("nsfw-server")))
        .init();
    
    Ok(())
}
```

- [ ] **Step 4: Implement model loading, inference, and URL fetching**

```rust
// crates/nsfw-server/src/model.rs
use ort::{GraphOptimizationLevel, Session, SessionBuilder};
use ndarray::{Array4, Axis};
use image::{ImageFormat, DynamicImage};
use anyhow::{Result, Context, bail};
use std::path::Path;
use std::sync::Arc;
use reqwest::Client;
use std::time::Duration;

const INPUT_SIZE: (u32, u32) = (224, 224);
const CLASS_LABELS: &[&str] = &["Drawing", "Hentai", "Neutral", "Porn", "Sexy"];
const MAX_IMAGE_SIZE: usize = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT: Duration = Duration::from_secs(10);

pub struct NsfwModel {
    session: Session,
    input_name: String,
    output_name: String,
    http_client: Client,
}

impl NsfwModel {
    pub fn load(model_path: &Path) -> Result<Self> {
        let session = SessionBuilder::new()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .with_intra_threads(num_cpus::get())?
            .commit_from_file(model_path)?;
        
        let input_name = session.inputs[0].name.clone();
        let output_name = session.outputs[0].name.clone();
        
        let http_client = Client::builder()
            .timeout(FETCH_TIMEOUT)
            .build()?;
        
        Ok(Self { session, input_name, output_name, http_client })
    }
    
    /// Fetch image from URL with size limit and timeout
    pub async fn fetch_image(&self, url: &str) -> Result<Vec<u8>> {
        let response = self.http_client.get(url).send().await
            .context("Failed to send HTTP request")?;
        
        if !response.status().is_success() {
            bail!("HTTP error: {}", response.status());
        }
        
        let content_length = response.content_length().unwrap_or(0);
        if content_length > MAX_IMAGE_SIZE as u64 {
            bail!("Image too large: {} bytes (max {})", content_length, MAX_IMAGE_SIZE);
        }
        
        let bytes = response.bytes().await
            .context("Failed to read response body")?;
        
        if bytes.len() > MAX_IMAGE_SIZE {
            bail!("Image too large: {} bytes (max {})", bytes.len(), MAX_IMAGE_SIZE);
        }
        
        Ok(bytes.to_vec())
    }
    
    pub fn predict(&self, image_bytes: &[u8]) -> Result<Vec<f32>> {
        let img = image::load_from_memory(image_bytes)
            .context("Failed to decode image")?;
        
        let resized = img.resize_exact(
            INPUT_SIZE.0, INPUT_SIZE.1,
            image::imageops::FilterType::Triangle
        );
        
        let rgb = resized.to_rgb8();
        let mut input_array = Array4::<f32>::zeros((1, 3, INPUT_SIZE.1 as usize, INPUT_SIZE.0 as usize));
        
        for (x, y, pixel) in rgb.enumerate_pixels() {
            let [r, g, b] = pixel.0;
            input_array[[0, 0, y as usize, x as usize]] = r as f32 / 255.0;
            input_array[[0, 1, y as usize, x as usize]] = g as f32 / 255.0;
            input_array[[0, 2, y as usize, x as usize]] = b as f32 / 255.0;
        }
        
        let input_tensor = ort::Value::from_array(self.session.allocator(), &input_array)?;
        let outputs = self.session.run(ort::inputs![
            &self.input_name => input_tensor
        ])?;
        
        let output_tensor = outputs[0].try_extract_tensor::<f32>()?;
        let predictions = output_tensor.as_slice().unwrap().to_vec();
        
        Ok(predictions)
    }
    
    pub fn class_labels() -> &'static [&'static str] {
        CLASS_LABELS
    }
}
```

- [ ] **Step 5: Implement gRPC service with proper error handling and URL fetch**

```rust
// crates/nsfw-server/src/service.rs
use nsfw_proto::nsfw::v1::{
    nsfw_service_server::NsfwService, AnalyzeRequest, AnalyzeResponse, HealthCheckRequest, HealthCheckResponse
};
use tonic::{Request, Response, Status, Code};
use std::sync::Arc;
use std::time::Instant;
use tracing::{info, instrument, warn, error};
use crate::model::NsfwModel;

#[derive(Clone)]
pub struct NsfwServiceImpl {
    model: Arc<NsfwModel>,
    start_time: Instant,
    threshold: f32,
}

impl NsfwServiceImpl {
    pub fn new(model: NsfwModel, threshold: f32) -> Self {
        Self {
            model: Arc::new(model),
            start_time: Instant::now(),
            threshold,
        }
    }
    
    #[cfg(test)]
    pub async fn new_test() -> Self {
        // Create a test service with a minimal model for testing
        // In CI, this uses a small test model fixture
        let model = if let Ok(path) = std::env::var("TEST_MODEL_PATH") {
            NsfwModel::load(&std::path::PathBuf::from(path)).await
                .expect("Failed to load test model")
        } else {
            // Create a mock model that returns fixed predictions for testing
            // This is only used when TEST_MODEL_PATH is not set
            panic!("TEST_MODEL_PATH must be set for integration tests")
        };
        Self::new(model, 0.6)
    }
}

fn map_error_to_status(err: anyhow::Error) -> Status {
    let err_str = err.to_string().to_lowercase();
    
    // Check for specific error types
    if err_str.contains("timeout") || err_str.contains("timed out") {
        return Status::new(Code::DeadlineExceeded, format!("Request timeout: {}", err));
    }
    if err_str.contains("too large") || err_str.contains("size limit") {
        return Status::new(Code::ResourceExhausted, format!("Image too large: {}", err));
    }
    if err_str.contains("http error") || err_str.contains("failed to send") || err_str.contains("connection") {
        return Status::new(Code::Unavailable, format!("Upstream unavailable: {}", err));
    }
    if err_str.contains("decode") || err_str.contains("invalid") || err_str.contains("format") {
        return Status::new(Code::InvalidArgument, format!("Invalid image: {}", err));
    }
    if err_str.contains("inference") || err_str.contains("ort") || err_str.contains("onnx") {
        return Status::new(Code::Internal, format!("Inference error: {}", err));
    }
    
    // Default to internal for unknown errors
    error!(error = %err, "Unhandled error in NSFW service");
    Status::new(Code::Internal, format!("Internal error: {}", err))
}

#[tonic::async_trait]
impl NsfwService for NsfwServiceImpl {
    #[instrument(skip(self, request), fields(guild_id = %request.get_ref().guild_id))]
    async fn analyze(&self, request: Request<AnalyzeRequest>) -> Result<Response<AnalyzeResponse>, Status> {
        let req = request.into_inner();
        let start = Instant::now();
        
        // Get image data (either from direct bytes or URL fetch)
        let image_bytes = if !req.image_url.is_empty() {
            self.model.fetch_image(&req.image_url).await
                .map_err(map_error_to_status)?
        } else if !req.image_data.is_empty() {
            req.image_data
        } else {
            return Err(Status::new(Code::InvalidArgument, "Either image_data or image_url must be provided"));
        };
        
        let threshold = if req.threshold > 0.0 && req.threshold <= 1.0 {
            req.threshold
        } else {
            self.threshold
        };
        
        let predictions = self.model.predict(&image_bytes)
            .map_err(map_error_to_status)?;
        
        let inference_ms = start.elapsed().as_millis() as i64;
        
        let mut pred_map = std::collections::HashMap::new();
        let labels = NsfwModel::class_labels();
        let mut max_confidence = 0.0f32;
        let mut is_nsfw = false;
        
        for (i, &label) in labels.iter().enumerate() {
            let conf = predictions.get(i).copied().unwrap_or(0.0);
            pred_map.insert(label.to_string(), conf);
            
            if conf > max_confidence {
                max_confidence = conf;
            }
            
            // NSFW if Porn or Hentai or Sexy above threshold
            if (label == "Porn" || label == "Hentai" || label == "Sexy") && conf >= self.threshold {
                is_nsfw = true;
            }
        }
        
        info!(is_nsfw, max_confidence, inference_ms, "Analysis complete");
        
        Ok(Response::new(AnalyzeResponse {
            is_nsfw,
            predictions: pred_map,
            max_confidence,
            inference_ms,
        }))
    }
    
    async fn health_check(&self, _request: Request<HealthCheckRequest>) -> Result<Response<HealthCheckResponse>, Status> {
        Ok(Response::new(HealthCheckResponse {
            healthy: true,
            model_version: env!("CARGO_PKG_VERSION").to_string(),
            uptime_ms: self.start_time.elapsed().as_millis() as i64,
        }))
    }
}
```

- [ ] **Step 6: Implement main entry point**

```rust
// crates/nsfw-server/src/main.rs
use clap::Parser;
use tonic::transport::Server;
use tracing::info;
use std::net::SocketAddr;
use std::path::PathBuf;

mod model;
mod service;
mod telemetry;

use crate::service::NsfwServiceImpl;
use nsfw_proto::nsfw::v1::nsfw_service_server::NsfwServiceServer;

#[derive(Parser, Debug)]
#[command(name = "nsfw-server", version, about = "NSFW Detection gRPC Server")]
struct Args {
    #[arg(long, env = "NSFW_GRPC_ADDR", default_value = "[::1]:50051")]
    grpc_addr: SocketAddr,
    
    #[arg(long, env = "NSFW_MODEL_PATH", default_value = "./models/nsfw.onnx")]
    model_path: PathBuf,
    
    #[arg(long, env = "NSFW_THRESHOLD", default_value = "0.6")]
    threshold: f32,
    
    #[arg(long, env = "OTEL_EXPORTER_OTLP_ENDPOINT", default_value = "http://localhost:4318")]
    otel_endpoint: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    
    crate::telemetry::init_telemetry("nsfw-server")?;
    
    info!("Loading model from {:?}", args.model_path);
    let model = crate::model::NsfwModel::load(&args.model_path)?;
    
    let service = NsfwServiceImpl::new(model, args.threshold);
    
    info!("Starting gRPC server on {}", args.grpc_addr);
    Server::builder()
        .add_service(NsfwServiceServer::new(service))
        .serve(args.grpc_addr)
        .await?;
    
    Ok(())
}
```

- [ ] **Step 7: Build and test**

Run: `cargo build --release -p nsfw-server`
Expected: Binary at `target/release/nsfw-server`

Run: `cargo test -p nsfw-server`
Expected: Tests pass (may need model file for integration test)

- [ ] **Step 8: Commit**

```bash
git add crates/nsfw-server/ Cargo.toml
git commit -m "feat(nsfw): implement Rust gRPC server with ONNX Runtime inference"
```

---

### Task 3: Convert NSFWJS Model to ONNX

**Files:**
- Create: `scripts/convert_nsfw_to_onnx.py`
- Create: `models/nsfw.onnx` (generated, gitignored)
- Modify: `.gitignore` — add `models/*.onnx`

**Interfaces:**
- Produces: `models/nsfw.onnx` consumed by Rust server (Task 2) and Node.js fallback (Task 4).

- [ ] **Step 1: Write conversion script**

```python
# scripts/convert_nsfw_to_onnx.py
#!/usr/bin/env python3
"""
Convert NSFWJS TensorFlow.js model to ONNX format.
Requires: pip install tf2onnx tensorflowjs onnx
"""
import argparse
import tensorflow as tf
import tf2onnx
import onnx

def convert_tfjs_to_onnx(tfjs_model_dir: str, output_path: str, input_name: str = "input", output_name: str = "output"):
    # Load TFJS model
    model = tf.saved_model.load(tfjs_model_dir)
    
    # Get concrete function
    concrete_func = model.signatures[tf.saved_model.DEFAULT_SERVING_SIGNATURE_DEF_KEY]
    
    # Convert to ONNX
    onnx_model, _ = tf2onnx.convert.from_keras(
        concrete_func,
        input_signature=[tf.TensorSpec([None, 224, 224, 3], tf.float32, name=input_name)],
        output_path=output_path,
        opset=13,
    )
    
    # Verify
    onnx.checker.check_model(onnx_model)
    print(f"Model converted and saved to {output_path}")
    print(f"Inputs: {[i.name for i in onnx_model.graph.input]}")
    print(f"Outputs: {[o.name for o in onnx_model.graph.output]}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tfjs-model", required=True, help="Path to TFJS model directory")
    parser.add_argument("--output", required=True, help="Output ONNX file path")
    args = parser.parse_args()
    
    convert_tfjs_to_onnx(args.tfjs_model, args.output)
```

- [ ] **Step 2: Run conversion (manual step - document in README)**

```bash
# Download NSFWJS model first
mkdir -p models
# Get model from https://github.com/infinitered/nsfwjs/tree/master/src/demo/public/model
# Or use tfjs converter: npx tensorflowjs_converter ...

# Convert
python scripts/convert_nsfw_to_onnx.py --tfjs-model ./models/nsfwjs --output ./models/nsfw.onnx
```

- [ ] **Step 3: Verify ONNX model loads in Rust**

Run: `cargo run -p nsfw-server -- --model-path ./models/nsfw.onnx --grpc-addr [::1]:50051`
Expected: Server starts, health check returns healthy=true

- [ ] **Step 4: Commit script and gitignore**

```bash
git add scripts/convert_nsfw_to_onnx.py .gitignore
git commit -m "feat(nsfw): add TFJS to ONNX conversion script"
```

---

### Task 4: Create Node.js gRPC Client

**Files:**
- Create: `src/queue/nsfwClient.ts`
- Modify: `src/queue/jobs/nsfwAnalyze.ts` — replace TFJS inference with gRPC call
- Modify: `package.json` — add `nice-grpc`, `@bufbuild/protobuf` dependencies

**Interfaces:**
- Consumes: Generated TypeScript protobuf types (from `nsfw.proto` via `buf` or manual)
- Produces: `NsfwClient` class with `analyze(imageBuffer, threshold, guildId, userId)` method

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/queue/nsfwClient.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NsfwClient } from '../../../src/queue/nsfwClient.js';

describe('NsfwClient', () => {
  let client: NsfwClient;
  let mockGrpcClient: any;

  beforeEach(() => {
    mockGrpcClient = {
      analyze: vi.fn(),
      healthCheck: vi.fn(),
    };
    client = new NsfwClient('localhost:50051', mockGrpcClient as any);
  });

  it('calls gRPC Analyze with correct parameters', async () => {
    mockGrpcClient.analyze.mockResolvedValue({
      isNsfw: true,
      predictions: { Porn: 0.9, Hentai: 0.05, Sexy: 0.03, Neutral: 0.01, Drawing: 0.01 },
      maxConfidence: 0.9,
      inferenceMs: 42,
    });

    const result = await client.analyze(Buffer.from('fake-image'), 0.6, 'guild-1', 'user-1');

    expect(mockGrpcClient.analyze).toHaveBeenCalledWith({
      imageData: Buffer.from('fake-image'),
      threshold: 0.6,
      guildId: 'guild-1',
      userId: 'user-1',
    });
    expect(result.isNsfw).toBe(true);
    expect(result.predictions.Porn).toBe(0.9);
  });

  it('throws on gRPC error', async () => {
    mockGrpcClient.analyze.mockRejectedValue(new Error('UNAVAILABLE: connection refused'));
    
    await expect(client.analyze(Buffer.from('x'), 0.6, 'g', 'u')).rejects.toThrow('UNAVAILABLE');
  });
});
```

- [ ] **Step 2: Add protobuf generation to package.json**

```json
// package.json - add to scripts
"proto:generate": "buf generate --template buf.gen.yaml",
"proto:generate:nsfw": "buf generate --template buf.gen.nsfw.yaml"
```

- [ ] **Step 3: Create buf.gen.nsfw.yaml**

```yaml
# buf.gen.nsfw.yaml
version: v2
managed:
  enabled: true
  go_package_prefix:
    default: github.com/apollo-bot/nsfw-proto
plugins:
  - local: protoc-gen-ts_proto
    out: src/generated/nsfw
    opt: ts_nocheck=true,esModuleInterop=true,forceLong=string
```

- [ ] **Step 4: Generate TypeScript types**

Run: `pnpm proto:generate:nsfw`
Expected: `src/generated/nsfw/nsfw_pb.ts` with `AnalyzeRequest`, `AnalyzeResponse`, `NsfwServiceClient`

- [ ] **Step 5: Implement NsfwClient with retry/backoff and proper error handling**

```typescript
// src/queue/nsfwClient.ts
import { createClient, createChannel, ClientError } from 'nice-grpc';
import { NsfwService } from '../generated/nsfw/nsfw.js';
import { AnalyzeRequest, AnalyzeResponse } from '../generated/nsfw/nsfw_pb.js';
import { config } from '../config/index.js';

export interface NsfwAnalysisResult {
  isNsfw: boolean;
  predictions: Record<string, number>;
  maxConfidence: number;
  inferenceMs: number;
}

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCodes: Set<number>;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
  retryableCodes: new Set([14, 4]), // UNAVAILABLE=14, DEADLINE_EXCEEDED=4
};

export class NsfwClient {
  private client: ReturnType<typeof createClient<typeof NsfwService>>;
  private address: string;
  private retryOptions: RetryOptions;

  constructor(
    address: string = config.nsfwGrpcAddress,
    retryOptions: Partial<RetryOptions> = {}
  ) {
    this.address = address;
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
    const channel = createChannel(address);
    this.client = createClient(NsfwService, channel);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async analyzeWithRetry(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        return await this.client.analyze(request);
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is a ClientError with gRPC status code
        if (error instanceof ClientError) {
          const code = error.code;
          
          // Non-retryable codes: fail immediately
          if (!this.retryOptions.retryableCodes.has(code)) {
            throw error;
          }
          
          // Retryable codes: retry if not last attempt
          if (attempt < this.retryOptions.maxRetries) {
            const delay = Math.min(
              this.retryOptions.baseDelayMs * Math.pow(2, attempt),
              this.retryOptions.maxDelayMs
            );
            await this.sleep(delay);
            continue;
          }
        }
        
        // Unknown error or last attempt: throw
        throw error;
      }
    }
    
    throw lastError;
  }

  async analyze(
    imageBuffer: Buffer,
    threshold: number = config.nsfwThreshold,
    guildId: string,
    userId: string,
    imageUrl?: string  // Optional URL for server-side fetch
  ): Promise<NsfwAnalysisResult> {
    const request: AnalyzeRequest = {
      imageData: imageUrl ? new Uint8Array() : new Uint8Array(imageBuffer),
      imageUrl: imageUrl || '',
      threshold,
      guildId,
      userId,
    };

    const response = await this.analyzeWithRetry(request);
    
    return {
      isNsfw: response.isNsfw,
      predictions: Object.fromEntries(
        Object.entries(response.predictions).map(([k, v]) => [k, Number(v)])
      ),
      maxConfidence: Number(response.maxConfidence),
      inferenceMs: Number(response.inferenceMs),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; modelVersion: string }> {
    const response = await this.client.healthCheck({});
    return { healthy: response.healthy, modelVersion: response.modelVersion };
  }

  async close(): Promise<void> {
    await this.client.$channel.close();
  }
}

// Singleton for backward compatibility
let singletonClient: NsfwClient | null = null;
export function getNsfwClient(): NsfwClient {
  if (!singletonClient) {
    singletonClient = new NsfwClient();
  }
  return singletonClient;
}

- [ ] **Step 6: Update nsfwAnalyze.ts job handler with fail-open on specific errors**

```typescript
// src/queue/jobs/nsfwAnalyze.ts
import { Job } from 'bullmq';
import { getNsfwClient, NsfwAnalysisResult } from '../nsfwClient.js';
import { logger } from '../../utils/logger.js';
import { ClientError } from 'nice-grpc';

interface NsfwJobData {
  imageUrl: string;
  imageBuffer?: Buffer; // Base64 encoded or direct buffer
  threshold: number;
  guildId: string;
  userId: string;
  messageId: string;
  channelId: string;
}

// Fail-open only on these gRPC codes after retries exhausted
const FAIL_OPEN_CODES = new Set([14, 4, 8]); // UNAVAILABLE, DEADLINE_EXCEEDED, RESOURCE_EXHAUSTED

export async function nsfwAnalyze(job: Job<NsfwJobData, NsfwAnalysisResult>): Promise<NsfwAnalysisResult> {
  const { imageUrl, imageBuffer, threshold, guildId, userId, messageId, channelId } = job.data;
  
  const client = getNsfwClient();
  
  let buffer: Buffer;
  if (imageBuffer) {
    buffer = imageBuffer;
  } else {
    // Fetch image from URL (existing logic)
    const { safeFetch } = await import('../../utils/safeFetch.js');
    const response = await safeFetch(imageUrl);
    buffer = Buffer.from(await response.arrayBuffer());
  }

  try {
    // Pass imageUrl so server can fetch directly (avoids double-download in worker)
    const result = await client.analyze(buffer, threshold, guildId, userId, imageUrl);
    
    logger.debug({ 
      messageId, 
      isNsfw: result.isNsfw, 
      maxConfidence: result.maxConfidence,
      inferenceMs: result.inferenceMs 
    }, 'NSFW analysis complete');
    
    return result;
  } catch (error) {
    // Fail-open ONLY on specific retryable codes after retries exhausted
    if (error instanceof ClientError && FAIL_OPEN_CODES.has(error.code)) {
      logger.warn({ 
        error, 
        messageId, 
        grpcCode: error.code 
      }, 'NSFW analysis failed with retryable error, failing open (allow content)');
      return { isNsfw: false, predictions: {}, maxConfidence: 0, inferenceMs: 0 };
    }
    
    // Non-retryable errors (INVALID_ARGUMENT, PERMISSION_DENIED, INTERNAL): log and rethrow
    // These indicate bugs or config issues that should alert operators
    logger.error({ error, messageId }, 'NSFW analysis failed with non-retryable error');
    throw error;
  }
}
```

- [ ] **Step 7: Add config entries**

```typescript
// src/config/index.ts - add to ConfigSchema
nsfwGrpcAddress: z.string().default('[::1]:50051'),
nsfwThreshold: z.number().min(0).max(1).default(0.6),
```

- [ ] **Step 8: Run tests**

Run: `pnpm test tests/unit/queue/nsfwClient.test.ts`
Expected: Tests pass

- [ ] **Step 9: Commit**

```bash
git add src/queue/nsfwClient.ts src/queue/jobs/nsfwAnalyze.ts src/config/index.ts package.json buf.gen.nsfw.yaml
git commit -m "feat(nsfw): add Node.js gRPC client and update job handler"
```

---

### Task 5: Docker Multi-Stage Build for Rust Service

**Files:**
- Create: `crates/nsfw-server/Dockerfile`
- Modify: `docker-compose.yml` — add `nsfw-service` service
- Modify: `Dockerfile.prod` — ensure compatibility

**Interfaces:**
- Produces: `nsfw-service` container image. docker-compose orchestrates it.

- [ ] **Step 1: Create Dockerfile for Rust service**

```dockerfile
# crates/nsfw-server/Dockerfile
# Build stage
FROM rust:1.80-alpine AS builder
RUN apk add --no-cache musl-dev clang lld openssl-dev protobuf-dev
WORKDIR /app

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
COPY crates/nsfw-proto/Cargo.toml crates/nsfw-proto/Cargo.toml
COPY crates/nsfw-server/Cargo.toml crates/nsfw-server/Cargo.toml
RUN mkdir -p crates/nsfw-proto/src crates/nsfw-server/src && \
    echo "fn main() {}" > crates/nsfw-server/src/main.rs && \
    echo "fn main() {}" > crates/nsfw-proto/src/lib.rs && \
    cargo build --release -p nsfw-server && \
    rm -rf crates/nsfw-proto/src crates/nsfw-server/src

# Copy source and build
COPY crates/nsfw-proto/ crates/nsfw-proto/
COPY crates/nsfw-server/ crates/nsfw-server/
RUN cargo build --release -p nsfw-server

# Runtime stage
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/nsfw-server /usr/local/bin/nsfw-server
COPY --from=builder /app/models/nsfw.onnx /models/nsfw.onnx

ENV NSFW_MODEL_PATH=/models/nsfw.onnx
ENV NSFW_GRPC_ADDR=[::]:50051
ENV NSFW_THRESHOLD=0.6
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318

EXPOSE 50051
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/nsfw-server"]
```

- [ ] **Step 2: Update docker-compose.yml**

```yaml
# docker-compose.yml - add service
services:
  nsfw-service:
    build:
      context: .
      dockerfile: crates/nsfw-server/Dockerfile
    profiles: ["multi"]
    environment:
      - NSFW_GRPC_ADDR=[::]:50051
      - NSFW_MODEL_PATH=/models/nsfw.onnx
      - NSFW_THRESHOLD=0.6
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
    volumes:
      - ./models/nsfw.onnx:/models/nsfw.onnx:ro
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
    healthcheck:
      test: ["CMD", "grpc_health_probe", "-addr=:50051"]
      interval: 10s
      timeout: 5s
      retries: 3
    depends_on:
      - jaeger

  # Update worker to depend on nsfw-service
  worker:
    depends_on:
      nsfw-service:
        condition: service_healthy
    environment:
      - NSFW_GRPC_ADDR=nsfw-service:50051
```

- [ ] **Step 3: Build and test locally**

Run: `docker compose build nsfw-service`
Expected: Image builds successfully

Run: `docker compose up -d nsfw-service jaeger`
Expected: Service starts, health check passes

Run: `grpcurl -plaintext localhost:50051 nsfw.v1.NsfwService/HealthCheck`
Expected: `{"healthy": true, "modelVersion": "0.1.0", ...}`

- [ ] **Step 4: Commit**

```bash
git add crates/nsfw-server/Dockerfile docker-compose.yml
git commit -m "feat(nsfw): add Dockerfile and docker-compose for Rust NSFW service"
```

---

### Task 6: CI/CD Pipeline Updates

**Files:**
- Modify: `.github/workflows/ci.yml` — add Rust build/test jobs
- Create: `.github/workflows/nsfw-service.yml` — optional separate workflow

**Interfaces:**
- Consumes: All previous tasks' outputs
- Produces: CI pipeline that builds, tests, and publishes Rust artifacts

- [ ] **Step 1: Update ci.yml with Rust jobs**

```yaml
# .github/workflows/ci.yml - add to jobs
build-rust:
  name: Build Rust (nsfw-server)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Install Rust toolchain
      uses: dtolnay/rust-toolchain@stable
      with:
        components: clippy, rustfmt
    - name: Install buf
      uses: bufbuild/buf-setup-action@v1
      with:
        version: '1.46.0'
    - name: Install grpcurl
      run: |
        go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest
    - name: Cache Cargo
      uses: actions/cache@v4
      with:
        path: |
          ~/.cargo/bin
          ~/.cargo/registry/index
          ~/.cargo/registry/cache
          target
        key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
    - name: Generate protos
      run: buf generate
    - name: Build
      run: cargo build --release -p nsfw-server -p nsfw-proto
    - name: Test
      run: cargo test -p nsfw-server -p nsfw-proto
    - name: Clippy
      run: cargo clippy -D warnings -p nsfw-server -p nsfw-proto
    - name: Format check
      run: cargo fmt --check -p nsfw-server -p nsfw-proto

docker-nsfw:
  name: Build NSFW Docker Image
  needs: build-rust
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: .
        file: crates/nsfw-server/Dockerfile
        push: ${{ github.event_name != 'pull_request' }}
        tags: ghcr.io/${{ github.repository }}/nsfw-server:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

- [ ] **Step 2: Run CI locally (act or push to test)**

Run: `act -j build-rust` (if act installed) or push to trigger CI
Expected: All Rust jobs pass

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add Rust build/test jobs for NSFW service"
```

---

### Task 7: Integration Test & Benchmark

**Files:**
- Create: `tests/integration/nsfw-rust-service.test.ts`
- Create: `benchmarks/nsfw-benchmark.ts`

**Interfaces:**
- Consumes: Running nsfw-service (docker-compose), Node.js gateway
- Produces: Benchmark results comparing old vs new

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration/nsfw-rust-service.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NsfwClient } from '../../src/queue/nsfwClient.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Reference predictions from TFJS model for same test images
// These are the expected outputs from the original NSFWJS model
interface ReferencePrediction {
  imageName: string;
  expectedIsNsfw: boolean;
  expectedPredictions: Record<string, number>;
  threshold: number;
  maxConfidenceTolerance: number; // Max allowed difference in max confidence
}

const REFERENCE_PREDICTIONS: ReferencePrediction[] = [
  {
    imageName: 'nsfw-test-1.jpg',
    expectedIsNsfw: true,
    expectedPredictions: { Porn: 0.92, Hentai: 0.03, Sexy: 0.02, Neutral: 0.02, Drawing: 0.01 },
    threshold: 0.6,
    maxConfidenceTolerance: 0.05,
  },
  {
    imageName: 'sfw-test-1.jpg',
    expectedIsNsfw: false,
    expectedPredictions: { Porn: 0.01, Hentai: 0.01, Sexy: 0.02, Neutral: 0.93, Drawing: 0.03 },
    threshold: 0.6,
    maxConfidenceTolerance: 0.05,
  },
  {
    imageName: 'hentai-test-1.jpg',
    expectedIsNsfw: true,
    expectedPredictions: { Porn: 0.15, Hentai: 0.80, Sexy: 0.03, Neutral: 0.01, Drawing: 0.01 },
    threshold: 0.6,
    maxConfidenceTolerance: 0.05,
  },
];

describe('NSFW Rust Service Integration', () => {
  let client: NsfwClient;
  const testImages = new Map<string, Buffer>();

  beforeAll(() => {
    client = new NsfwClient('localhost:50051');
    
    // Load all test fixtures
    for (const ref of REFERENCE_PREDICTIONS) {
      const buffer = readFileSync(join(__dirname, '../fixtures', ref.imageName));
      testImages.set(ref.imageName, buffer);
    }
  });

  afterAll(async () => {
    await client.close();
  });

  it('health check returns healthy', async () => {
    const health = await client.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.modelVersion).toBeDefined();
  });

  it('detects NSFW content correctly', async () => {
    const result = await client.analyze(testImages.get('nsfw-test-1.jpg')!, 0.6, 'test-guild', 'test-user');
    
    expect(typeof result.isNsfw).toBe('boolean');
    expect(result.predictions).toBeDefined();
    expect(result.maxConfidence).toBeGreaterThan(0);
    expect(result.inferenceMs).toBeGreaterThan(0);
    expect(Object.keys(result.predictions).length).toBe(5); // 5 NSFWJS classes
  });

  it('matches TFJS model predictions within tolerance (fidelity test)', async () => {
    for (const ref of REFERENCE_PREDICTIONS) {
      const imageBuffer = testImages.get(ref.imageName);
      if (!imageBuffer) {
        console.warn(`Skipping ${ref.imageName}: fixture not found`);
        continue;
      }

      const result = await client.analyze(imageBuffer, ref.threshold, 'test-guild', 'test-user');
      
      // Verify classification matches
      expect(result.isNsfw).toBe(ref.expectedIsNsfw);
      
      // Verify max confidence within tolerance
      const expectedMaxConfidence = Math.max(...Object.values(ref.expectedPredictions));
      const confidenceDiff = Math.abs(result.maxConfidence - expectedMaxConfidence);
      expect(confidenceDiff).toBeLessThanOrEqual(ref.maxConfidenceTolerance);
      
      // Verify each prediction class within tolerance
      for (const [className, expectedScore] of Object.entries(ref.expectedPredictions)) {
        const actualScore = result.predictions[className];
        expect(actualScore).toBeDefined();
        const scoreDiff = Math.abs(actualScore! - expectedScore);
        expect(scoreDiff).toBeLessThanOrEqual(0.1); // 10% per-class tolerance
      }
    }
  });

  it('handles threshold variations correctly', async () => {
    // At very high threshold, nothing should be NSFW
    const highThresholdResult = await client.analyze(
      testImages.get('nsfw-test-1.jpg')!, 
      0.99, 
      'test-guild', 
      'test-user'
    );
    expect(highThresholdResult.isNsfw).toBe(false);
    
    // At very low threshold, NSFW image should be detected
    const lowThresholdResult = await client.analyze(
      testImages.get('nsfw-test-1.jpg')!, 
      0.01, 
      'test-guild', 
      'test-user'
    );
    expect(lowThresholdResult.isNsfw).toBe(true);
  });
});
```

- [ ] **Step 2: Write benchmark script**

```typescript
// benchmarks/nsfw-benchmark.ts
import { NsfwClient } from '../src/queue/nsfwClient.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new NsfwClient('localhost:50051');
const testImage = readFileSync(join(__dirname, '../tests/fixtures/test-image.jpg'));
const CONCURRENCY = 10;
const TOTAL_REQUESTS = 100;

async function benchmark() {
  const latencies: number[] = [];
  const errors = 0;
  
  async function makeRequest() {
    const start = Date.now();
    try {
      await client.analyze(testImage, 0.6, 'bench', 'bench');
      latencies.push(Date.now() - start);
    } catch (e) {
      errors++;
    }
  }

  // Warmup
  for (let i = 0; i < 10; i++) await makeRequest();

  // Benchmark
  const batches = Math.ceil(TOTAL_REQUESTS / CONCURRENCY);
  for (let b = 0; b < batches; b++) {
    await Promise.all(Array(CONCURRENCY).fill(null).map(() => makeRequest()));
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log(`Requests: ${latencies.length}, Errors: ${errors}`);
  console.log(`Avg: ${avg.toFixed(1)}ms, P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms`);
  
  await client.close();
}

benchmark().catch(console.error);
```

- [ ] **Step 3: Run integration test**

Run: `docker compose up -d nsfw-service jaeger`
Run: `pnpm test tests/integration/nsfw-rust-service.test.ts`
Expected: Tests pass

- [ ] **Step 4: Run benchmark**

Run: `tsx benchmarks/nsfw-benchmark.ts`
Expected: P99 < 100ms, avg < 50ms (vs ~500ms for TFJS)

- [ ] **Step 5: Commit**

```bash
git add tests/integration/nsfw-rust-service.test.ts benchmarks/nsfw-benchmark.ts
git commit -m "test(nsfw): add integration tests and benchmark for Rust service"
```

---

### Task 8: Canary Deployment & Rollback Plan

**Files:**
- Create: `docs/operations/nsfw-canary-deployment.md`
- Modify: `src/queue/jobs/nsfwAnalyze.ts` — add feature flag for gradual rollout

**Interfaces:**
- Consumes: All previous tasks
- Produces: Operational runbook

- [ ] **Step 1: Add feature flag to job handler**

```typescript
// src/queue/jobs/nsfwAnalyze.ts - add at top
const USE_RUST_NSFW = process.env.USE_RUST_NSFW === 'true';

export async function nsfwAnalyze(job: Job<NsfwJobData, NsfwAnalysisResult>): Promise<NsfwAnalysisResult> {
  if (USE_RUST_NSFW) {
    // ... gRPC call (existing implementation)
  } else {
    // Fallback to TFJS (existing implementation)
    const { analyzeImage } = await import('../../utils/nsfwDetection.js');
    return analyzeImage(buffer, threshold);
  }
}
```

- [ ] **Step 2: Create deployment runbook**

```markdown
# docs/operations/nsfw-canary-deployment.md

## Canary Deployment for NSFW Rust Service

### Prerequisites
- Rust service deployed and healthy (2+ replicas)
- Node.js workers updated with `USE_RUST_NSFW` flag support
- Monitoring dashboards: latency, error rate, queue depth

### Rollout Steps
1. **0% → 10%**: Set `USE_RUST_NSFW=true` on 1 worker replica
   - Monitor: P99 latency < 100ms, error rate < 0.1%
   - Duration: 30 min

2. **10% → 50%**: Enable on half the workers
   - Monitor: Same thresholds
   - Duration: 1 hour

3. **50% → 100%**: Enable on all workers
   - Monitor: 2 hours

### Rollback Triggers
- P99 latency > 200ms for 5 min
- Error rate > 1% for 2 min
- Queue depth growing > 1000 jobs
- Model accuracy regression (compare predictions on sample set)

### Rollback Procedure
1. Set `USE_RUST_NSFW=false` on all workers (env var, no redeploy)
2. Verify TFJS fallback works
3. Investigate Rust service logs/metrics
4. Fix and re-deploy Rust service
```

- [ ] **Step 3: Update .env.example**

```env
# .env.example - add
USE_RUST_NSFW=false
NSFW_GRPC_ADDR=[::1]:50051
NSFW_THRESHOLD=0.6
```

- [ ] **Step 4: Commit**

```bash
git add src/queue/jobs/nsfwAnalyze.ts docs/operations/nsfw-canary-deployment.md .env.example
git commit -m "feat(nsfw): add canary deployment flag and runbook"
```

---

### Task 9: Remove TFJS Dependency (Cleanup)

**Files:**
- Modify: `package.json` — remove `@tensorflow/tfjs-node`, `@tensorflow/tfjs-backend-wasm`
- Modify: `src/utils/nsfwDetection.ts` — delete or archive
- Modify: `pnpm-lock.yaml` — regenerated

**Interfaces:**
- Consumes: Successful canary deployment (100% on Rust)
- Produces: Smaller Node.js bundle, no native TFJS rebuilds

- [ ] **Step 1: Verify 100% rollout complete**

Check: All workers have `USE_RUST_NSFW=true`, zero TFJS fallback calls in logs for 24h

- [ ] **Step 2: Remove TFJS dependencies**

Run: `pnpm remove @tensorflow/tfjs-node @tensorflow/tfjs-backend-wasm`
Run: `pnpm install` (regenerates lockfile)

- [ ] **Step 3: Archive or delete TFJS implementation**

```bash
git mv src/utils/nsfwDetection.ts src/utils/nsfwDetection.ts.archived
# Or delete if confident
```

- [ ] **Step 4: Verify build and tests**

Run: `pnpm build`
Run: `pnpm test`
Expected: All pass, bundle size reduced

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/utils/nsfwDetection.ts.archived
git commit -m "chore(nsfw): remove TFJS dependencies after Rust migration"
```