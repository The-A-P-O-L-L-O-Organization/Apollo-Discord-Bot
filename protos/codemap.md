# protos/

## Responsibility
Authoritative Protobuf contracts for inter-bot relay and NSFW classification shared by TypeScript and Go.

## Files

| File | Purpose |
|---|---|
| `interlink/v1/interlink.proto` | Defines `InterlinkService` RPCs (Send/Subscribe/Connect/RegisterBot/Heartbeat/UnregisterBot/ListBots/GetBotInfo) and the `Envelope` message. |
| `nsfw/v1/nsfw.proto` | Defines `NsfwService` RPCs (Analyze/HealthCheck) for image classification. |

## Design
- `interlink/v1/interlink.proto` defines `InterlinkService` with `Send`, `Subscribe`, `Connect`, `RegisterBot`, `Heartbeat`, `UnregisterBot`, `ListBots`, and `GetBotInfo` plus the `Envelope` message.
- `nsfw/v1/nsfw.proto` defines `NsfwService` with `Analyze` and `HealthCheck` messages for image bytes, thresholds, predictions, and model health.
- `proto3` syntax with `go_package` options for the Go relay generator.
- Patterns: none — authoritative data-only contract definitions with no patterns of their own.

## Flow
1. Contract change is made in the `.proto` source.
2. Buf lints the change with `pnpm proto:lint` and checks compatibility with `pnpm proto:breaking`.
3. TypeScript output is generated under `src/generated/` and Go output under `services/interlink/gen/go/`.
4. Both runtimes update parsing and handler code against the regenerated types.

## Integration
- TypeScript consumers use `src/generated/`; Go relay uses `services/interlink/gen/go/` with ConnectRPC handlers.
- Breaking changes require a major version or compatibility plan; generated code, manifests, and runtime parsing stay synchronized.
