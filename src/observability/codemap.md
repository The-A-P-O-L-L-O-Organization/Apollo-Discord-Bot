# src/observability/

## Responsibility
OpenTelemetry tracing bootstrap for the bot, with Prometheus metrics and structured pino logs composed at the application layer. Also owns W3C `traceparent` serialization for cross-process trace correlation through the command queue.

## Files

| File | Purpose |
|---|---|
| `otel.ts` | Bootstraps OpenTelemetry tracing (init, tracer access, W3C context propagation, shutdown). |
| `traceparent.ts` | W3C `traceparent` helpers: read the active span's header, parse remote headers into `SpanContext`, and run callbacks under an extracted remote parent. |

## Design
- Single module `otel.ts` with guarded `initializeOtel`, `getTracer`, W3C context `injectTraceContext` and `extractTraceContext`, and `shutdownOtel` for lifecycle management.
- OTLP HTTP trace exporter behind `BatchSpanProcessor` with `AsyncHooksContextManager` and W3C propagator.
- Auto-instrumentation limited to HTTP, Express, and gRPC; service identity comes from caller-supplied `serviceName`, endpoint, and headers.
- `traceparent.ts` depends only on `@opentelemetry/api`, so queue producers and workers can use it without importing the SDK; strict version-`00` parsing with zero-ID rejection keeps malformed or invalid headers out of the context chain.
- Patterns: Singleton (guarded one-time `initializeOtel` with no-op repeats), Facade (`otel.ts` wrapping provider, exporter, context manager, and propagator).

## Flow
1. Application calls `initializeOtel` once at startup with service name and OTLP endpoint; repeat calls are no-ops. Both gateway and worker paths do this when `OTEL_ENDPOINT` is set; production warns at startup when it is unset.
2. Context manager and provider are registered globally with resource attributes for the service name.
3. Request and job paths create spans via `getTracer` and propagate context through carriers. Command enqueues attach `currentTraceparent()` to the job payload; workers run job handling inside `runWithExtractedTrace`, so job spans and logs carry the originating gateway trace.
4. `logger.ts` consumes `traceLogFields` (via `ZERO_TRACE_ID`/`ZERO_SPAN_ID` guards) to stamp `trace_id` and `span_id` on every log line.
5. Shutdown flushes the provider and resets initialization state for test or restart flows.

## Integration
- Sampling is controlled by `LOG_SAMPLE_RATE`; log retention follows `SECURITY_LOG_RETENTION_DAYS`.
- Metrics follow Prometheus conventions and health endpoints remain lightweight; high-cardinality labels and user content in traces are prohibited.
- Connects TypeScript bot traces with Go interlink telemetry over OTLP.
- `src/queue/jobs/processCommand.ts` is the primary consumer of `traceparent.ts`; correlation requires `OTEL_ENDPOINT` on both gateway and worker pods because the async context manager is installed by `initializeOtel`.
