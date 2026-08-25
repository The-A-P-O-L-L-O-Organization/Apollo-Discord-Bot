Responsibility
The interlink module provides secure, extensible inter-bot communication for the Apollo Discord bot. It manages bot registration, authenticated message exchange, rate limiting (both in-memory and Redis-backed distributed), optional Redis pub/sub for response channels, and HTTP API exposure for external bots to send and receive messages, events, and commands.

Design
- Modular class-based architecture with dependency injection: InterlinkServer (Express wrapper with security headers, compression, and rate limiting), RateLimiter (supports both Redis-backed distributed sliding window and in-memory LRU fallback), MessageBus (envelope creation, sending, broadcasting, handling), BotRegistry (CRUD operations on interlink_bots table), RedisTransport (ioredis wrapper for response channels), Auth middleware (API key validation via bcrypt), and configuration management.
- Plugin pattern: InterlinkPlugin extends core Plugin, enabling lifecycle hooks (onEnable/onDisable) that initialize subcomponents, configure event bridging, and load command plugins.
- Middleware: Express JSON body parser, compression, helmet security headers, and API key authentication middleware (createAuthMiddleware) validate Bearer tokens via bcrypt comparison against stored hashes.
- Factory functions: createRoutes builds Express router with injected registry and messageBus; generateApiKey creates raw key, bcrypt hash, and prefix for bot credentials.
- Event-driven: Uses core eventBus to emit interlink:* messages and forward configured events to registered bots via HTTP.
- Distributed rate limiting: Implements Redis-backed sliding window rate limiter with Lua scripts for atomic operations, falling back to in-memory LRU cache when Redis is unavailable.
- Security: Helmet for CSP and security headers, trust proxy support, metrics endpoint restricted to localhost, and lenient rate limiting on health/metrics endpoints.

Flow
Inbound: External bot POSTs JSON envelope to /message -> authMiddleware validates API key -> routes.js forwards envelope to messageBus.handleIncomingMessage -> if type===ping, emit pong and optional interlink:message:ping event -> for other types, emit interlink:message:<type> event -> if envelope.target===apollo and RedisTransport configured, publishResponse to bot-specific Redis channel.
Outbound: MessageBus.send(botName, type, payload) or broadcast(type, payload) retrieves bot(s) from registry, creates envelope, calls _sendHttp which performs HTTP POST with retries via safeFetch to bot.webhook_url, returning success/failure.
Plugin lifecycle: onEnable reads config, instantiates BotRegistry with DB connection, builds MessageBus with registry and eventBus, starts InterlinkServer on configured port, optionally connects RedisTransport and sets up message handler, bridges core events to outbound messages, loads interlink command plugins; onDisable stops server, disconnects Redis, unloads commands, tears down event bridge.

Integration
Dependencies:
- core/Plugin.js (base class)
- db/knex.js (database access)
- utils/safeFetch.js (HTTP client with timeout)
- utils/redis.js (Redis client creation)
- utils/logger.js (logging)
- utils/metrics.js (Prometheus metrics)
- utils/lock.js (Redis lock client)
- utils/lruCache.js (LRU cache implementation)
- express, helmet, compression, bcryptjs, crypto, ioredis (external libraries)
Consumers:
- Main application loads InterlinkPlugin via plugin system.
- External bots interact via HTTP API at /message (POST) and optionally receive responses via Redis pub/sub channels.
- Other plugins can listen to interlink:* events on the eventBus for inbound messages.