# 0007: Observability Stack (OTel+Prometheus+Pino)

> **Status:** Accepted
> **Date:** 2026-09-27
> **Deciders:** Apollo maintainers
> **Technical Story:** [Phase 6 TypeScript Hygiene & Observability](docs/superpowers/plans/2026-09-27-phase6-typescript-hygiene-observability.md)

## Context

Apollo needs production-grade observability for a distributed system (gateway + workers + Redis + DB + external APIs). Requirements:
- Distributed tracing across process boundaries
- Metrics for SLI/SLO definition (latency, error rate, queue depth, business KPIs)
- Structured logging with correlation IDs
- Health/readiness endpoints for orchestration
- Low overhead in hot paths

We evaluated:
1. **Custom metrics/logging** — Rejected: no standardization; hard to integrate with Grafana/Prometheus ecosystem
2. **OpenTelemetry + Prometheus + Pino** — Selected: industry standard; vendor-neutral; rich ecosystem; TypeScript support

## Decision

**Three-pillar observability stack:**

1. **Tracing**: OpenTelemetry (`src/observability/otel.ts`)
   - `NodeTracerProvider` + OTLP HTTP exporter
   - W3C Trace Context propagation
   - HTTP instrumentation (auto)
   - Span helpers: `createSpan`/`endSpan` for manual instrumentation
   - Tracer namespaced: `interlink` tracer for cross-service traces

2. **Metrics**: Prometheus via `@prometheus-io/client` (`src/utils/metrics.ts`)
   - Default labels: `app=apollo-bot`, `pod=config.podId`
   - Node metrics collected with `apollo_` prefix
   - Custom metrics: commands (counter + histogram), queue, DB, plugins, workers, Redis, spam, HTTP, errors, gateway latency
   - **Critical**: `guild` label on `commandsTotal` removed (cardinality) per ADR 0001 SLO work

3. **Logging**: Pino (`src/utils/logger.ts`)
   - Structured JSON with service context (pid, hostname, traceId from OTel)
   - Child loggers for plugin/command/guild context
   - Sampling via `LOG_SAMPLE_RATE` (default 1.0)
   - Never `console.*` in runtime code

**Health Server** (`src/utils/healthServer.ts`): HTTP on port 9090
- `/health` — full checks (Redis, DB, Discord gateway)
- `/ready` — lightweight (for k8s readiness probe)
- `/metrics` — Prometheus exposition format
- Optional Bearer auth via `HEALTH_AUTH_TOKEN`

## Consequences

### Positive
- **Vendor neutral**: OTel exports to any backend (Jaeger, Tempo, Datadog, etc.)
- **Ecosystem**: Grafana dashboards, Prometheus alerting, standard tooling
- **Correlation**: Trace IDs link logs, metrics, traces across gateway/worker/interlink
- **Low overhead**: Sampling, async export, minimal allocations in hot path

### Negative
- **Complexity**: Three systems to configure/operate
- **Cardinality risk**: Metrics labels must be controlled (guild label removed from commandsTotal)
- **OTel maturity**: Node SDK stable but some instrumentations experimental

### Neutral / Risks
- **SLO layer missing**: Metrics exist but no recording rules/alerts/SLOs yet (separate initiative)
- **Log volume**: `LOG_SAMPLE_RATE` tuning needed for high-traffic guilds

## References

- Implementation: `src/observability/otel.ts`, `src/utils/metrics.ts`, `src/utils/logger.ts`, `src/utils/healthServer.ts`
- Plans: Phase 6 (2026-09-27)
- SLO work: ADR 0001 (gateway availability), separate SLO implementation plan
- Related: ADR 0001 (gateway metrics), ADR 0003 (queue metrics)