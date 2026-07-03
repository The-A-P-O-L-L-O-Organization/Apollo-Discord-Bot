# External Bot Integration Guide

This guide explains how to connect an external Discord bot to Apollo using the Interlink plugin.

## Overview

The Interlink plugin provides two communication transports:

- **HTTP (REST API):** Apollo runs an Express server that accepts POST messages. External bots POST to Apollo's endpoint, and Apollo also POSTs to the bot's registered webhook URL.
- **Redis Pub/Sub (optional):** For low-latency, bidirectional messaging without HTTP overhead. Requires that both bots share access to the same Redis instance.

## Quick Start

### 1. Register your bot via Discord

Run this command in a server where Apollo is present (bot owner only):

```
/interlink register name:my-bot webhook-url:https://my-bot.example.com/webhook description:"My custom bot"
```

Apollo will respond with an API key. **Save this key — it is shown only once.**

### 2. Send a health check (HTTP)

```bash
curl -X POST http://apollo-host:3456/api/v1/message \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "interlink",
    "version": "1",
    "type": "ping",
    "source": "my-bot",
    "target": "apollo",
    "id": "unique-message-id",
    "timestamp": 1719876543210,
    "payload": {}
  }'
```

Expected response (200):

```json
{
  "protocol": "interlink",
  "version": "1",
  "type": "pong",
  "source": "apollo",
  "target": "my-bot",
  "id": "response-uuid",
  "timestamp": 1719876543211,
  "payload": { "status": "ok", "uptime": 12345 }
}
```

## HTTP API Reference

### `POST /api/v1/message`

Receive messages from external bots.

**Headers:**
| Header | Value | Required |
|---|---|---|
| `Authorization` | `Bearer <api-key>` | Yes |
| `Content-Type` | `application/json` | Yes |

**Request Body (Message Envelope):**

| Field | Type | Description |
|---|---|---|
| `protocol` | string | Must be `"interlink"` |
| `version` | string | Message format version (`"1"`) |
| `type` | string | One of: `ping`, `pong`, `command`, `event`, `custom` |
| `source` | string | Your bot's registered name |
| `target` | string | `"apollo"` or `"all"` |
| `id` | string | Unique message identifier (UUIDv4) |
| `timestamp` | number | Unix ms timestamp |
| `payload` | object | Message-specific data |

**Response:** Returns `{ "status": "accepted", "id": "<envelope.id>" }` for non-ping messages. Returns a `pong` envelope for ping messages.

### `GET /api/v1/health`

Unauthenticated liveness check.

**Response:**
```json
{ "status": "ok", "service": "interlink", "timestamp": 1719876543210 }
```

## Receiving Messages from Apollo

Apollo sends messages to your bot's registered `webhook_url` via HTTP POST. Your bot must expose an endpoint that:

1. Accepts `POST` requests
2. Reads the JSON body (the message envelope)
3. Returns `200 OK` within 5 seconds
4. Optionally returns a response envelope for `ping` type

### Example: Node.js webhook receiver (Express)

```javascript
import express from 'express';
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const envelope = req.body;

  if (envelope.protocol !== 'interlink') {
    return res.status(400).json({ error: 'Unknown protocol' });
  }

  switch (envelope.type) {
    case 'ping':
      return res.json({
        protocol: 'interlink',
        version: '1',
        type: 'pong',
        source: 'my-bot',
        target: 'apollo',
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        payload: { status: 'ok', uptime: process.uptime() }
      });

    case 'command':
      console.log('Received command:', envelope.payload.command, envelope.payload.params);
      // Execute the command
      return res.json({ status: 'accepted' });

    case 'event':
      console.log('Received event:', envelope.payload.event, envelope.payload.data);
      return res.json({ status: 'accepted' });

    case 'custom':
      console.log('Custom message:', envelope.payload);
      return res.json({ status: 'accepted' });

    default:
      return res.status(400).json({ error: 'Unknown message type' });
  }
});

app.listen(3457, () => console.log('External bot listening on port 3457'));
```

### Example: Maintenance command forwarding

When Apollo runs `/interlink send my-bot type:command payload:{"command":"maintenance","params":{"mode":"on"}}`, it POSTs to your bot's webhook URL with:

```json
{
  "protocol": "interlink",
  "version": "1",
  "type": "command",
  "source": "apollo",
  "target": "my-bot",
  "id": "msg-uuid",
  "timestamp": 1719876543210,
  "payload": {
    "command": "maintenance",
    "params": { "mode": "on" }
  }
}
```

Your bot should parse `payload.command` and execute the corresponding logic.

## Redis Transport (Optional)

If both bots share the same Redis instance, you can use Redis pub/sub for lower-latency messaging.

### Apollo publishes to:

| Channel | Purpose |
|---|---|
| `apollo:interlink:message` | Broadcast messages to all external bots |

### External bot publishes to:

| Channel | Purpose |
|---|---|
| `apollo:interlink:response:<botId>` | Directed responses to Apollo |

### Example: Node.js Redis subscriber

```javascript
import Redis from 'ioredis';

const sub = new Redis({ host: 'redis-host', port: 6379 });
sub.subscribe('apollo:interlink:message');

sub.on('message', (channel, message) => {
  const envelope = JSON.parse(message);
  console.log('Received via Redis:', envelope);
});
```

## API Key Management

- Keys are generated on registration via `/interlink register`
- Rotate a key with `/interlink rotate-key name:my-bot` (old key invalidated immediately)
- Remove a bot with `/interlink remove name:my-bot`
- List all bots with `/interlink list`

## Message Types

### `ping` / `pong`

Health check. Ping triggers an automatic pong response.

### `command`

Execute a command on the target bot.

Payload:
```json
{ "command": "maintenance", "params": { "mode": "on" } }
```

### `event`

Notify other bots of an event that occurred.

Payload:
```json
{ "event": "memberJoin", "data": { "userId": "...", "guildId": "..." } }
```

### `custom`

Arbitrary developer-defined data. No schema constraints.

## Event Forwarding

Apollo can forward internal EventBus events to external bots. Configure which events to forward with the `INTERLINK_FORWARD_EVENTS` env var (comma-separated):

```
INTERLINK_FORWARD_EVENTS=memberJoin,guildBanAdd
```

When an event fires, Apollo creates a `command`-type message with the event name and data, and sends it to all active registered bots.

## Troubleshooting

| Symptom | Likely Cause |
|---|---|
| `401 Unauthorized` | Invalid or missing API key in Authorization header |
| `400 Bad Request` | Malformed message envelope (missing fields or invalid type) |
| Delivery failures logged | Bot's webhook URL is unreachable or returns non-200 status |
| Redis messages not received | Redis connection config mismatch or channel not subscribed |
