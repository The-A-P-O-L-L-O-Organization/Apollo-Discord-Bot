# Plugin Sandbox Wasm Runtime Implementation Plan (Deferred)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Node.js `child_process.fork()` based plugin sandbox with a WebAssembly-based sandbox using Wasmtime, providing capability-based security, fuel metering (CPU limits), memory limits, and true isolation from host system calls.

**Architecture:** Build a Rust host (`wasmtime` + `wasi`) that loads plugin Wasm modules, exports a capability-based host API (Discord API subset, storage, HTTP, etc.), enforces resource limits via fuel/memory configuration, and communicates with the Node.js gateway via gRPC or Unix socket. Plugins compile to Wasm Component Model (`*.wasm`) via `jco` (TypeScript) or native Rust/Go.

**Tech Stack:** Rust 1.80+, `wasmtime` (v20+), `wasmtime-wasi`, `wasi-capabilities` (prototype), `tokio`, `tonic` (gRPC), `wit-bindgen` for host bindings. Plugin toolchain: `jco` (TypeScript → Wasm Component), `cargo component` (Rust → Wasm Component), `wac` (composition).

**Spec:** [docs/superpowers/plans/2026-09-19-polyglot-architecture.md](../../polyglot-architecture.md) (this plan implements Phase 4 - DEFERRED)

## Global Constraints

- **Language versions:** Rust 1.80+, wasmtime 20+, Node.js 22+, TypeScript 6+
- **Dependency policy:** Rust deps: `wasmtime`, `wasmtime-wasi`, `wasmtime-component-model`, `tokio`, `tonic`, `tracing`, `anyhow`. Node.js: gRPC client only.
- **Build:** `cargo build --release` for host. Plugin build via `jco`/`cargo component` in CI.
- **Observability:** OpenTelemetry traces + metrics. Host exports plugin execution spans.
- **Config:** Environment variables. `SANDBOX_GRPC_ADDR`, `SANDBOX_FUEL_LIMIT`, `SANDBOX_MEMORY_LIMIT`, `OTEL_EXPORTER_OTLP_ENDPOINT`.
- **Testing:** Rust unit/integration tests. Plugin conformance tests (Wasm + host). Node.js integration tests.
- **Lint:** `cargo fmt --check`, `cargo clippy -D warnings`, `pnpm lint`.
- **CI:** Turborepo with Rust + plugin build pipelines.

## Review Focus

1. **Capability enforcement:** Plugins MUST NOT access host filesystem, network, or syscalls unless explicitly granted via capability. Test: plugin attempts `fs.readFileSync('/etc/passwd')` → host denies.
2. **Fuel metering accuracy:** CPU limit (fuel) must terminate plugin after configured instructions. Test: infinite loop plugin → host traps after N instructions, returns error.
3. **Memory isolation:** Plugin memory must not exceed limit. Test: plugin allocates > limit → host traps with `MemoryLimitExceeded`.
4. **Host API surface:** Exported functions must match capability manifest exactly. Test: plugin calls unexported function → link error at instantiation.
5. **Wasm Component Model compatibility:** TypeScript plugins via `jco` must interoperate with Rust plugins. Test: compose TypeScript + Rust plugins, verify communication.

---

### Task 1: Define WIT Interface for Plugin Capabilities

**Files:**
- Create: `wit/plugin-api.wit`
- Create: `wit/host-api.wit`
- Create: `wit/plugin-manifest.wit`

**Interfaces:**
- Produces: WIT (WebAssembly Interface Types) definitions for plugin-host contract. Consumed by `wit-bindgen` for Rust host bindings and `jco` for TypeScript plugin bindings.

- [ ] **Step 1: Write plugin API (what plugins can call)**

