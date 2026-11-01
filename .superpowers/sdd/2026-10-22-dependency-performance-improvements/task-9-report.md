# Task 9 Report: Queue and Datastore OpenTelemetry Instrumentation

## Summary

Added BullMQ OpenTelemetry telemetry and PostgreSQL/ioredis instrumentation to the guarded OpenTelemetry lifecycle. Queue producers and workers receive the same telemetry instance when OTLP tracing is enabled, while tracing-disabled deployments retain the existing no-op behavior. Instrumentation versions were aligned with Apollo's existing OpenTelemetry package family after rejecting incompatible newer releases.

Queue telemetry is created without job metrics because Apollo already owns bounded Prometheus queue metrics. No queue payload, SQL value, Redis value, token, or message content is added by this integration.

## Verification

- `pnpm vitest run tests/observability/queue-otel.test.ts tests/observability/otel.test.ts tests/observability/traceparent.test.ts tests/core/queue/worker-config.test.ts`: passed, 4 files and 27 tests.
- `pnpm build`: passed.
- `pnpm lint --quiet`: passed.
- `git diff --check`: passed.
- `pnpm exec tsc --noEmit --pretty false`: remains blocked by the repository's pre-existing generated protobuf, Node type, and test type errors; no Task 9 production-source error remained after dependency alignment.

## Concerns

The instrumentation packages initially resolved to versions requiring an unreleased `@opentelemetry/api` export (`logs`). The workspace catalog was corrected to `@opentelemetry/instrumentation-pg` 0.74.0 and `@opentelemetry/instrumentation-ioredis` 0.70.0, matching the existing Apollo OpenTelemetry generation.
