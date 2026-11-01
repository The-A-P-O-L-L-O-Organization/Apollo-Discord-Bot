# OpenTelemetry Full Upgrade Design

## Intent

Upgrade Apollo's OpenTelemetry dependency family together instead of merging
individual Dependabot bumps. The goal is to remove the current mixed-generation
constraint, retain existing trace propagation and instrumentation coverage, and
leave the bot with a supported, verifiable telemetry stack.

## Goals

- Align the direct OpenTelemetry packages to one compatible release family:
  current API, SDK, core/resource/context packages, semantic conventions,
  instrumentation packages, OTLP HTTP exporter, SDK Node, and auto-instrumentations.
- Regenerate `pnpm-lock.yaml` and shared dependency catalogs consistently.
- Update `src/observability/otel.ts` and directly dependent call sites only where
  current APIs require it.
- Preserve OTLP opt-in behavior, no-op test behavior, W3C propagation, graceful
  shutdown, and HTTP/Redis/Postgres/BullMQ instrumentation.
- Add or update focused tests for initialization, shutdown, propagation, and
  exporter-disabled behavior.

## Non-goals

- No unrelated dependency refresh beyond the OpenTelemetry family and directly
  required peer adjustments.
- No redesign of Apollo's metrics, logging, queue telemetry, or trace schema.
- No adoption of experimental OTel features that are not required by Apollo.

## Constraints

- Node.js 26, strict TypeScript ESM, pnpm, and the repository's existing
  OpenTelemetry integration patterns remain authoritative.
- The upgrade must not silently enable exporters in tests or production without
  configured endpoints.
- Compatibility must be established by the repository's build, lint, typecheck,
  and Vitest checks rather than by version ranges alone.

## Approaches

1. **Merge Dependabot PRs independently.** Smallest diffs, but leaves the
   OpenTelemetry family mixed and already demonstrated incompatibility through
   the failed context-async-hooks update.
2. **Update the complete family and adapt Apollo's bootstrap.** One coordinated
   lockfile and source change, with a larger review surface but the clearest
   compatibility boundary. **Recommended** because the requested outcome is a
   full upgrade and OTel packages are released in interdependent generations.
3. **Freeze the current generation and close the updates.** Lowest immediate
   change risk, but does not satisfy the requested modernization or remove the
   deprecated package signals.

## Proposed implementation

Use the latest mutually compatible OpenTelemetry family supported by the
repository's Node.js target. Update the catalog and direct dependency
specifiers together, regenerate the lockfile, then migrate the bootstrap to the
current `NodeSDK`/resource/instrumentation APIs if required. Keep exporter
configuration explicit and bounded, preserve the existing public helper
functions, and update focused tests before running the repository verification
gates.

## Verification

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm typecheck`
- focused OpenTelemetry tests
- `pnpm test`
- `pnpm build`
- dependency audit and lockfile consistency checks