```wit
// wit/plugin-api.wit
package apollo:plugin-api;

interface discord {
    // Send a message to a channel
    send-message: func(channel-id: string, content: string, options: message-options) -> result<message-id, error>
    
    // Edit a message
    edit-message: func(channel-id: string, message-id: string, content: string) -> result<(), error>
    
    // Delete a message
    delete-message: func(channel-id: string, message-id: string) -> result<(), error>
    
    // Add reaction
    add-reaction: func(channel-id: string, message-id: string, emoji: string) -> result<(), error>
    
    // Get channel info
    get-channel: func(channel-id: string) -> result<channel-info, error>
    
    // Get guild info
    get-guild: func(guild-id: string) -> result<guild-info, error>
}

interface storage {
    // Guild-scoped key-value
    guild-get: func(key: string) -> result<option<bytes>, error>
    guild-set: func(key: string, value: bytes) -> result<(), error>
    guild-delete: func(key: string) -> result<(), error>
    guild-keys: func(prefix: string) -> result<list<string>, error>
    
    // User-scoped key-value
    user-get: func(user-id: string, key: string) -> result<option<bytes>, error>
    user-set: func(user-id: string, key: string, value: bytes) -> result<(), error>
}

interface http {
    // Outbound HTTP requests (with allowlist enforcement)
    request: func(method: string, url: string, headers: list<tuple<string, string>>, body: option<bytes>) -> result<http-response, error>
}

interface events {
    // Emit custom event to other plugins/bot
    emit: func(event-name: string, payload: bytes) -> result<(), error>
    
    // Subscribe to events (returns subscription handle)
    subscribe: func(event-name: string) -> result<subscription-handle, error>
    unsubscribe: func(handle: subscription-handle) -> result<(), error>
}

interface logging {
    log: func(level: log-level, message: string, metadata: option<map<string, string>>) -> result<(), error>
}

type message-options {
    embeds: list<embed>,
    components: list<component>,
    files: list<file-attachment>,
    reply-to: option<string>,
}

type channel-info {
    id: string,
    name: string,
    type: channel-type,
    guild-id: option<string>,
}

type guild-info {
    id: string,
    name: string,
    member-count: u32,
}

type http-response {
    status: u16,
    headers: list<tuple<string, string>>,
    body: bytes,
}

type subscription-handle = u64

type log-level = enum { debug, info, warn, error }

type embed = record { ... }
type component = record { ... }
type file-attachment = record { ... }
type channel-type = enum { guild-text, dm, voice, category, ... }
type error = variant { not-found, forbidden, rate-limited, internal, invalid-argument }
```

- [ ] **Step 2: Write host API (what host exports to plugins)**

```wit
// wit/host-api.wit
package apollo:host-api;

interface plugin {
    // Called when plugin is loaded
    on-load: func(config: plugin-config) -> result<(), error>
    
    // Called when plugin is enabled
    on-enable: func() -> result<(), error>
    
    // Called when plugin is disabled
    on-disable: func() -> result<(), error>
    
    // Called when plugin is unloaded
    on-unload: func() -> result<(), error>
    
    // Handle Discord interaction (slash command, button, modal, etc.)
    handle-interaction: func(interaction: interaction-data) -> result<interaction-response, error>
    
    // Handle Discord event (message create, reaction add, etc.)
    handle-event: func(event-name: string, payload: bytes) -> result<(), error>
    
    // Handle CLI command
    handle-cli: func(command: string, args: list<string>) -> result<cli-output, error>
}

type plugin-config {
    manifest: plugin-manifest,
    capabilities: list<string>,  // Granted capabilities
    config: map<string, string>, // Plugin-specific config
}

type interaction-data = record { ... }
type interaction-response = record { ... }
type cli-output = record { stdout: string, stderr: string, exit-code: s32 }
```

- [ ] **Step 3: Write plugin manifest**

```wit
// wit/plugin-manifest.wit
package apollo:plugin-manifest;

type plugin-manifest {
    name: string,
    version: string,
    description: string,
    author: string,
    license: string,
    homepage: option<string>,
    repository: option<string>,
    
    // Required capabilities (host must grant)
    capabilities: list<capability>,
    
    // Entry points
    entry-points: plugin-entry-points,
    
    // Resource limits
    limits: resource-limits,
}

type capability = variant {
    discord-send-message,
    discord-edit-message,
    discord-delete-message,
    discord-add-reaction,
    discord-get-channel,
    discord-get-guild,
    storage-guild,
    storage-user,
    http-request,
    events-emit,
    events-subscribe,
    logging,
}

type plugin-entry-points {
    on-load: string,        // Function name in Wasm
    on-enable: string,
    on-disable: string,
    on-unload: string,
    handle-interaction: string,
    handle-event: string,
    handle-cli: option<string>,
}

type resource-limits {
    fuel: u64,              // Max instructions per invocation
    memory: u64,            // Max linear memory (bytes)
    stack: u64,             // Max stack size (bytes)
    timeout: u64,           // Max wall-clock time (ms)
}
```

- [ ] **Step 4: Generate bindings**

