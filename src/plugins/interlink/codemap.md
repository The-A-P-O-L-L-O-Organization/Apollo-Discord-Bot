Responsibility
The interlink module provides ConnectRPC-based inter-bot communication for the Apollo Discord bot via the standalone Go service. It registers this bot, maintains heartbeats, subscribes to inbound envelopes, forwards configured core events to peer bots, and exposes owner-only slash commands (list/register/remove/send/broadcast/override) backed by InterlinkConnectClient.

Design
- Connect-only architecture: InterlinkPlugin owns a single InterlinkConnectClient (HMAC-SHA256 auth over the shared INTERLINK_AUTH_KEY trust domain) with register-on-enable, 30s heartbeat (unrefed, re-registers after 3 consecutive failures), and a subscribe listener with capped exponential-backoff reconnect until disabled.
- Trust model: any holder of the shared auth key is fully trusted and per-bot source identity is self-asserted. Delivery is at-most-once: Send Accepted:true means accepted by the Go service even when the target is offline.
- Inbound ping envelopes get a best-effort pong reply via Connect send; all inbound envelopes are emitted as interlink:message:<type> events on the core eventBus using the legacy envelope shape (decoded JSON payload, numeric timestamp).
- Commands map stable subcommand names/options onto Connect RPCs (listBots/registerBot/unregisterBot/send); broadcast and override use target '*' fan-out; rotate-key is retired (replies with shared-secret rotation guidance, no per-bot keys).

Flow
Inbound: Go service pushes Envelope to subscribe stream -> _runConnectListener decodes payload -> ping triggers pong send plus interlink:message:ping emit; other types emit interlink:message:<type>.
Outbound: event bridge lists online peer bots via listBots (skipping self) and sends event envelopes; /interlink send targets one bot, broadcast/override target '*'.
Plugin lifecycle: onEnable checks config.interlink.enabled, warns loudly and skips when INTERLINK_AUTH_KEY is absent (warns when shorter than 32 chars), registers, starts heartbeat and listener, bridges events, loads commands; onDisable aborts the listener, clears heartbeat, unregisters, unloads commands, tears down the bridge.

Integration
Dependencies:
- core/Plugin.js (base class)
- generated/interlink/interlink/v1 (protobuf types + Connect service)
- config/config.js (interlink.enabled/grpcAddress/authKey/publicKey, discord.clientId)
- utils/logger.js (logging)
- @connectrpc/connect, @connectrpc/connect-node, @noble/hashes (external libraries)
Consumers:
- Main application loads InterlinkPlugin via plugin system.
- Other plugins can listen to interlink:* events on the eventBus for inbound messages.
