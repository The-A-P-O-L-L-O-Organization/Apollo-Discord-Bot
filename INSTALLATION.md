# Installation Guide

This guide covers every supported way to install and run Apollo: local single-instance development, production single-instance containers, multi-instance gateway plus worker topologies with Docker Compose, and self-managed processes with PostgreSQL and Redis. It also covers upgrades, command registration, and recovery.

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Discord Application Setup](#2-discord-application-setup)
- [3. Quick Start: Single Instance](#3-quick-start-single-instance)
- [4. Environment Reference](#4-environment-reference)
- [5. Slash Command Registration](#5-slash-command-registration)
- [6. Running from Source](#6-running-from-source)
- [7. Docker and Docker Compose](#7-docker-and-docker-compose)
- [8. Multi-Instance Topology](#8-multi-instance-topology)
- [9. PostgreSQL Setup](#9-postgresql-setup)
- [10. Redis and Queue Setup](#10-redis-and-queue-setup)
- [11. Interlink Relay Setup](#11-interlink-relay-setup)
- [12. Optional Integrations](#12-optional-integrations)
- [13. Sharding](#13-sharding)
- [14. Upgrading](#14-upgrading)
- [15. Verification Checklist](#15-verification-checklist)
- [16. Troubleshooting](#16-troubleshooting)

## 1. Prerequisites

### Required for every install

- Node.js 26 or later (`node --version`)
- pnpm 11 or later (`pnpm --version`)
- Git
- A Discord application with bot token and client ID
- OpenSSL or equivalent for secret generation (used for `ENCRYPTION_KEY` and `QUEUE_HMAC_SECRET`)

Install pnpm through corepack:

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

### Required for container installs

- Docker Engine 24 or later
- Docker Compose v2 (`docker compose version`)

### Required for multi-instance installs

- PostgreSQL 14 or later (16 or 18 recommended; the Compose profile uses Postgres 18)
- Redis 7 or later (Redis 8 recommended)
- Network reachability from every bot pod to Postgres and Redis

### Required for source builds with optional services

- Rust 1.88 toolchain if building NSFW components (`cargo --version`)
- Go toolchain matching `services/interlink/go.mod` if building the relay
- `buf` v1.50.0 plus `protoc` and `ts-proto` if regenerating protobuf clients

## 2. Discord Application Setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Copy the Application ID; this becomes `CLIENT_ID`.
3. Open Bot settings, reset the token, and copy it; this becomes `DISCORD_TOKEN`.
4. Disable Public Bot if the bot is private to your servers.
5. Enable these privileged gateway intents as needed by your feature set:
   - Server Members Intent for join/leave logging, autorole, and raid detection
   - Message Content Intent for automod message inspection and legacy prefix-adjacent behavior
6. Generate an invite URL under OAuth2 URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Permissions: View Channel, Send Messages, Embed Links, Read Message History, Add Reactions, Manage Messages, Manage Roles, Manage Channels, Kick Members, Ban Members, Moderate Members, Mention Everyone where your moderation workflows require it
7. Invite the bot to a test guild and keep that guild ID handy as `GUILD_ID` for instant command sync.

Create support channels before first boot:

- `#welcome` for welcome messages
- `#mod-logs` for moderation audit output
- A `Muted` role is optional; Discord timeout is preferred and the role path is a fallback

## 3. Quick Start: Single Instance

Single instance uses SQLite, needs no external services, and is the recommended starting point.

### 3.1 Clone and install

```bash
git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
cd Apollo-Discord-Bot
pnpm install
```

If native bindings fail on first install:

```bash
pnpm rebuild better-sqlite3
```

### 3.2 Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
DISCORD_TOKEN=your-discord-bot-token-here
CLIENT_ID=your-client-id-here
OWNER_IDS=your-discord-user-id
ENCRYPTION_KEY=your-base64-encoded-32-byte-key
OPERATOR_AGREEMENT=true
OPERATOR_CONTACT=Discord: @you
```

Generate the encryption key:

```bash
openssl rand -base64 32
```

Key rotation uses a comma-separated list where the first entry encrypts new data and all entries can decrypt:

```env
ENCRYPTION_KEY=current-key,legacy-key-1,legacy-key-2
```

You must read `legal/TOS.md` and `legal/PRIVACY.md` before setting `OPERATOR_AGREEMENT=true`. The startup guard refuses to boot with `false`, empty contact details, placeholder tokens, or a missing encryption key.

### 3.3 Build, register commands, start

```bash
pnpm build
pnpm run deploy:commands
pnpm start
```

Expected startup lines include plugin load summaries and an online notice. Open Discord and run:

- `/help` to confirm command registration
- `/system` to confirm health reporting
- `/plugin list` to confirm all seven first-party plugins loaded

For iterative development instead of compiled output:

```bash
pnpm dev
```

## 4. Environment Reference

`.env.example` is authoritative. Values below show defaults and intent; unset commented lines fall back to code defaults in `src/config/config.ts`.

### 4.1 Required

| Variable | Purpose |
|----------|---------|
| `DISCORD_TOKEN` | Bot token used for gateway login and REST calls |
| `CLIENT_ID` | Application ID used for command registration |
| `OWNER_IDS` | Comma-separated owner IDs for `/plugin`, `/system`, `/queue`, `/migrate`, `/interlink`, global blacklist |
| `ENCRYPTION_KEY` | Base64 key material for sensitive data; supports rotation lists |
| `OPERATOR_AGREEMENT` | Must be literal `true` after reading legal documents |
| `OPERATOR_CONTACT` | Published through `/operatorcontact`; required when agreement is true |

### 4.2 Core runtime

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | unset (development behavior) | `production` enables production warnings and guards |
| `RUN_MODE` | `gateway` | `gateway` for WebSocket or `worker` for queue consumer |
| `POD_ID` | hostname or `default` | Unique identity for leader election and locks |
| `GUILD_ID` | unset | Instant guild command sync for development |
| `SHARD_COUNT` | `1` | Fixed shard total or `auto`; see sharding section |
| `PLUGIN_DIR` | `./src/plugins` | Worker sandbox plugin root |
| `APOLLO_GUILD_ID` | unset | Guild scope for CLI operations |
| `APOLLO_SOCKET_PATH` | `./data/apollo.sock` | Unix socket for admin RPC |
| `APOLLO_SOCKET_TOKEN` | unset | Bearer token for socket authentication |

### 4.3 Database

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_TYPE` | `sqlite` | `sqlite` for single instance, `postgres` for shared state |
| `DATABASE_URL` | `postgresql://localhost:5432/apollo` | Required when `DB_TYPE=postgres` |
| `DB_POOL_MIN` | `2` | Minimum Postgres pool connections |
| `DB_POOL_MAX` | `10` | Maximum pool connections; auto-capped near server limits |

### 4.4 Redis and queue

| Variable | Default | Purpose |
|----------|---------|---------|
| `QUEUE_ENABLED` | `false` | `true` enables BullMQ over Redis |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_USERNAME` | `default` | Redis ACL username where applicable |
| `REDIS_PASSWORD` | unset | Redis password; required in production |
| `QUEUE_PREFIX` | `apollo` | Key prefix isolating environments |
| `QUEUE_STALLED_INTERVAL` | `30000` | Stalled-job scan interval in milliseconds |
| `QUEUE_HMAC_SECRET` | unset | Job integrity secret; generate with `openssl rand -base64 32` |

### 4.5 Interlink

| Variable | Default | Purpose |
|----------|---------|---------|
| `INTERLINK_ENABLED` | `false` | Enables cross-bot RPC plugin |
| `INTERLINK_GRPC_ADDR` | `http://localhost:50052` | Go relay address |
| `INTERLINK_AUTH_KEY` | unset | Shared HMAC secret, minimum 32 characters |
| `INTERLINK_JWT_SECRET` | unset | Per-bot JWT signing secret, minimum 32 characters |
| `INTERLINK_JWT_EXPIRY` | `24h` | Token lifetime |
| `INTERLINK_TLS_CERT` | unset | Client certificate path for mTLS |
| `INTERLINK_TLS_KEY` | unset | Client key path for mTLS |
| `INTERLINK_CA_CERT` | unset | CA bundle path for mTLS |
| `INTERLINK_PUBLIC_KEY` | unset | Base64 Ed25519 public key advertised at registration |
| `INTERLINK_FORWARD_EVENTS` | unset | Comma-separated core events forwarded to peers, for example `memberJoin,guildBanAdd` |

Delivery is at-most-once. Acceptance by the relay does not guarantee the remote bot was online.

### 4.6 Integrations, translation, AI, NSFW

| Variable | Purpose |
|----------|---------|
| `INTEGRATIONS_WEBHOOK_PORT` | Local port for GitHub webhooks |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for webhook signature verification |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Twitch polling credentials |
| `YOUTUBE_API_KEY` | YouTube polling credential |
| `INTEGRATIONS_POLL_TWITCH` | Twitch interval in milliseconds, default 300000 |
| `INTEGRATIONS_POLL_YOUTUBE` | YouTube interval in milliseconds, default 300000 |
| `INTEGRATIONS_POLL_RSS` | RSS interval in milliseconds, default 900000 |
| `TRANSLATION_API_BASE_URL` | LibreTranslate endpoint |
| `TRANSLATION_API_KEY` | LibreTranslate key when required |
| `OPENAI_API_KEY` | Optional AI moderation endpoint |
| `NSFW_USE_RUST` | `true` routes NSFW scoring to the Rust gRPC server |
| `NSFW_GRPC_ADDR` | Rust NSFW server address, default `localhost:50051` |
| `NSFW_THRESHOLD` | Percentage threshold, default `60` |
| `NSFW_RUST_TIMEOUT_MS` | Scoring timeout, default `5000` |

### 4.7 Security and logging

| Variable | Default | Purpose |
|----------|---------|---------|
| `SECURITY_LOG_RETENTION_DAYS` | `90` | Security event retention window |
| `ALLOW_UNVERIFIED_PLUGINS` | `0` | Set `1` only for local development; warns in production |
| `LOG_SAMPLE_RATE` | `1.0` | Fraction of logs emitted under load |

## 5. Slash Command Registration

Registration uses Discord REST and is separate from starting the bot:

```bash
pnpm run deploy:commands
```

Behavior:

- Without `GUILD_ID`, commands register globally and can take up to one hour to propagate.
- With `GUILD_ID`, commands register to one guild instantly for development.
- `CLIENT_ID` and `DISCORD_TOKEN` must be valid; the script exits non-zero otherwise.
- Command definitions come from `src/plugins/*/commands/*.ts`; no manual manifest editing is needed.

Rerun registration after adding, renaming, or removing commands or changing descriptions, options, permissions, or locales.

## 6. Running from Source

### Development

```bash
pnpm dev
RUN_MODE=worker pnpm dev:worker
pnpm dev:gateway
pnpm dev:shard
```

`tsx watch` reloads TypeScript directly without emitting `dist/`.

### Production from compiled output

```bash
pnpm build
pnpm start
pnpm start:gateway
pnpm start:worker
```

`pnpm build` emits `dist/` through `tsconfig.build.json`. Containers and process managers must run `dist/index.js`, not `src/index.ts`.

### Admin CLI

```bash
pnpm apollo -- --help
node dist/bin/apollo.js --help
```

The CLI discovers specs from `src/cli/` plus plugin `cli/` directories and talks to a running bot over `APOLLO_SOCKET_PATH` when socket RPC is required.

## 7. Docker and Docker Compose

### 7.1 Images

- `Dockerfile`: development-friendly image
- `Dockerfile.prod`: multi-stage production image
- Published tag: `ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest`

Build locally:

```bash
docker build -f Dockerfile.prod -t apollo-discord-bot .
```

### 7.2 Single instance with Compose

Default service runs one bot with SQLite and file-backed data volumes:

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

The Compose bot service sets `HEALTH_PORT=3000`, mounts `bot-data:/app/src/data` and `bot-plugins:/app/data/plugins`, and checks `/health` every 30 seconds.

### 7.3 Multi-instance with Compose profile

The `multi` profile adds Postgres 18 and Redis 8 plus a worker service:

```bash
docker compose --profile multi up -d
```

Required `.env` additions for this profile:

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://apollo:strong-password@postgres:5432/apollo
QUEUE_ENABLED=true
REDIS_HOST=redis
REDIS_PASSWORD=strong-password
POSTGRES_PASSWORD=strong-password
REDIS_PASSWORD=strong-password
```

Scale workers:

```bash
docker compose --profile multi up -d --scale worker=3
```

### 7.4 Manual container runs

Single instance:

```bash
docker run -d \
  --name apollo \
  --env-file .env \
  -v apollo-data:/app/src/data \
  ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest
```

Gateway plus worker pair:

```bash
docker run -d --name apollo-gateway --env-file .env -e RUN_MODE=gateway apollo-discord-bot
docker run -d --name apollo-worker-1 --env-file .env -e RUN_MODE=worker apollo-discord-bot
```

## 8. Multi-Instance Topology

Use multi-instance when any of these apply: redundant gateway failover, parallel job throughput, shared Postgres state, or Kubernetes-style horizontal scaling.

```text
Discord
  |
Gateway pods (2 replicas recommended, 1 leader active)
  | BullMQ enqueue
Redis-backed queues
  | BullMQ consume
Worker pods (2 to 10 depending on backlog)
  |
PostgreSQL shared database
```

Rules:

- Every pod shares the same `DATABASE_URL`, Redis credentials, `QUEUE_PREFIX`, and `QUEUE_HMAC_SECRET`.
- Every pod has a unique `POD_ID`; Compose and Kubernetes should inject hostname or pod name.
- Only gateway pods connect to Discord; worker pods use REST callbacks.
- SQLite must not be used here; concurrent writers will corrupt it.
- Keep gateway replicas at two for failover; scale workers on queue depth from `/queue` or Prometheus metrics.

Kubernetes users can model gateway and worker as separate deployments with distinct `RUN_MODE` values, shared secrets for tokens and database URLs, and an HPA on worker CPU or queue depth. There is no checked-in `k8s/` directory; use the Compose profile as the reference topology.

## 9. PostgreSQL Setup

Create database and least-privilege user:

```sql
CREATE DATABASE apollo;
CREATE USER apollo WITH PASSWORD 'strong-password';
GRANT ALL PRIVILEGES ON DATABASE apollo TO apollo;
\c apollo
GRANT ALL ON SCHEMA public TO apollo;
```

Configure the bot:

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://apollo:strong-password@postgres-host:5432/apollo
DB_POOL_MIN=2
DB_POOL_MAX=10
```

Run migrations through the admin command or Knex directly:

```bash
pnpm build
node -e "import('./dist/db/knex.js').then(m => m.runMigrations())"
```

Migration files live in `src/db/migrations/*.cjs`. The startup pool validator caps `DB_POOL_MAX` when it exceeds 80 percent of Postgres `max_connections` and logs the adjustment.

Postgres 18 note from Compose: data lives at `/var/lib/postgresql`, and major-version upgrades require dump/restore or `pg_upgrade` into a fresh volume. Snapshot `postgres-data` before changing major versions.

## 10. Redis and Queue Setup

Enable BullMQ on every pod that enqueues or consumes:

```env
QUEUE_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=strong-password
QUEUE_PREFIX=apollo
QUEUE_STALLED_INTERVAL=30000
QUEUE_HMAC_SECRET=your-base64-encoded-32-byte-secret
```

Operational guidance:

- Use authentication in every non-local environment.
- Use distinct `QUEUE_PREFIX` values per environment sharing one Redis cluster.
- Job payloads are HMAC-signed when `QUEUE_HMAC_SECRET` is set; keep it identical across pods.
- Queue code lives in `src/queue/queue.ts`, serialization in `serializeInteraction.ts` and `remoteInteraction.ts`, execution in `src/queue/jobs/`.
- Failed jobs retry with exponential backoff; inspect `/queue` for waiting, active, completed, failed, and delayed counts.

Local Redis for testing:

```bash
docker run -d --name redis -p 6379:6379 redis:8-alpine
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=pass postgres:18.6-alpine
```

## 11. Interlink Relay Setup

Interlink is optional and requires the Go service plus the TypeScript plugin.

1. Build the relay:

```bash
cd services/interlink
go build ./...
go test ./...
```

2. Configure the bot:

```env
INTERLINK_ENABLED=true
INTERLINK_GRPC_ADDR=http://localhost:50052
INTERLINK_AUTH_KEY=at-least-32-characters-shared-secret
INTERLINK_JWT_SECRET=at-least-32-characters-jwt-secret
INTERLINK_JWT_EXPIRY=24h
INTERLINK_FORWARD_EVENTS=memberJoin,guildBanAdd
```

3. For mutual TLS, set certificate, key, and CA paths and distribute them to every peer.
4. Advertise `INTERLINK_PUBLIC_KEY` when peers verify bot identity through Ed25519 keys.
5. Treat `INTERLINK_AUTH_KEY` as fully trusted bearer material; anyone holding it can assert any bot identity.

Protobuf sources are `protos/interlink/v1/interlink.proto` and `protos/nsfw/v1/nsfw.proto`. Regenerate clients after schema changes:

```bash
pnpm proto:lint
pnpm proto:generate
```

## 12. Optional Integrations

### GitHub webhooks

```env
INTEGRATIONS_WEBHOOK_PORT=8080
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret
```

Expose the webhook port to GitHub, configure repository webhooks with JSON payloads and the same secret, and use `/integration` to map repositories to announcement channels. Signatures are verified before processing.

### Twitch and YouTube polling

```env
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
YOUTUBE_API_KEY=your-youtube-api-key
INTEGRATIONS_POLL_TWITCH=300000
INTEGRATIONS_POLL_YOUTUBE=300000
INTEGRATIONS_POLL_RSS=900000
```

Pollers run under distributed locks so only one pod announces each live event. Start with default intervals and shorten only when quota allows.

### Translation

```env
TRANSLATION_API_BASE_URL=https://translate.argosopentech.com
TRANSLATION_API_KEY=your-api-key-here
```

Most public LibreTranslate instances need no key. Private instances should set both values.

### OpenAI moderation

```env
OPENAI_API_KEY=your-openai-api-key
```

Used as an additional automod signal. Keep automod rule-based filters enabled so moderation still works when the API is unavailable.

## 13. Sharding

Discord mandates sharding at 2,500 guilds. Below that threshold, one gateway process is sufficient.

```bash
pnpm dev:shard
```

`src/shard.ts` launches a `ShardingManager`; shard count follows `SHARD_COUNT` (`auto` delegates to Discord recommendation). Each shard runs `src/index.ts` with shard-aware Pod IDs, shared Postgres, and shared Redis. Verify shard readiness through `/system` and gateway logs before raising shard counts in production.

## 14. Upgrading

### 14.1 Routine upgrades

```bash
git pull
pnpm install
pnpm build
pnpm run deploy:commands
pnpm manifest
pnpm test
pnpm start
```

Run `pnpm manifest` whenever non-locale source files changed; commit the resulting `plugin-manifest.json` update. Locale-only changes do not alter integrity hashes.

### 14.2 Migrating from JavaScript-era v2 layouts

Current sources are TypeScript under `src/**/*.ts` emitting to `dist/`. Older notes referencing `src/**/*.js`, `node src/index.js`, `node deploy-commands.js`, or `src/handlers/` are obsolete.

| Old path or command | Current equivalent |
|---------------------|--------------------|
| `node src/index.js` | `pnpm start` (`node dist/index.js`) or `pnpm dev` (`tsx watch src/index.ts`) |
| `node src/worker.js` | `pnpm start:worker` or `RUN_MODE=worker pnpm dev:worker` |
| `node deploy-commands.js` | `pnpm run deploy:commands` (`tsx scripts/deploy-commands.ts`) |
| `src/commands/*.js` | `src/plugins/*/commands/*.ts` |
| `src/events/*.js` | `src/plugins/*/events/*.ts` |
| `src/handlers/` | Removed; lifecycle lives in `src/core/` |
| `tests/**/*.test.js`, `tests/setup.js` | `tests/**/*.test.{js,ts}`, `tests/setup.ts` |
| `eslint src/**/*.js` | `pnpm lint` (`eslint 'src/**/*.ts'`) |

Database access is async. Older synchronous `getGuildData` call sites must `await` results and prefer `updateGuildData` for atomic mutations.

### 14.3 Rollback

```bash
git status
git stash push -m "pre-upgrade-local-changes"  # only if needed
git log --oneline -5
git checkout <previous-tag-or-sha>
pnpm install
pnpm build
pnpm run deploy:commands
```

Restore SQLite from filesystem backup or Postgres from database snapshot before restarting the old build.

## 15. Verification Checklist

- `pnpm install` completes without native build errors
- `pnpm build` emits `dist/` without TypeScript errors
- `pnpm lint`, `pnpm typecheck`, and `pnpm lint:locales` pass
- `pnpm test` passes
- Bot logs show all expected plugins loaded
- `/help`, `/system`, and `/plugin list` respond in Discord
- Global or guild commands appear after registration
- Queue metrics look healthy when BullMQ is enabled
- Postgres migrations report no pending files
- Backups exist for `.env`, SQLite files or Postgres dumps, and `plugin-manifest.json` state

## 16. Troubleshooting

### Startup fails on operator agreement

The bot requires `OPERATOR_AGREEMENT=true` and a non-empty `OPERATOR_CONTACT`. Read `legal/TOS.md` and `legal/PRIVACY.md` first; placeholder contact text is rejected.

### Placeholder token rejected

Replace example tokens with real values from the Developer Portal. Tokens containing placeholder substrings fail validation before any Discord connection is attempted.

### better-sqlite3 binding errors

Toolchain mismatch is the usual cause. Run `pnpm rebuild better-sqlite3`, ensure Node 26 is active, reinstall with `pnpm install`, and rebuild.

### Commands missing after deploy

Confirm the deploy script used the same `CLIENT_ID` as the bot, wait up to one hour for global propagation, use `GUILD_ID` for immediate development testing, and check that new command files export both `data` and `execute`.

### `relation does not exist` in Postgres mode

Migrations have not run against the configured database. Run the Knex migration command from section 9 and confirm `DATABASE_URL` points at the intended cluster.

### Redis connection refused

Verify host, port, username, and password, confirm Redis accepts external connections, check firewall and security groups, and ensure every pod uses the same credentials and prefix.

### Workers do not consume jobs

Confirm `QUEUE_ENABLED=true` on gateway and workers, identical `QUEUE_HMAC_SECRET`, reachable Redis, `RUN_MODE=worker` on consumers, and no full-disk or memory pressure on Redis.

### Leader never stabilizes

Duplicate `POD_ID` values, unreachable Redis, or an expired lock can cause flapping. Assign unique pod identities, inspect gateway fencing logs, and remove a stuck leader key only after confirming the previous leader is stopped.

### Interlink authentication failures

Clock skew breaks JWT validation, short secrets fail length checks, and mismatched HMAC secrets cause mutual rejection. Synchronize time, use secrets of at least 32 characters, and confirm relay address and TLS paths on both sides.

### Webhook deliveries rejected

GitHub signatures must match `GITHUB_WEBHOOK_SECRET` exactly. Check port exposure, reverse proxy body handling (raw bodies must reach verification), and integration channel mappings.

### High memory or CPU

Start with gateway limits near 512 MB and worker limits near 1 GB, watch `/system` and container metrics, enable `LOG_SAMPLE_RATE` below `1.0` for noisy fleets, and scale workers horizontally before raising per-pod CPU.