Run: `wit-bindgen rust --out-dir crates/sandbox-host/src/bindings wit/`
Run: `jco transpile -o plugins/generated wit/plugin-api.wit`

- [ ] **Step 5: Commit**

```bash
git add wit/
git commit -m "feat(sandbox): define WIT interfaces for plugin capability system"
```

---

### Task 2: Create Rust Sandbox Host

**Files:**
- Create: `crates/sandbox-host/Cargo.toml`
- Create: `crates/sandbox-host/src/main.rs`
- Create: `crates/sandbox-host/src/sandbox.rs`
- Create: `crates/sandbox-host/src/host_impl.rs`
- Create: `crates/sandbox-host/src/telemetry.rs`
- Create: `crates/sandbox-host/src/plugin_loader.rs`
- Modify: `Cargo.toml` (workspace) — add `sandbox-host`

**Interfaces:**
- Consumes: Generated WIT bindings (`bindings/`)
- Produces: `sandbox-host` binary with gRPC API for Node.js gateway

- [ ] **Step 1: Write the failing test**

```rust
// crates/sandbox-host/src/sandbox_test.rs
#[cfg(test)]
mod tests {
    use super::*;
    use wasmtime::{Engine, Store};
    
    #[tokio::test]
    async fn test_sandbox_enforces_fuel_limit() {
        let sandbox = Sandbox::new(TestConfig {
            fuel_limit: 1000,
            memory_limit: 1024 * 1024,
            ..Default::default()
        }).await.unwrap();
        
        // Plugin that loops infinitely
        let wasm = wat::parse_str(r#"
            (module
                (func (export "run") (loop br 0))
            )
        "#).unwrap();
        
        let result = sandbox.call("run", &[]).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), SandboxError::FuelExhausted));
    }
    
    #[tokio::test]
    async fn test_sandbox_denies_filesystem_access() {
        let sandbox = Sandbox::new(TestConfig::default()).await.unwrap();
        
        // Plugin that tries to read /etc/passwd
        let wasm = wat::parse_str(r#"
            (module
                (import "wasi" "fd_read" (func $fd_read (param i32 i32 i32 i32) (result i32)))
                (func (export "read_passwd")
                    (call $fd_read (i32.const 3) (i32.const 0) (i32.const 0) (i32.const 0))
                )
            )
        "#).unwrap();
        
        let result = sandbox.call("read_passwd", &[]).await;
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), SandboxError::CapabilityDenied(_)));
    }
}
```

- [ ] **Step 2: Create Cargo.toml**

```toml
# crates/sandbox-host/Cargo.toml
[package]
name = "sandbox-host"
version = "0.1.0"
edition = "2021"
description = "Wasm plugin sandbox host with capability-based security"

[[bin]]
name = "sandbox-host"
path = "src/main.rs"

[dependencies]
wasmtime = { version = "20", features = ["component-model-async", "wasi", "parallel-compilation", "cranelift"] }
wasmtime-wasi = { version = "20", features = ["p2"] }
wasi-capabilities = { git = "https://github.com/bytecodealliance/wasi-capabilities" }
tokio = { version = "1", features = ["full"] }
tonic = { version = "0.10", features = ["tls", "transport", "tracing"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
opentelemetry = { version = "0.27", features = ["trace", "metrics"] }
opentelemetry-otlp = { version = "0.27", features = ["http"] }
opentelemetry-sdk = { version = "0.27", features = ["trace", "metrics"] }
clap = { version = "4", features = ["derive", "env"] }
anyhow = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v7", "serde"] }
```

- [ ] **Step 3: Implement sandbox core**

