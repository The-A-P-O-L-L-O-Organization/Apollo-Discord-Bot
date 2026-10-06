# src/observability/

## Responsibility
OpenTelemetry tracing bootstrap for the bot, with Prometheus metrics and structured pino logs composed at the application layer.

## Files

| File | Purpose |
|---|---|
| `otel.ts` | Bootstraps OpenTelemetry tracing (init, tracer access, W3C context propagation, shutdown). |

## Design
- Single module `otel.ts` with guarded `initializeOtel`, `getTracer`, W3C context `injectTraceContext` and `extractTraceContext`, and `shutdownOtel` for lifecycle management.
- OTLP HTTP trace exporter behind `BatchSpanProcessor` with `AsyncHooksContextManager` and W3C propagator.
- Auto-instrumentation limited to HTTP, Express, and gRPC; service identity comes from caller-supplied `serviceName`, endpoint, and headers.
- Patterns: Singleton (guarded one-time `initializeOtel` with no-op repeats), Facade (`otel.ts` wrapping provider, exporter, context manager, and propagator).

## Flow
1. Application calls `initializeOtel` once at startup with service name and OTLP endpoint; repeat calls are no-ops.
2. Context manager and provider are registered globally with resource attributes for the service name.
3. Request and job paths create spans via `getTracer` and propagate context through carriers.
4. Shutdown flushes the provider and resets initialization state for test or restart flows.

## Integration
- Sampling is controlled by `LOG_SAMPLE_RATE`; log retention follows `SECURITY_LOG_RETENTION_DAYS`.
- Metrics follow Prometheus conventions and health endpoints remain lightweight; high-cardinality labels and user content in traces are prohibited.
- Connects TypeScript bot traces with Go interlink telemetry over OTLP.
