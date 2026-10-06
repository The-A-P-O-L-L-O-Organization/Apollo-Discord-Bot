# src/plugins/interlink/

## Responsibility
ConnectRPC inter-bot messaging via the standalone Go relay: registration, 30s heartbeat, subscribe stream with backoff, forward-events allowlist bridge, and owner-only controls. Files present: `plugin.ts`, `connectClient.ts`, `auth.ts`, `tls.ts`, `validation.ts`, `locale.ts`, `commands/interlink.ts`, plus `locales/`.

## Files

| File | Purpose |
|------|---------|
| `plugin.ts` | Defines InterlinkPlugin class with registration, heartbeat, and subscribe loop |
| `connectClient.ts` | ConnectRPC client for the Go relay with HMAC auth and envelope handling |
| `auth.ts` | Issues and verifies JWT interlink tokens with per-bot capabilities |
| `tls.ts` | Loads TLS certificates from configured cert, key, and CA paths |
| `validation.ts` | Zod envelope validation helpers with formatted error output |
| `locale.ts` | Resolves and extracts interlink locale for translated responses |

Subdirectories: `commands/`, `locales/`.

## Design
- Class `InterlinkPlugin` in `plugin.ts` extends `src/core/Plugin.ts`. `onEnable` checks `config.interlink.enabled`, requires `INTERLINK_AUTH_KEY` (warns if missing or shorter than 32 chars), registers via `InterlinkConnectClient`, starts heartbeat and subscribe listener, bridges allowlisted core events, loads commands; `onDisable` aborts listener, clears heartbeat, unregisters, unloads. Idempotent.
- Trust: shared-key HMAC plus JWT capabilities in `auth.ts`; per-bot source self-asserted; delivery at-most-once (Accepted means accepted by Go service, no redelivery). TLS helpers in `tls.ts`, envelope checks in `validation.ts`, locale extraction in `locale.ts`.
- Inbound ping gets best-effort pong; all inbound envelopes re-emit as `interlink:message:<type>` on the core EventBus.
- i18n namespace `interlink`, locales in `locales/<locale>/common.json` (6 locales, `en-US` canonical, fixed translators, informal `du`).
- Patterns: Template Method (plugin lifecycle hooks), Pub/Sub (inbound envelopes re-emit as `interlink:message:<type>` on the EventBus), Adapter (`connectClient.ts` adapts the Go relay stream to plugin calls).

## Flow
1. Enable: validate config and key, register, start heartbeat, run subscribe loop with capped exponential backoff, bridge forward-events.
2. Inbound: Go Envelope pushed to stream, payload JSON-decoded, ping triggers pong plus emit, others emit `interlink:message:<type>`.
3. Outbound: bridge lists online peers via `listBots` skipping self and sends event envelopes; `/interlink send` targets one bot, broadcast/override fan out to `*`.
4. Disable: abort, clear timers, unregister, tear down bridge.

## Integration
- Dependencies: `src/core/Plugin.ts`, `src/generated/interlink/interlink/v1/*` protobuf plus Connect service, `src/config/config.ts`, `src/utils/logger.ts`, `@connectrpc/connect`, `@connectrpc/connect-node`, `@noble/hashes`.
- Consumers: plugin system on enable; other plugins listening to `interlink:*` EventBus events; Go service in `services/interlink/`.