```rust
// crates/sandbox-host/src/sandbox.rs
use wasmtime::*;
use wasmtime::component::*;
use wasmtime_wasi::p2::{WasiCtx, WasiCtxBuilder, WasiView};
use wasi_capabilities::*;
use anyhow::{Result, Context, bail};
use std::sync::Arc;
use std::time::Duration;

pub struct SandboxConfig {
    pub fuel_limit: u64,
    pub memory_limit: usize,
    pub stack_limit: usize,
    pub timeout: Duration,
    pub allowed_capabilities: Vec<Capability>,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            fuel_limit: 10_000_000,      // ~10ms CPU
            memory_limit: 64 * 1024 * 1024, // 64MB
            stack_limit: 512 * 1024,     // 512KB
            timeout: Duration::from_secs(5),
            allowed_capabilities: vec![],
        }
    }
}

pub struct Sandbox {
    engine: Engine,
    component: Component,
    linker: Linker<SandboxState>,
    config: SandboxConfig,
}

pub struct SandboxState {
    ctx: WasiCtx,
    capabilities: CapabilitySet,
    fuel_consumed: u64,
}

impl WasiView for SandboxState {
    fn ctx(&mut self) -> &mut WasiCtx { &mut self.ctx }
}

impl Sandbox {
    pub async fn new(config: SandboxConfig, wasm_bytes: &[u8]) -> Result<Self> {
        let mut config = Config::new();
        config.async_support(true);
        config.consume_fuel(true);
        config.max_wasm_stack(config.stack_limit);
        config.wasm_component_model(true);
        
        let engine = Engine::new(&config)?;
        
        // Configure component linker with capability-based imports
        let mut linker = Linker::new(&engine);
        Self::add_wasi(&mut linker, &config.allowed_capabilities)?;
        Self::add_host_api(&mut linker)?;
        
        let component = Component::new(&engine, wasm_bytes)?;
        
        Ok(Self { engine, component, linker, config })
    }
    
    fn add_wasi(linker: &mut Linker<SandboxState>, allowed: &[Capability]) -> Result<()> {
        let mut builder = WasiCtxBuilder::new();
        
        // Only grant explicitly allowed capabilities
        for cap in allowed {
            match cap {
                Capability::FileSystem(read_only) => {
                    builder.preopened_dir("/", "/")?;
                }
                Capability::Network => {
                    builder.allow_network()?;
                }
                Capability::Clock => {
                    builder.allow_clock()?;
                }
                // ... other capabilities
            }
        }
        
        wasmtime_wasi::p2::add_to_linker(linker, |state: &mut SandboxState| &mut state.ctx)?;
        Ok(())
    }
    
    fn add_host_api(linker: &mut Linker<SandboxState>) -> Result<()> {
        // Export host functions that plugins can call
        // Using component model async functions
        
        // Example: discord.send_message
        linker.func_wrap("apollo:plugin-api/discord", "send_message", 
            async |mut caller: Caller<'_, SandboxState>, 
                     channel_id: String, content: String, options: MessageOptions| 
            -> Result<Result<String, PluginError>> 
        {
            // Check capability
            caller.data().capabilities.check(Capability::DiscordSendMessage)?;
            
            // Forward to host via channel/gRPC
            let host = caller.data().host_handle.clone();
            host.send_message(channel_id, content, options).await
        })?;
        
        // ... add all other host functions
        
        Ok(())
    }
    
    pub async fn call(&mut self, func_name: &str, args: &[Val]) -> Result<Vec<Val>> {
        let mut store = Store::new(&self.engine, SandboxState::new(self.config.clone()));
        
        // Set fuel limit
        store.add_fuel(self.config.fuel_limit)?;
        store.limiter(|store| store.fuel_consumed()); // Custom limiter
        
        // Set timeout
        let timeout = self.config.timeout;
        let _guard = store.interrupt_handle();
        
        let instance = self.linker.instantiate_async(&mut store, &self.component).await?;
        
        // Get export
        let func = instance.get_export(&mut store, None, func_name)
            .context("Function not found")?;
        let func = func.into_func().context("Not a function")?;
        
        // Call with timeout
        let result = tokio::time::timeout(timeout, func.call_async(&mut store, args, &mut [])).await;
        
        match result {
            Ok(Ok(results)) => Ok(results),
            Ok(Err(e)) => {
                if store.fuel_consumed()? == 0 {
                    bail!(SandboxError::FuelExhausted);
                }
                Err(e.into())
            }
            Err(_) => bail!(SandboxError::Timeout),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SandboxError {
    #[error("Fuel exhausted (CPU limit exceeded)")]
    FuelExhausted,
    #[error("Memory limit exceeded")]
    MemoryExceeded,
    #[error("Capability denied: {0}")]
    CapabilityDenied(String),
    #[error("Execution timeout")]
    Timeout,
    #[error("Wasm error: {0}")]
    Wasm(#[from] anyhow::Error),
}
```

- [ ] **Step 4: Implement host API handlers**

