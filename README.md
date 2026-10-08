# A.P.O.L.L.O Discord Bot

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

A feature-rich, modular Discord bot built with TypeScript and discord.js v14. Designed for horizontal scaling with a plugin-based architecture, multi-instance support via Redis-backed work queues, and PostgreSQL or SQLite persistence.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Commands](#commands)
- [Installation](#installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Plugin System](#plugin-system)
- [Internationalization](#internationalization)
- [Multi-Instance Deployment](#multi-instance-deployment)
- [Development](#development)
- [Testing](#testing)
- [Protobuf and Code Generation](#protobuf-and-code-generation)
- [Observability](#observability)
- [Docker](#docker)
- [CI/CD](#cicd)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Legal](#legal)

## Features

### Core Platform

- **Plugin System**: Seven first-party plugins (`admin`, `automod`, `integrations`, `interlink`, `moderation`, `tickets`, `utility`) with lifecycle hooks (`onLoad`, `onEnable`, `onDisable`, `onUnload`), dependency resolution, hot reload, and signed third-party installs
- **Inter-Plugin Communication**: EventBus with three layers — event emit/listen, API registry (`provide`/`call`/`unprovide`), reactive shared state (`provideState`/`setState`/`getState`/`watchState`)
- **Cross-Pod Messaging**: Redis pub/sub bridging for EventBus events across gateway and worker instances
- **Sandboxed Workers**: Third-party plugins run isolated in worker child processes with capability-gated RPC (`src/core/worker/`)
- **Multi-Instance HA**: Gateway leader election with fencing (`src/gateway/leader.ts`, `fencing.ts`), worker auto-scaling via BullMQ metrics
- **Dual Database Support**: SQLite via libsql (default, single instance) or PostgreSQL via Knex (production multi-writer)
- **Distributed Locking**: Redis-based `acquireLock`/`releaseLock`/`withLock` for scheduler coordination across pods
- **Encrypted Storage**: AES encryption for sensitive guild data, with key rotation via comma-separated `ENCRYPTION_KEY` list
- **Startup Guards**: Fail-fast validation of `DISCORD_TOKEN`, `OPERATOR_AGREEMENT`, `ENCRYPTION_KEY`, Postgres pool sizing, queue HMAC secret, and unverified-plugin warnings

### Moderation (40 commands)

Kick, ban, unban, forceban, softban, timeout, mute/unmute, voice mute/deafen/disconnect/move, mass kick/mute, purge/clear, slowmode, lock/unlock, lockdown, raidmode, autorole, role persistence, nickname, temprole, tempban, warn/strike systems with configurable thresholds, case tracking, notes, blacklist (server and global), user reports.

### Auto-Moderation

Spam detection (in-memory plus optional Redis tracking), raid detection with join-burst lockdown and similarity scoring, banned words, Discord invite filter, link filter, mention spam cap, caps filter, minimum account age, exempt channels and roles, optional OpenAI moderation endpoint, optional Rust-backed NSFW image analysis over ConnectRPC.

### Ticket System (13 commands)

Panel-driven ticket creation, templates, priorities, assignment, transfer, search, list, stats, ratings, SLA tracking, JSON transcripts with attachments, DM close notifications, closed-ticket history.

### Utility (30 commands)

Ping, help, userinfo, serverinfo, channelinfo, roleinfo, avatar, banner, stats, analytics, embed builder, reminders, polls, giveaways, tags, translate (LibreTranslate), XP levels and leaderboard, announcements, Apollo info actions, invite, report, data deletion, operator contact, SLA readout.

### Admin (8 commands)

Plugin lifecycle (`/plugin list/enable/disable/reload/load/install/uninstall/search/update`), language selection, logging toggles, log-channel setup, reaction roles, queue statistics, migration runner, system health dashboard.

### Integrations

GitHub webhook receiver with HMAC verification, Twitch and YouTube live polling, RSS polling, Discord announcement formatting, configurable webhook port and poll intervals.

### Interlink

Bot-to-bot RPC through a dedicated Go service (`services/interlink/`) over ConnectRPC with HMAC auth, per-bot JWT, optional mTLS and Ed25519 identity advertisement, Redis-backed rate limiting, and at-most-once forwarding of selected core events.

### Logging

Guild member join/leave, message edit/delete, role changes, voice state changes, dedicated mod-action audit channel, analytics collector with batched member trend tracking, structured pino logs with sampling.

## Architecture

### Process Model

```text
src/index.ts          Main gateway process (default RUN_MODE=gateway)
src/worker.ts         Queue worker process (RUN_MODE=worker)
src/shard.ts          ShardingManager launcher (optional sharding)
bin/apollo.ts         Admin CLI (Unix socket RPC to a running bot)
scripts/deploy-commands.ts   Slash command registration
services/interlink/   Standalone Go bot-to-bot relay service
```

### Plugin Layout

```text
src/plugins/
├── admin/           System administration and operator tooling
├── automod/         Content filters, spam/raid detection, NSFW hooks
├── integrations/    GitHub/Twitch/YouTube/RSS connectors
├── interlink/       Cross-bot RPC client for the Go relay
├── moderation/      Full moderation suite and case system
├── tickets/         Support tickets, transcripts, SLA
└── utility/         Info, fun, XP, reminders, polls, giveaways
```

Each plugin is a class extending `Plugin` from `src/core/Plugin.ts`:

```ts
import { Plugin } from '../../core/Plugin.js';
import type { EventBus } from '../../core/EventBus.js';

export default class MyPlugin extends Plugin {
    constructor() {
        super('my-plugin');
    }

    async onLoad(eventBus: EventBus): Promise<void> {
        eventBus.provide('my-plugin:doThing', async (arg: string) => {
            return arg.toUpperCase();
        });
        eventBus.on('some-event', (payload) => {
            void payload;
        });
    }

    async onUnload(eventBus: EventBus): Promise<void> {
        eventBus.unprovide('my-plugin:doThing');
    }
}
```

Commands live in `src/plugins/<id>/commands/*.ts`, events in `src/plugins/<id>/events/*.ts`, optional CLI specs in `src/plugins/<id>/cli/`, and translations in `src/plugins/<id>/locales/<BCP47>/common.json`.

### Inter-Plugin Communication

The EventBus (`src/core/EventBus.ts`) provides three layers:

| Layer | Methods | Use Case |
|-------|---------|----------|
| Events | `emit(event, data)` / `on(event, handler)` | Fire-and-forget notifications |
| API Registry | `provide(name, fn)` / `call(name, ...args)` / `unprovide(name)` | Request-response between plugins |
| Reactive State | `provideState(key, initial)` / `setState(key, value)` / `getState(key)` / `watchState(key, cb)` | Shared mutable state with watchers |

Cross-pod bridging uses Redis pub/sub. Sandboxed third-party plugins reach host services through the capability-gated `api:*` RPC surface defined in `src/core/worker/rpc-schemas.ts`.

### Multi-Instance Topology

```text
Discord Gateway (WebSocket, single leader)
        |
Gateway pod(s) -- leader election via Redis SET NX PX + fencing
        | enqueue (BullMQ, serialization in src/queue/)
Worker pod(s) -- pull jobs, execute, reply via Discord REST
        |
PostgreSQL (shared state) + Redis (queues, locks, pub/sub)
        |
Go interlink relay (optional cross-bot traffic)
```

Run modes:

- `RUN_MODE=gateway` (default): Discord WebSocket, interaction handling, enqueue expensive jobs, leader election participant
- `RUN_MODE=worker`: BullMQ consumer, no gateway connection, responds through Discord REST
- `tsx src/shard.ts`: ShardingManager launcher for fleets above the single-process guild range

### Database Layer

```text
src/utils/db.ts        High-level async bridge used by commands (libsql client)
src/db/knex.ts         Knex connection factory (pg or libsql)
src/db/adapter.ts      getGuildData/setGuildData/getUserData/setUserData
src/db/migrations/    Knex migrations (*.cjs)
```

Prefer atomic `updateGuildData(store, guildId, updater)` over read-mutate-write sequences. SQLite is file-based and single-writer; PostgreSQL is required for multi-pod deployments.

## Commands

Commands are auto-discovered from `src/plugins/*/commands/*.ts` and registered with Discord via `scripts/deploy-commands.ts`. Counts move as plugins evolve; run `/help` in Discord for the authoritative list.

| Plugin | Commands | Examples |
|--------|----------|----------|
| moderation | ~40 | `/ban`, `/kick`, `/timeout`, `/warn`, `/strikes`, `/case`, `/purge`, `/lockdown`, `/tempban`, `/blacklist` |
| utility | ~30 | `/ping`, `/help`, `/userinfo`, `/serverinfo`, `/remind`, `/poll`, `/level`, `/translate`, `/giveaway`, `/tag` |
| tickets | 13 | `/ticket`, `/ticketsetup`, `/closeticket`, `/assign`, `/ticketpriority`, `/ticketstats`, `/ticketratings` |
| admin | 8 | `/plugin`, `/system`, `/queue`, `/migrate`, `/logging`, `/setlogchannel`, `/reactionrole`, `/language` |
| automod | 2 | `/automod`, `/scanmessage` |
| integrations | 1 | `/integration` |
| interlink | 1 | `/interlink` |

## Installation

See [INSTALLATION.md](INSTALLATION.md) for the full guide, including single-instance quick start, multi-instance profiles, Kubernetes notes, and upgrades.

```bash
git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
cd Apollo-Discord-Bot
pnpm install
cp .env.example .env
```

Minimum `.env` for a first boot:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
OWNER_IDS=your_discord_user_id
ENCRYPTION_KEY=your-base64-encoded-32-byte-key
OPERATOR_AGREEMENT=true
OPERATOR_CONTACT=Discord: @you
```

Then:

```bash
pnpm build
pnpm run deploy:commands
pnpm start
```

For development with hot reload:

```bash
pnpm dev
```

## Configuration

### Build, Run, and Maintenance Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| Start gateway | `pnpm start` | Run compiled bot from `dist/index.js` |
| Start gateway explicitly | `pnpm start:gateway` | `RUN_MODE=gateway node dist/index.js` |
| Start worker | `pnpm start:worker` | `RUN_MODE=worker node dist/index.js` |
| Dev gateway | `pnpm dev` | `tsx watch src/index.ts` |
| Dev worker | `pnpm dev:worker` | Worker mode with live reload |
| Dev sharding | `pnpm dev:shard` | `tsx src/shard.ts` |
| Build | `pnpm build` | `tsc -p tsconfig.build.json` into `dist/` |
| Deploy commands | `pnpm run deploy:commands` | Register slash commands via Discord REST |
| Lint | `pnpm lint` | ESLint over `src/**/*.ts` |
| Locale lint | `pnpm lint:locales` | Translation parity and placeholder checks |
| Typecheck | `pnpm typecheck` | `tsc --noEmit` over test project |
| Tests | `pnpm test` | Vitest run |
| Manifest | `pnpm manifest` | Regenerate `plugin-manifest.json` hashes |

### Environment Variables

The authoritative template is `.env.example`. Required on every boot: `DISCORD_TOKEN`, `CLIENT_ID`, `OWNER_IDS`, `ENCRYPTION_KEY`, `OPERATOR_AGREEMENT=true`, `OPERATOR_CONTACT`.

| Group | Key Variables |
|-------|---------------|
| Runtime | `NODE_ENV`, `RUN_MODE`, `POD_ID`, `GUILD_ID`, `SHARD_COUNT`, `PLUGIN_DIR` |
| Database | `DB_TYPE`, `DATABASE_URL`, `DB_POOL_MIN`, `DB_POOL_MAX` |
| Redis and queue | `QUEUE_ENABLED`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `QUEUE_PREFIX`, `QUEUE_STALLED_INTERVAL`, `QUEUE_HMAC_SECRET` |
| Interlink | `INTERLINK_ENABLED`, `INTERLINK_GRPC_ADDR`, `INTERLINK_AUTH_KEY`, `INTERLINK_JWT_SECRET`, `INTERLINK_JWT_EXPIRY`, `INTERLINK_TLS_CERT`, `INTERLINK_TLS_KEY`, `INTERLINK_CA_CERT`, `INTERLINK_PUBLIC_KEY`, `INTERLINK_FORWARD_EVENTS` |
| Integrations | `INTEGRATIONS_WEBHOOK_PORT`, `GITHUB_WEBHOOK_SECRET`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `INTEGRATIONS_POLL_TWITCH`, `INTEGRATIONS_POLL_YOUTUBE`, `INTEGRATIONS_POLL_RSS` |
| AI and translation | `OPENAI_API_KEY`, `TRANSLATION_API_BASE_URL`, `TRANSLATION_API_KEY`, `NSFW_USE_RUST`, `NSFW_GRPC_ADDR`, `NSFW_THRESHOLD`, `NSFW_RUST_TIMEOUT_MS` |
| CLI and sockets | `APOLLO_GUILD_ID`, `APOLLO_SOCKET_PATH`, `APOLLO_SOCKET_TOKEN` |
| Security | `SECURITY_LOG_RETENTION_DAYS`, `ALLOW_UNVERIFIED_PLUGINS`, `LOG_SAMPLE_RATE` |

Runtime defaults live in `src/config/config.ts` (`ApolloConfig` type in `src/types/config.ts`). Environment parsing helpers tolerate missing values and fall back to documented defaults.

## Project Structure

```text
Apollo-Discord-Bot/
├── bin/apollo.ts              Admin CLI entry (dist/bin/apollo.js after build)
├── scripts/
│   ├── deploy-commands.ts     Slash command registration
│   ├── generate-manifest.mjs  Plugin integrity manifest
│   ├── lint-locales.mjs       Translation parity gate
│   └── audit-discordjs.mjs    Discord.js API audit helper
├── protos/
│   ├── interlink/v1/          Cross-bot RPC schema
│   └── nsfw/v1/               NSFW analysis schema
├── services/interlink/        Go relay service (main.go, go.mod)
├── src/
│   ├── index.ts               Gateway entry
│   ├── worker.ts              Queue worker entry
│   ├── shard.ts               Sharding launcher
│   ├── cli/                   parse/format/discover/socket RPC
│   ├── config/config.ts       ApolloConfig from environment
│   ├── core/                  Plugin, PluginManager, EventBus, registry,
│   │                          installer, loader, reloader, CommandSync,
│   │                          dependency resolver, Sigstore verification
│   ├── core/worker/           Sandbox host/child, capability RPC surface
│   ├── db/                    Knex factory, adapter, migrations
│   ├── gateway/               Leader election and fencing
│   ├── generated/             buf-generated ConnectRPC clients
│   ├── i18n/                  I18nService, locale cache, dictionaries
│   ├── observability/         OpenTelemetry bootstrap
│   ├── plugins/               Seven first-party plugins
│   ├── queue/                 BullMQ factory, serializers, job handlers
│   ├── types/                 Shared TypeScript types
│   └── utils/                 DB bridge, locks, Redis, schedulers, logging,
│                              analytics, moderation helpers, encryption,
│                              transcripts, integrations, metrics, health
├── tests/                     Vitest suite (~160 test files), mocks, fixtures
├── docs/                      Architecture notes, i18n guide, runbooks
├── legal/                     TOS, privacy policy, legal notice
├── docker-compose.yml         Single-instance plus multi profile
├── Dockerfile / Dockerfile.prod
├── eslint.config.js           Flat config, strict TypeScript rules
├── vitest.config.ts
├── tsconfig.json / tsconfig.build.json / tsconfig.test.json
└── plugin-manifest.json       SHA-256 plugin integrity manifest
```

## Plugin System

### Anatomy of a Command

```ts
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

export default {
    name: 'example',
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('An example command')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    category: 'Utility',
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply({ content: 'Done!' });
    }
};
```

### Lifecycle and Discovery

1. `PluginManager` discovers `src/plugins/*/plugin.ts`
2. Dependencies resolve before load order is fixed
3. `onLoad` registers commands, events, APIs, and namespaces
4. `onEnable` starts timers, watchers, and subscriptions
5. `onDisable` stops background work; `onUnload` releases EventBus handles
6. `CommandSync` reconciles slash commands with Discord

Third-party plugins install as signed archives, hash-pinned in `plugin-manifest.json`, and execute in worker sandboxes unless explicitly trusted.

## Internationalization

First-party strings use i18next with the plugin id as namespace. Canonical locale is `en-US`. Supported dictionaries ship for `en-US`, `es-ES`, `de`, `it`, `pl`, and `el`; see [docs/i18n.md](docs/i18n.md) for translator rules.

```bash
pnpm lint:locales
```

Locale-only pull requests touch JSON under `src/plugins/<id>/locales/` or `src/i18n/dictionaries/` and must keep `{{variable}}` placeholders identical across locales. Namespace loading happens once at plugin enable time; per-execution translation uses a locale-fixed `t` function.

## Multi-Instance Deployment

Single instance needs only Node, SQLite, and a Discord token. Enable the multi profile for Postgres plus Redis plus workers:

```bash
docker compose --profile multi up -d
```

Production notes:

- Use `DB_TYPE=postgres` with `DATABASE_URL` for every multi-writer deployment
- Set `QUEUE_ENABLED=true` and shared Redis credentials on gateway and workers
- Give each pod a unique `POD_ID` so leader election and heartbeats stay distinct
- Run `pnpm build` before container builds; containers execute `dist/index.js`
- Postgres 18 stores data at `/var/lib/postgresql`; snapshot before major upgrades
- Discord requires sharding at 2,500 guilds; use `tsx src/shard.ts` or `SHARD_COUNT` planning from there

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm lint:locales
```

Conventions:

- pnpm only; npm and yarn are unsupported
- ESM only with `.js`-suffixed relative imports in TypeScript sources
- 4-space indent, single quotes, semicolons, no trailing commas, `eqeqeq`, `curly: all`
- No `any` in `src/`; unused variables prefixed with `_`
- No emojis in source or docs
- `console.log` is a lint warning; use `createLogger({ component })`

Adding a command:

1. Create `src/plugins/<id>/commands/mycommand.ts`
2. Export `{ name, data, category, execute }`
3. Add `tests/plugins/<id>/mycommand.test.ts` with mocked interaction and DB
4. Run `pnpm run deploy:commands` for Discord registration
5. Run `pnpm manifest` only when non-locale source files changed

## Testing

Vitest with `tests/setup.ts` bootstrap and `tests/mocks/discord.ts` factories. Configuration lives in `vitest.config.ts` with forked isolation and single-file parallelism for Discord mock determinism.

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test -- tests/plugins/moderation/ban.test.ts
```

Coverage excludes `src/index.ts`, legacy handler globs, tests, generated code, `bin/`, `scripts/`, and `dist/`. Bug fixes require regression tests; new commands require metadata, success, error, and edge-case coverage.

## Protobuf and Code Generation

Schemas live in `protos/interlink/v1/interlink.proto` and `protos/nsfw/v1/nsfw.proto`. Generated ConnectRPC clients live in `src/generated/`. The Go relay consumes the same schemas from `services/interlink/`.

```bash
pnpm proto:lint
pnpm proto:generate
pnpm proto:generate:go
pnpm proto:generate:ts
pnpm proto:breaking
```

CI runs `buf lint`, Go builds and tests, Rust builds and tests for NSFW components, and a manifest drift check that fails when `plugin-manifest.json` is stale.

## Observability

- OpenTelemetry bootstrap in `src/observability/otel.ts` with HTTP, ConnectRPC, and auto-instrumentations
- Prometheus client metrics plus BullMQ queue depth for autoscaling
- Health endpoint via `HEALTH_PORT`/`HEALTH_HOST` with Docker healthchecks
- Pino structured logs with configurable sampling through `LOG_SAMPLE_RATE`
- Tracing helpers in `src/utils/tracing.ts`

## Docker

Development image: `Dockerfile`. Production multi-stage image: `Dockerfile.prod`. Compose file `docker-compose.yml` runs a single bot by default and Postgres plus Redis plus workers under `--profile multi`.

```bash
docker compose up -d
docker compose --profile multi up -d
docker build -f Dockerfile.prod -t apollo-discord-bot .
```

Published images are available at `ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest`.

## CI/CD

Workflows in `.github/workflows/`:

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Lint, Vitest, coverage, Rust build/test, Go build/test, buf lint, audit, manifest drift |
| `docker.yml` | Image builds |
| `deploy.yml` | Deployment automation |
| `release.yml` | Release packaging |
| `security.yml` | CodeQL, dependency review, SAST |
| `semgrep.yml` | Static analysis rules |
| `integration-tests.yml` | Redis-backed integration tests via testcontainers |
| `setup.yml` | Shared setup workflow |

## Troubleshooting

### Bot refuses to start with an operator error

Read `legal/TOS.md` and `legal/PRIVACY.md`, then set `OPERATOR_AGREEMENT=true` and a non-empty `OPERATOR_CONTACT`. Placeholder tokens are rejected.

### Commands do not appear

Run `pnpm run deploy:commands`. Global commands can take up to one hour; set `GUILD_ID` for instant guild-scoped registration during development.

### Database fails after install

Run `pnpm install` to ensure libsql client is available. Native bindings must match the active Node 26 toolchain.

### Workers idle while queue grows

Confirm `QUEUE_ENABLED=true`, shared `REDIS_*` values, unique `POD_ID` values, and `RUN_MODE=worker` on consumers. Inspect `/queue` output and BullMQ metrics.

### Postgres pool warnings

`DB_POOL_MAX` above 80 percent of `max_connections` is capped automatically. Lower pool max or raise the database limit.

### Locale CI fails

Run `pnpm lint:locales` locally. Missing keys, empty values, or mismatched `{{placeholders}}` fail the gate.

### Manifest drift fails

Run `pnpm manifest` after adding, moving, or deleting non-locale source files, then commit the updated `plugin-manifest.json`.

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for environment setup, TypeScript style, test expectations, locale rules, and pull request checklists.

## Legal

- [Privacy Policy](legal/PRIVACY.md)
- [Terms of Service](legal/TOS.md)
- [Legal Notice](legal/LEGAL.md)

Before running the bot, read the Terms of Service and Privacy Policy, then set `OPERATOR_AGREEMENT=true` and `OPERATOR_CONTACT` in `.env`. The bot refuses to start otherwise.

## Acknowledgments

- [discord.js](https://discord.js.org/)
- [BullMQ](https://bullmq.io/)
- [Knex](https://knexjs.org/)
- [Vitest](https://vitest.dev/)
- [OpenTelemetry](https://opentelemetry.io/)
- [ConnectRPC](https://connectrpc.com/)
- [libsql](https://libsql.org/)
- [Discord Developer Portal](https://discord.com/developers/applications)
