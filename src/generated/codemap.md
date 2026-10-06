# src/generated/

## Responsibility
Buf-generated TypeScript clients and message types for interlink and NSFW contracts; never hand-edit.

## Files

| File | Purpose |
|---|---|
| `interlink/interlink/v1/interlink_pb.ts` | Generated message codecs for the interlink relay service (buf output). |
| `interlink/nsfw/v1/nsfw_connect.ts` | Generated ConnectRPC client for the NSFW service (buf output). |
| `interlink/nsfw/v1/nsfw_pb.ts` | Generated message codecs for the NSFW service (buf output). |
| `nsfw/interlink/v1/interlink_connect.ts` | Generated ConnectRPC client for the interlink relay service (buf output). |
| `nsfw/interlink/v1/interlink_pb.ts` | Generated message codecs for the interlink relay service (buf output). |
| `nsfw/nsfw/v1/nsfw_connect.ts` | Generated ConnectRPC client for the NSFW service (buf output). |
| `nsfw/nsfw/v1/nsfw_pb.ts` | Generated message codecs for the NSFW service (buf output). |
| `nsfw/nsfw/v1/nsfw.ts` | Hand-maintained NSFW protobuf package helpers alongside generated code. |

## Design
- Generated trees mirror proto packages: `interlink/interlink/v1/`, `interlink/nsfw/v1/`, `nsfw/interlink/v1/`, and `nsfw/nsfw/v1/`.
- Each service directory holds `_pb.ts` message codecs, `_connect.ts` ConnectRPC clients, and `nsfw.ts` helpers where applicable.
- Checked-in output is the build input for bot-side relay and classifier calls.
- Patterns: none — generated data-only codecs and clients with no patterns of their own.

## Flow
1. Source contracts change under `protos/interlink/` and `protos/nsfw/`.
2. Buf regenerates this tree through the documented workflow.
3. Callers import the regenerated message and client types; no manual patches are applied.
4. Verification runs `pnpm proto:lint` and `pnpm proto:breaking` plus generated-code tests.

## Integration
- Source of truth is `protos/`; generation output must stay synchronized with runtime parsing and the Go relay in `services/interlink/`.
- Breaking changes require a major version or explicit compatibility plan.
- Excluded from coverage; do not chase coverage in this path.