```rust
// crates/sandbox-host/src/host_impl.rs
use crate::sandbox::SandboxState;
use wasmtime::component::*;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::mpsc;

#[derive(Clone)]
pub struct HostHandle {
    tx: mpsc::Sender<HostRequest>,
}

#[derive(Debug)]
pub enum HostRequest {
    SendMessage { channel_id: String, content: String, options: MessageOptions, resp: oneshot::Sender<Result<String>> },
    // ... other requests
}

impl HostHandle {
    pub fn new(tx: mpsc::Sender<HostRequest>) -> Self {
        Self { tx }
    }
    
    pub async fn send_message(&self, channel_id: String, content: String, options: MessageOptions) -> Result<String> {
        let (tx, rx) = oneshot::channel();
        self.tx.send(HostRequest::SendMessage { channel_id, content, options, resp: tx }).await?;
        rx.await?
    }
    
    // ... other methods
}

// In sandbox.rs, add to SandboxState:
impl SandboxState {
    pub fn new(config: SandboxConfig) -> Self {
        let (tx, rx) = mpsc::channel(100);
        Self {
            ctx: WasiCtxBuilder::new().build(),
            capabilities: CapabilitySet::from_list(&config.allowed_capabilities),
            fuel_consumed: 0,
            host_handle: HostHandle::new(tx),
            _rx: rx, // Host runs separate task to process rx
        }
    }
}
```

- [ ] **Step 5: Implement gRPC server for Node.js communication**

```rust
// crates/sandbox-host/src/main.rs - gRPC service
use tonic::{Request, Response, Status};
use crate::sandbox::Sandbox;

#[tonic::async_trait]
impl SandboxService for SandboxServer {
    async fn load_plugin(&self, req: Request<LoadPluginRequest>) -> Result<Response<LoadPluginResponse>, Status> {
        let wasm_bytes = req.into_inner().wasm_module;
        let config = SandboxConfig::from_env();
        
        let mut sandbox = Sandbox::new(config, &wasm_bytes).await
            .map_err(|e| Status::internal(e.to_string()))?;
        
        let plugin_id = uuid::Uuid::now_v7().to_string();
        self.sandboxes.lock().await.insert(plugin_id.clone(), sandbox);
        
        Ok(Response::new(LoadPluginResponse { plugin_id }))
    }
    
    async fn call_function(&self, req: Request<CallFunctionRequest>) -> Result<Response<CallFunctionResponse>, Status> {
        let req = req.into_inner();
        let mut sandboxes = self.sandboxes.lock().await;
        let sandbox = sandboxes.get_mut(&req.plugin_id)
            .ok_or_else(|| Status::not_found("Plugin not found"))?;
        
        let args = req.args.into_iter().map(Val::from).collect::<Vec<_>>();
        let results = sandbox.call(&req.function, &args).await
            .map_err(|e| Status::internal(e.to_string()))?;
        
        Ok(Response::new(CallFunctionResponse { 
            results: results.into_iter().map(|v| v.to_string()).collect() 
        }))
    }
}
```

- [ ] **Step 6: Build and test**

Run: `cargo build --release -p sandbox-host`
Run: `cargo test -p sandbox-host`
Expected: Tests pass

- [ ] **Step 7: Commit**

```bash
git add crates/sandbox-host/ Cargo.toml
git commit -m "feat(sandbox): implement Rust Wasmtime sandbox host with capability-based security"
```

---

### Task 3: Plugin Build Toolchain

**Files:**
- Create: `scripts/build-plugin.ts` (TypeScript → Wasm via jco)
- Create: `scripts/build-plugin-rust.sh` (Rust → Wasm via cargo component)
- Create: `plugins/template/typescript/` (TypeScript plugin template)
- Create: `plugins/template/rust/` (Rust plugin template)

**Interfaces:**
- Produces: `.wasm` component files + manifest. Consumed by sandbox host (Task 2).

- [ ] **Step 1: TypeScript plugin template**

```
plugins/template/typescript/
├── package.json
├── tsconfig.json
├── wit/
│   └── imports.wit          # Imports host API
├── src/
│   ├── index.ts             # Plugin entry points
│   └── manifest.ts          # Plugin manifest
└── build.mjs               # Build script using jco
```

```typescript
// plugins/template/typescript/src/manifest.ts
export const manifest = {
    name: "my-plugin",
    version: "1.0.0",
    description: "Example plugin",
    author: "Me",
    license: "MIT",
    capabilities: ["discord-send-message", "storage-guild", "logging"],
    entryPoints: {
        onLoad: "onLoad",
        onEnable: "onEnable",
        onDisable: "onDisable",
        onUnload: "onUnload",
        handleInteraction: "handleInteraction",
        handleEvent: "handleEvent",
    },
    limits: {
        fuel: 10_000_000,
        memory: 64 * 1024 * 1024,
        stack: 512 * 1024,
        timeout: 5000,
    },
};
```

- [ ] **Step 2: Build script for TypeScript plugins**

```typescript
// scripts/build-plugin.ts
import { build } from 'jco';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

async function buildPlugin(pluginDir: string, outputDir: string) {
    // 1. Compile TypeScript to JS
    await exec('tsc', { cwd: pluginDir });
    
    // 2. Bundle with esbuild
    await exec('esbuild', ['src/index.js', '--bundle', '--platform=node', '--format=esm', '--outfile=dist/index.js'], { cwd: pluginDir });
    
    // 3. Transpile to Wasm Component using jco
    await build({
        input: join(pluginDir, 'dist/index.js'),
        output: join(outputDir, 'plugin.wasm'),
        wit: join(pluginDir, 'wit/imports.wit'),
        componentize: true,
    });
    
    // 4. Copy manifest
    const manifest = readFileSync(join(pluginDir, 'src/manifest.json'), 'utf-8');
    writeFileSync(join(outputDir, 'manifest.json'), manifest);
}
```

- [ ] **Step 3: Rust plugin template**

```
plugins/template/rust/
├── Cargo.toml
├── wit/
│   └── imports.wit
├── src/
│   └── lib.rs
└── build.sh
```

```rust
// plugins/template/rust/src/lib.rs
use apollo_plugin_api::*;

#[no_mangle]
pub extern "C" fn on_load(config: PluginConfig) -> Result<(), Error> {
    // Initialize plugin
    Ok(())
}

#[no_mangle]
pub extern "C" fn handle_interaction(interaction: InteractionData) -> Result<InteractionResponse, Error> {
    // Handle slash command
    Ok(InteractionResponse::Acknowledge)
}
```

- [ ] **Step 4: Build script for Rust plugins**

```bash
#!/bin/bash
# scripts/build-plugin-rust.sh
set -e
PLUGIN_DIR=$1
OUTPUT_DIR=$2

cd "$PLUGIN_DIR"
cargo component build --release
cp target/wasm32-wasip2/release/*.wasm "$OUTPUT_DIR/plugin.wasm"
cp manifest.json "$OUTPUT_DIR/"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-plugin.ts scripts/build-plugin-rust.sh plugins/template/
git commit -m "feat(sandbox): add plugin build toolchain and templates"
```

---

### Task 4: Node.js Gateway Integration

**Files:**
- Create: `src/core/sandbox/sandboxClient.ts`
- Modify: `src/core/PluginManager.ts` — replace `workerHost`/`workerChild` with sandbox client
- Modify: `src/core/worker/workerHost.ts` — archive or adapt for Wasm

**Interfaces:**
- Consumes: `sandbox-host` gRPC API
- Produces: `SandboxClient` with `loadPlugin(wasmBuffer, manifest)`, `callFunction(pluginId, function, args)`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/core/sandbox/sandboxClient.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SandboxClient } from '../../../../../src/core/sandbox/sandboxClient.js';

describe('SandboxClient', () => {
  let client: SandboxClient;
  let mockGrpcClient: any;

  beforeEach(() => {
    mockGrpcClient = {
      loadPlugin: vi.fn(),
      callFunction: vi.fn(),
      unloadPlugin: vi.fn(),
    };
    client = new SandboxClient('localhost:50053', mockGrpcClient);
  });

  it('loads plugin and returns plugin ID', async () => {
    mockGrpcClient.loadPlugin.mockResolvedValue({ pluginId: 'plugin-123' });
    
    const wasm = new Uint8Array([0, 97, 115, 109, ...]); // Valid Wasm header
    const manifest = { name: 'test', version: '1.0.0', capabilities: [], entryPoints: {}, limits: {} };
    
    const pluginId = await client.loadPlugin(wasm, manifest);
    
    expect(pluginId).toBe('plugin-123');
    expect(mockGrpcClient.loadPlugin).toHaveBeenCalled();
  });

  it('calls plugin function', async () => {
    mockGrpcClient.callFunction.mockResolvedValue({ results: ['success'] });
    
    const result = await client.callFunction('plugin-123', 'handleInteraction', [interactionData]);
    
    expect(result).toEqual(['success']);
  });
});
```

- [ ] **Step 2: Implement SandboxClient**

```typescript
// src/core/sandbox/sandboxClient.ts
import { createPromiseClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { SandboxService } from '../../generated/sandbox/sandbox_connect.js';
import { LoadPluginRequest, CallFunctionRequest } from '../../generated/sandbox/sandbox_pb.js';
import { config } from '../../config/index.js';

export class SandboxClient {
  private client: ReturnType<typeof createPromiseClient<typeof SandboxService>>;
  private transport: ReturnType<typeof createConnectTransport>;

  constructor(address: string = config.sandboxGrpcAddress) {
    this.transport = createConnectTransport({ baseUrl: address, httpVersion: '2' });
    this.client = createPromiseClient(SandboxService, this.transport);
  }

  async loadPlugin(wasmModule: Uint8Array, manifest: PluginManifest): Promise<string> {
    const request: LoadPluginRequest = {
      wasmModule,
      manifest: JSON.stringify(manifest),
    };
    const response = await this.client.loadPlugin(request);
    return response.pluginId;
  }

  async callFunction(pluginId: string, functionName: string, args: any[]): Promise<any[]> {
    const request: CallFunctionRequest = {
      pluginId,
      function: functionName,
      args: args.map(JSON.stringify),
    };
    const response = await this.client.callFunction(request);
    return response.results.map(r => JSON.parse(r));
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    await this.client.unloadPlugin({ pluginId });
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
```

- [ ] **Step 3: Update PluginManager to use sandbox**

```typescript
// src/core/PluginManager.ts - key changes
import { SandboxClient } from '../sandbox/sandboxClient.js';

export class PluginManager {
  private sandboxClient: SandboxClient;
  
  async loadPlugin(pluginDir: string): Promise<void> {
    // 1. Build plugin to Wasm (using build scripts)
    const wasmPath = await buildPluginToWasm(pluginDir);
    const wasmBuffer = readFileSync(wasmPath);
    const manifest = JSON.parse(readFileSync(join(pluginDir, 'manifest.json'), 'utf-8'));
    
    // 2. Load into sandbox
    const pluginId = await this.sandboxClient.loadPlugin(wasmBuffer, manifest);
    
    // 3. Register plugin with ID
    this.plugins.set(pluginId, { ...manifest, pluginId, wasmPath });
  }
  
  async handleInteraction(interaction: Interaction): Promise<void> {
    const plugin = this.findPluginForInteraction(interaction);
    if (!plugin) return;
    
    await this.sandboxClient.callFunction(plugin.pluginId, 'handle_interaction', [interaction]);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/unit/core/sandbox/sandboxClient.test.ts`
Expected: Tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/sandbox/ src/core/PluginManager.ts
git commit -m "feat(sandbox): add Node.js sandbox client and integrate with PluginManager"
```

---

### Task 5: Docker & CI/CD

**Files:**
- Create: `crates/sandbox-host/Dockerfile`
- Modify: `docker-compose.yml` — add `sandbox-host` service
- Modify: `.github/workflows/ci.yml` — add sandbox host build/test

- [ ] **Step 1: Dockerfile**

```dockerfile
# crates/sandbox-host/Dockerfile
FROM rust:1.80-alpine AS builder
RUN apk add --no-cache musl-dev clang lld
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY crates/sandbox-host/Cargo.toml crates/sandbox-host/Cargo.toml
RUN mkdir -p crates/sandbox-host/src && echo "fn main() {}" > crates/sandbox-host/src/main.rs && \
    cargo build --release -p sandbox-host && rm -rf crates/sandbox-host/src

COPY crates/sandbox-host/ crates/sandbox-host/
COPY wit/ wit/
RUN cargo build --release -p sandbox-host

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/sandbox-host /usr/local/bin/sandbox-host

ENV SANDBOX_GRPC_ADDR=[::]:50053
ENV SANDBOX_FUEL_LIMIT=10000000
ENV SANDBOX_MEMORY_LIMIT=67108864
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318

EXPOSE 50053
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/sandbox-host"]
```

- [ ] **Step 2: Update docker-compose.yml**

```yaml
services:
  sandbox-host:
    build:
      context: .
      dockerfile: crates/sandbox-host/Dockerfile
    environment:
      - SANDBOX_GRPC_ADDR=[::]:50053
      - SANDBOX_FUEL_LIMIT=10000000
      - SANDBOX_MEMORY_LIMIT=67108864
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    depends_on:
      - jaeger
```

- [ ] **Step 3: CI updates**

```yaml
# .github/workflows/ci.yml
build-sandbox:
  name: Build Rust (sandbox-host)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
      with: { components: clippy, rustfmt }
    - uses: actions/cache@v4
      with:
        path: |
          ~/.cargo/bin
          ~/.cargo/registry/index
          ~/.cargo/registry/cache
          target
        key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
    - run: cargo build --release -p sandbox-host
    - run: cargo test -p sandbox-host
    - run: cargo clippy -D warnings -p sandbox-host
    - run: cargo fmt --check -p sandbox-host
```

- [ ] **Step 4: Commit**

```bash
git add crates/sandbox-host/Dockerfile docker-compose.yml .github/workflows/ci.yml
git commit -m "feat(sandbox): add Dockerfile and CI for Wasm sandbox host"
```

---

### Task 6: Migration Strategy & Documentation

**Files:**
- Create: `docs/sandbox-migration.md`
- Create: `docs/plugin-development-guide.md`
- Modify: `CONTRIBUTING.md` — add Wasm plugin section

- [ ] **Step 1: Migration guide**

```markdown
# docs/sandbox-migration.md

## Migrating from JS Worker to Wasm Sandbox

### For Plugin Authors

1. **Update manifest**: Add `capabilities` and `limits` fields
2. **Replace imports**: 
   - Old: `import { sendMessage } from 'apollo-plugin-api'`
   - New: `import { sendMessage } from 'apollo:plugin-api/discord'`
3. **Build with jco**: Run `pnpm run build:wasm` (uses jco)
4. **Test locally**: `sandbox-host-cli test ./plugin.wasm`

### Breaking Changes

| Old API | New API |
|---------|---------|
| `plugin.onLoad(config)` | `on_load(config: PluginConfig)` (Wasm export) |
| `plugin.handleInteraction(i)` | `handle_interaction(i: InteractionData)` |
| `require('fs')` | **Not allowed** - use `storage-guild` capability |
| `fetch()` | **Not allowed** - use `http-request` capability (allowlisted) |

### Capability Mapping

| Old Permission | New Capability |
|----------------|----------------|
| `DISCORD_SEND` | `discord-send-message` |
| `STORAGE_GUILD` | `storage-guild` |
| `HTTP_FETCH` | `http-request` (domain allowlist) |
```

- [ ] **Step 2: Plugin development guide**

```markdown
# docs/plugin-development-guide.md

## Building Wasm Plugins

### TypeScript

```bash
# 1. Create plugin
mkdir my-plugin && cd my-plugin
pnpm init
pnpm add -D typescript @apollo/plugin-api-types
# Copy template from plugins/template/typescript/

# 2. Write plugin
# src/index.ts exports: onLoad, onEnable, onDisable, onUnload, handleInteraction, handleEvent

# 3. Build
pnpm run build:wasm
# Outputs: dist/plugin.wasm, dist/manifest.json
```

### Rust

```bash
# 1. Create plugin
cargo component new my-plugin
cd my-plugin
# Copy template from plugins/template/rust/

# 2. Write plugin in src/lib.rs

# 3. Build
cargo component build --release
# Outputs: target/wasm32-wasip2/release/my-plugin.wasm
```

### Testing Locally

```bash
# Start sandbox host
docker compose up sandbox-host

# Test plugin
sandbox-host-cli test ./dist/plugin.wasm --fuel 1000000 --call on_load
```
```

- [ ] **Step 3: Commit**

```bash
git add docs/sandbox-migration.md docs/plugin-development-guide.md CONTRIBUTING.md
git commit -m "docs(sandbox): add migration guide and plugin development docs"
```

---

## Deferral Notice

**This plan is DEFERRED** pending:
- ≥3 third-party plugin authors requesting Wasm target
- Proven need for stronger isolation (security audit finding)
- Maturity of Wasm Component Model tooling (`jco`, `wac`, `wasi-capabilities`)

**Current Blocker**: `wasi-capabilities` is experimental; `jco` has limited TypeScript support; Component Model ecosystem not yet stable for production plugin distribution.

**Revisit Criteria**: 
- Wasmtime 25+ with stable `wasi-capabilities`
- `jco` 1.0+ with full TypeScript support
- At least 2 production Wasm plugin runtimes in ecosystem (e.g., Fermyon Spin, WasmCloud, Extism)

Do not implement until revisit criteria met.