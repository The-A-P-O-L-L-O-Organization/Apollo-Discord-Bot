# A.P.O.L.L.O Discord Bot

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D26-brightgreen.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org/)
[![Tests](https://img.shields.io/badge/tests-982%20passing-brightgreen.svg)](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot)

A feature-rich, modular Discord bot built with discord.js v14. Designed for horizontal scaling with a plugin-based architecture, multi-instance support via Redis-backed work queues, and optional PostgreSQL for shared persistence.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Commands](#commands-31-total)
- [Installation](#installation)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Plugin System](#plugin-system)
- [Multi-Instance Deployment](#multi-instance-deployment)
- [Development](#development)
- [Testing](#testing)
- [API Reference](#api-reference)
- [Docker](#docker)
- [CI/CD](#cicd)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Features

### Core Platform
- **Plugin System**: Modular architecture with lifecycle hooks (`onLoad`, `onUnload`, `onConfigChange`), runtime install/uninstall
- **Inter-Plugin Communication**: EventBus with 3 layers — event emit/listen, API registry (`provide`/`call`/`unprovide`), reactive shared state (`provideState`/`setState`/`getState`/`watchState`)
- **Cross-Pod Messaging**: Redis pub/sub bridging for EventBus events across gateway/worker instances
- **Multi-Instance HA**: Gateway leader election via Redis SET NX PX locks, worker auto-scaling via BullMQ metrics
- **Dual Database Support**: SQLite (better-sqlite3, default for development) or PostgreSQL (via Knex, for production multi-writer)
- **Distributed Locking**: Redis-based `acquireLock`/`releaseLock`/`withLock` for scheduler coordination across pods

### Moderation
- **Kick/Ban/Unban**: Full moderation command suite with case tracking
- **Timeout Mute**: Discord-native timeout with optional mute role fallback and role restoration on unmute
- **Warnings**: Configurable threshold-based auto-punishments (mute/kick/ban)
- **Purge**: Bulk message deletion with filters (user, amount)
- **Blacklist**: Server and global blacklist with auto-ban on join and DM notification
- **Case System**: Persistent moderation case IDs with search, editing, and deletion

### Auto-Moderation
- **Spam Detection**: Configurable rate limiting (in-memory + optional Redis tracking)
- **Raid Detection**: Join burst detection with automatic lockdown (in-memory + optional Redis tracking)
- **Banned Words**: Configurable word filters
- **Discord Invite Filter**: Block invite links
- **Link Filter**: Restrict external URL posting
- **Mention Spam**: Limit mentions per message
- **Caps Filter**: Threshold-based all-caps detection
- **Account Age**: Minimum account age requirement on join
- **Exempt Channels/Roles**: Bypass automod for specific channels or roles

### Ticket System
- **Panel Button**: Configurable ticket creation panel with category and support role
- **Transcripts**: Full JSON transcripts with message history and attachments
- **DM Notification**: Ticket creator receives close reason via DM
- **History**: Closed ticket history (capped at 100 entries)

### Utility
- **Ping**: Latency check
- **Help**: Dynamic help menu
- **User Info**: User details including join date, roles, permissions
- **Server Info**: Server statistics and configuration
- **Stats**: Bot uptime, memory usage, guild count
- **Embed Builder**: Custom embed creation via slash command
- **Reminders**: Personal reminder system with scheduled execution
- **Polls**: Multi-option polls with auto-tally on expiration

### Logging
- **Event Logger**: Guild member joins/leaves, message edits/deletes, role changes, voice state changes
- **Mod Log**: Dedicated mod-action audit log channel
- **Analytics Collector**: Member join/leave trend tracking (in-memory batching, BullMQ-ready)

### Reaction Roles
- Add/remove/list/clear self-assignable roles via message reactions

## Architecture

### Plugin System

```
src/plugins/
├── core/          # Foundational plugins (ping, help, stats, userinfo, etc.)
├── moderation/    # Moderation commands, case system, blacklist
├── automod/       # Auto-moderation, raid detection, spam filter
├── tickets/       # Ticket system, transcripts, panels
└── utility/       # Reminders, polls, reaction roles, embed builder, logging
```

Each plugin is a class extending `Plugin` from `src/core/Plugin.js`:

```js
import { Plugin } from '../../core/Plugin.js';

export default class MyPlugin extends Plugin {
    constructor() {
        super('my-plugin');
    }

    async onLoad(eventBus) {
        // Register commands, events, APIs
        eventBus.provide('my-plugin:doThing', async (arg) => { ... });
        eventBus.on('some-event', handler);
    }

    async onUnload() {
        // Cleanup resources
        eventBus.unprovide('my-plugin:doThing');
    }
}
```

### Inter-Plugin Communication

The EventBus (`src/core/EventBus.js`) provides three layers:

| Layer | Method | Use Case |
|-------|--------|----------|
| Events | `emit(event, data)` / `on(event, handler)` | Fire-and-forget notifications |
| API Registry | `provide(name, fn)` / `call(name, ...args)` / `unprovide(name)` | Request-response between plugins |
| Reactive State | `provideState(key, initial)` / `setState(key, value)` / `getState(key)` / `watchState(key, cb)` | Shared mutable state with watchers |

Cross-pod (multi-instance) bridging uses Redis pub/sub via `enableCrossPod(redisPub, redisSub, podId)`.

### Multi-Instance Architecture

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│       Gateway Pod (1..N)     │     │       Worker Pods (1..N)     │
│                              │     │                              │
│  ┌────────────────────────┐  │     │  ┌────────────────────────┐  │
│  │   Discord WebSocket    │  │     │  │   BullMQ Consumer      │  │
│  │   (single connection)  │  │     │  │   (processCommand)     │  │
│  └────────┬───────────────┘  │     │  └───────────┬────────────┘  │
│           │                  │     │              │               │
│  ┌────────▼───────────────┐  │     │  ┌───────────▼────────────┐  │
│  │   gatewayRouter.js     │──┼─────┼─>│   BullMQ Queue         │  │
│  │   (queueOrRun)         │  │     │  │   (Redis)              │  │
│  └────────────────────────┘  │     │  └────────────────────────┘  │
│                              │     │                              │
│  ┌────────────────────────┐  │     │  ┌────────────────────────┐  │
│  │   Leader Election      │  │     │  │   REST API Callbacks   │  │
│  │   (Redis SET NX PX)    │  │     │  │   (interaction.followUp)│  │
│  └────────────────────────┘  │     │  └────────────────────────┘  │
└──────────────────────────────┘     └──────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                        Shared Infrastructure                      │
│                                                                   │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐│
│   │  PostgreSQL  │   │    Redis    │   │   EventBus (pub/sub)    ││
│   │  (guild_data,│   │  (queues,   │   │   (cross-pod events)   ││
│   │   cases,     │   │   locks,    │   │                         ││
│   │   settings)  │   │   spam/raid)│   │                         ││
│   └─────────────┘   └─────────────┘   └─────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

**Run modes:**
- `RUN_MODE=gateway` (default): Connects to Discord via WebSocket, handles interactions, enqueues expensive jobs, participates in leader election
- `RUN_MODE=worker`: Connects to Redis/BullMQ, pulls jobs from queue, processes them, calls REST API to respond (no discord.js dependency)

### Database Layer

```
┌─────────────────────────────────────────────┐
│             src/utils/db.js                  │
│  Async bridge — conditional delegation       │
├─────────────────────────────────────────────┤
│  DB_TYPE=sqlite     │  DB_TYPE=postgres      │
│  (default)          │  (production)          │
├─────────────────────┼───────────────────────┤
│  better-sqlite3     │  Knex + pg            │
│  (synchronous,      │  (async, connection    │
│   file-based)       │   pool, multi-writer)  │
└─────────────────────┴───────────────────────┘
```

## Commands (31 Total)

### Utility Commands

| Command | Description |
|---------|-------------|
| `/ping` | Check the bot's latency and response time |
| `/help` | Shows the help menu with all available commands |
| `/userinfo` | Displays information about a user |
| `/serverinfo` | Display detailed server information |
| `/stats` | Display bot statistics (uptime, memory, servers) |
| `/embed` | Create custom embed messages |
| `/remind` | Set a reminder (e.g., `/remind 1h Check the oven`) |
| `/reminders` | List your active reminders |
| `/cancelreminder` | Cancel a reminder by ID |
| `/poll` | Create a poll with optional auto-tally |

### Moderation Commands

| Command | Description |
|---------|-------------|
| `/kick` | Kick a user from the server |
| `/ban` | Ban a user from the server |
| `/unban` | Unban a previously banned user |
| `/mute` | Temporarily mute a user (timeout or role) |
| `/unmute` | Unmute a previously muted user |
| `/purge` | Delete multiple messages from a channel |
| `/warn` | Issue a warning to a user (auto-punishments at thresholds) |
| `/warnings` | View a user's warnings |
| `/clearwarnings` | Clear warnings for a user |
| `/blacklist` | Add/remove/list blacklisted users (auto-ban on join) |
| `/case` | Manage moderation cases (search, view, edit, delete) |
| `/tempban` | Temporarily ban a user (auto-unban on expiration) |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/warnconfig` | Configure warning thresholds for auto-punishments |
| `/automod` | Configure auto-moderation settings |
| `/setlogchannel` | Set the channel for server event logs |
| `/logging` | Enable/disable specific log events |
| `/reactionrole` | Setup reaction roles (add/remove/list/clear) |
| `/ticketsetup` | Configure the ticket system |
| `/ticket` | Create a support ticket |
| `/closeticket` | Close a ticket and save transcript |

### Owner Commands

| Command | Description |
|---------|-------------|
| `/reload` | Reload a command (bot owner only) |

## Installation

### Prerequisites

- **Node.js 26+**
- **pnpm 11+** (required — `npm`/`yarn` are not supported)
- **Docker & Docker Compose** (recommended for deployment)
- **Discord Bot Token** from [Discord Developer Portal](https://discord.com/developers/applications)

### Quick Start with Docker Compose

```bash
git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
cd Apollo-Discord-Bot
cp .env.example .env
# Edit .env with your DISCORD_TOKEN, CLIENT_ID, OWNER_IDS
docker-compose up -d
docker-compose logs -f
```

### Manual Installation

```bash
git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
cd Apollo-Discord-Bot
pnpm install
cp .env.example .env
# Edit .env with your credentials
```

**Set up your Discord server:**
- Create a `#welcome` channel for welcome messages
- Create a `#mod-logs` channel for moderation logs (optional)
- Create a `Muted` role for the mute fallback (optional)

**Deploy slash commands:**
```bash
node deploy-commands.js
```

**Run tests:**
```bash
pnpm test
```

**Start the bot:**
```bash
pnpm start
```

### Production Multi-Instance Deployment

For production with horizontal scaling, you need additional infrastructure:

```bash
# Start PostgreSQL + Redis + gateway + workers
docker-compose -f docker-compose.prod.yml up -d

# Or build the production image
docker build -f Dockerfile.prod -t apollo-discord-bot .

# Run gateway pod
docker run -d --name apollo-gateway \
  -e RUN_MODE=gateway \
  -e DISCORD_TOKEN=... \
  -e DB_TYPE=postgres \
  -e DATABASE_URL=postgres://... \
  -e REDIS_URL=redis://... \
  apollo-discord-bot

# Run worker pod(s)
docker run -d --name apollo-worker-1 \
  -e RUN_MODE=worker \
  -e DB_TYPE=postgres \
  -e DATABASE_URL=postgres://... \
  -e REDIS_URL=redis://... \
  apollo-discord-bot
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DISCORD_TOKEN` | Discord bot token | Yes | — |
| `CLIENT_ID` | Discord application client ID | Yes | — |
| `GUILD_ID` | Guild ID for dev (instant command sync) | No | — |
| `OWNER_IDS` | Comma-separated bot owner IDs | No | — |
| `NODE_ENV` | Environment mode (`development`/`production`) | No | `development` |
| `RUN_MODE` | Pod mode (`gateway`/`worker`) | No | `gateway` |
| `POD_ID` | Unique pod identifier for leader election | No | `gateway-{hostname}` |
| `DB_TYPE` | Database type (`sqlite`/`postgres`) | No | `sqlite` |
| `DATABASE_URL` | PostgreSQL connection string | For PG | — |
| `REDIS_URL` | Redis connection string | For multi-instance | — |
| `QUEUE_PREFIX` | BullMQ queue key prefix | No | `apollo` |
| `GATEWAY_PORT` | REST API port for worker callbacks | No | `3000` |

### Config File (`src/config/config.js`)

All settings are managed through `src/config/config.js`. Key sections:

```javascript
export const config = {
    database: { type: process.env.DB_TYPE || 'sqlite' },
    
    queue: {
        prefix: process.env.QUEUE_PREFIX || 'apollo',
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
    },

    redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },
    
    // Discord activity
    activity: { name: 'for new members join', type: 'WATCHING' },
    
    // Welcome messages
    welcome: { channelName: 'welcome', message: 'Welcome {user} to {server}!' },
    
    // Moderation settings
    moderation: {
        defaultReason: 'No reason provided',
        muteRoleName: 'Muted',
        muteDuration: 3600000,
        maxMessagesPerPurge: 100,
        logModerationActions: true,
        moderationLogChannel: 'mod-logs'
    },
    
    // Warning thresholds
    warnings: { thresholds: { mute: 3, kick: 5, ban: 7 } },
    
    // Auto-moderation defaults
    automod: {
        enabled: false, maxMentions: 5, maxCapsPercent: 70,
        filterInvites: true, filterLinks: false, spamThreshold: 5
    },
    
    // Logging
    logging: {
        defaultEvents: {
            messageDelete: true, messageEdit: true, memberJoin: true,
            memberLeave: true, roleChanges: true, voiceChanges: false
        }
    },
    
    // Ticket system
    tickets: { categoryName: 'Support Tickets', channelPrefix: 'ticket-' },
    
    // Schedulers
    reminders: { checkInterval: 30000, maxDuration: 30 * 24 * 60 * 60 * 1000 },
    polls: { defaultDuration: 24 * 60 * 60 * 1000, maxDuration: 7 * 24 * 60 * 60 * 1000, maxOptions: 10 }
};
```

## Project Structure

```
Apollo-Discord-Bot/
├── src/
│   ├── index.js                     # Main entry point (RUN_MODE switching)
│   ├── worker.js                    # Worker pod entry point (BullMQ consumer)
│   │
│   ├── core/
│   │   ├── EventBus.js              # 3-layer IPC + cross-pod Redis pub/sub
│   │   ├── Plugin.js                # Plugin base class with lifecycle hooks
│   │   ├── PluginManager.js         # Plugin discovery, load, unload, install
│   │   ├── PluginRegistry.js        # Remote plugin registry client
│   │   └── pluginDownloader.js      # Plugin ZIP downloader
│   │
│   ├── config/
│   │   └── config.js                # Environment-based configuration
│   │
│   ├── plugins/
│   │   ├── core/                    # ping, help, userinfo, serverinfo, stats
│   │   ├── moderation/              # kick, ban, unban, mute, unmute, purge,
│   │   │                            # warn, warnings, clearwarnings, warnconfig,
│   │   │                            # blacklist, case, tempban, automod
│   │   ├── automod/                 # Auto-mod event handlers, raid detection
│   │   ├── tickets/                 # Ticket system, panels, transcripts
│   │   └── utility/                 # Reminders, polls, reaction roles,
│   │                                # embed builder, logging, welcome
│   │
│   ├── gateway/
│   │   └── leader.js                # Leader election (tryAcquireLock, heartbeat)
│   │
│   ├── queue/
│   │   ├── queue.js                 # BullMQ queue factory (no-op fallback)
│   │   ├── jobHandler.js            # Job handler registry
│   │   ├── gatewayRouter.js         # queueOrRun helper
│   │   ├── metrics.js               # Queue metrics for auto-scaling
│   │   └── jobs/
│   │       └── processCommand.js    # Command processing job with REST ack
│   │
│   ├── db/
│   │   ├── knex.js                  # Knex connection factory
│   │   ├── adapter.js               # Async PG adapter (getGuildData, etc.)
│   │   └── migrations/
│   │       └── 20260509_001_initial.cjs
│   │
│   └── utils/
│       ├── db.js                    # PG/SQLite bridge (async, conditional)
│       ├── lock.js                  # Distributed Redis locks
│       ├── modLog.js                # Moderation audit logging
│       ├── automod.js               # Spam detection, word filters
│       ├── raidDetection.js         # Join burst detection
│       ├── logger.js                # Event log embeds
│       ├── reminderScheduler.js     # Locked reminder scheduler
│       ├── pollScheduler.js         # Locked poll auto-tally
│       ├── tempbanScheduler.js      # Locked tempban expiration
│       ├── tempRolesScheduler.js    # Locked temprole expiration
│       └── analyticsCollector.js    # Member join/leave trends
│
├── tests/
│   ├── commands/                    # Command unit tests (72 test files)
│   ├── events/                      # Event handler tests
│   ├── utils/                       # Utility tests (db, lock, automod, etc.)
│   ├── core/                        # Core tests (EventBus, Plugin, PluginManager)
│   ├── queue/                       # Queue tests
│   ├── gateway/                     # Leader election tests
│   ├── mocks/
│   │   └── discord.js               # Discord.js mock factories
│   └── setup.js                     # Test bootstrap
│
├── data/                            # Runtime data directory
│   ├── apollo.db                    # SQLite database (dev)
│   ├── transcripts/                 # Ticket transcripts
│   └── plugin-registry.json         # Registry manifest
│
├── docker-compose.yml               # Dev Docker Compose
├── Dockerfile                       # Dev Dockerfile
├── Dockerfile.prod                  # Multi-stage production build
├── deploy-commands.js               # Slash command registration
├── package.json                     # Dependencies and scripts
├── pnpm-workspace.yaml              # Security overrides
└── vitest.config.js                 # Vitest configuration
```

## Plugin System

### Anatomy of a Plugin

```js
import { Plugin } from '../../core/Plugin.js';
import { SlashCommandBuilder } from 'discord.js';

export default class PingPlugin extends Plugin {
    constructor() {
        super('core:ping');             // Unique plugin ID
        this.commands = [];             // Slash command builder objects
    }

    async onLoad(eventBus) {
        // Register a slash command
        this.commands.push({
            data: new SlashCommandBuilder()
                .setName('ping')
                .setDescription('Check bot latency'),
            async execute(interaction) {
                await interaction.reply(`Pong! ${client.ws.ping}ms`);
            }
        });

        // Provide an API for other plugins
        eventBus.provide('ping:getLatency', () => client.ws.ping);

        // React to events from other plugins
        eventBus.on('moderation:action', ({ type, target }) => {
            console.log(`Mod action: ${type} on ${target}`);
        });
    }

    async onUnload(eventBus) {
        eventBus.unprovide('ping:getLatency');
        eventBus.removeAllListeners('moderation:action');
    }
}
```

### Plugin Lifecycle

1. **Register**: Plugin class is instantiated and registered with PluginManager
2. **onLoad(eventBus)**: Plugin initializes — registers commands, event listeners, provides APIs, sets up reactive state
3. **Runtime**: Plugin operates, responds to commands/events, communicates via EventBus
4. **onUnload(eventBus)**: Plugin cleans up — unregisters commands, removes listeners, unprovides APIs

### Inter-Plugin Communication

```js
// --- Event layer (fire-and-forget) ---
eventBus.emit('tickets:closed', { ticketId: 1, guildId: '123' });
eventBus.on('tickets:closed', (data) => { /* react */ });

// --- API registry (request-response) ---
eventBus.provide('moderation:getCaseCount', async (guildId) => { /* ... */ });
const count = await eventBus.call('moderation:getCaseCount', guildId);

// --- Reactive state (shared, watchable) ---
eventBus.provideState('config:prefix', '!');
eventBus.setState('config:prefix', '?');
const current = eventBus.getState('config:prefix');
eventBus.watchState('config:prefix', (newVal, oldVal) => { /* onChange */ });
```

### Remote Plugin Installation

Plugins can be installed from remote ZIP archives via the registry manifest at `data/plugin-registry.json`:

```json
{
    "plugins": [
        {
            "id": "community:my-plugin",
            "name": "My Plugin",
            "version": "1.0.0",
            "url": "https://example.com/plugins/my-plugin.zip",
            "description": "A community plugin"
        }
    ]
}
```

Commands: `/plugin install community:my-plugin`, `/plugin uninstall community:my-plugin`

## Multi-Instance Deployment

### Architecture Components

| Component | Purpose | Run Mode |
|-----------|---------|----------|
| Gateway Pod(s) | Discord WebSocket connection, interaction handling | `RUN_MODE=gateway` |
| Worker Pod(s) | Expensive job processing (command execution, DB writes) | `RUN_MODE=worker` |
| PostgreSQL | Shared persistent storage (guild data, cases, settings) | External |
| Redis | BullMQ queues, distributed locks, spam/raid tracking, cross-pod EventBus | External |

### Leader Election

Multiple gateway pods can run simultaneously, but only one holds the active Discord WebSocket connection. Leader election uses Redis:

```redis
SET apollo:lock:gateway <podId> NX PX 30000
```

The leader refreshes its lock every 15 seconds. If it crashes, the lock expires and another pod takes over.

### Worker Auto-Scaling

Workers pull from a shared BullMQ queue. Metrics endpoint (`/metrics`) exposes queue depth for HPA (Horizontal Pod Autoscaler) in Kubernetes:

```json
{
    "waiting": 42,
    "active": 5,
    "completed": 1500,
    "failed": 3,
    "delayed": 0
}
```

### Scheduler Coordination

All periodic schedulers (reminders, polls, tempbans, temproles) use distributed locks via `withLock()`:

```js
import { withLock, getLockRedis } from './lock.js';

const redis = await getLockRedis();
await withLock(redis, 'scheduler:reminders', podId, async () => {
    // Only one pod executes this at a time
    await checkReminders();
});
```

## Development

### Getting Started

```bash
pnpm install
pnpm test             # Run tests once
pnpm test:watch       # Watch mode for TDD
pnpm test:coverage    # With coverage report
pnpm start            # Start bot (SQLite, single instance)
```

### Adding a New Command

1. Create the command file in the appropriate plugin:
   ```bash
   touch src/plugins/moderation/commands/mycommand.js
   ```

2. Implement the command using the plugin command format:
   ```js
   import { SlashCommandBuilder } from 'discord.js';
   
   export default {
       name: 'mycommand',
       data: new SlashCommandBuilder()
           .setName('mycommand')
           .setDescription('Does something'),
       category: 'Moderation',
       async execute(interaction) {
           await interaction.reply('Done!');
       }
   };
   ```

3. Export it from the plugin's index or register directly in the plugin's `onLoad`:
   ```js
   this.commands.push(myCommand);
   ```

4. Write tests in `tests/commands/mycommand.test.js`

### Adding a New Plugin

1. Create the plugin directory:
   ```bash
   mkdir -p src/plugins/myplugin
   ```

2. Create the plugin class:
   ```js
   // src/plugins/myplugin/index.js
   import { Plugin } from '../../core/Plugin.js';
   
   export default class MyPlugin extends Plugin {
       constructor() {
           super('myplugin');
       }
       async onLoad(eventBus) { /* ... */ }
       async onUnload(eventBus) { /* ... */ }
   }
   ```

3. PluginManager auto-discovers plugins in `src/plugins/*/index.js`

### Running Multi-Instance Locally

```bash
# Terminal 1: Start infrastructure
docker run -d --name redis -p 6379:6379 redis:7
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=pass postgres:16

# Terminal 2: Gateway pod
RUN_MODE=gateway POD_ID=gateway-1 DB_TYPE=postgres \
    DATABASE_URL=postgres://postgres:pass@localhost:5432/apollo \
    REDIS_URL=redis://localhost:6379 \
    node src/index.js

# Terminal 3: Worker pod
RUN_MODE=worker POD_ID=worker-1 DB_TYPE=postgres \
    DATABASE_URL=postgres://postgres:pass@localhost:5432/apollo \
    REDIS_URL=redis://localhost:6379 \
    node src/worker.js
```

## Testing

### Test Suite Overview

```
982 tests | 72 files | 4 skipped | 0 failures
```

| Category | Files | Focus |
|----------|-------|-------|
| Command tests | 31 files | Each command's metadata validation and execute logic |
| Event tests | 6 files | Event handler behavior (guildMemberAdd, messageCreate, etc.) |
| Core tests | 4 files | EventBus (29 tests), Plugin, PluginManager |
| Queue tests | 3 files | Queue factory, job handler, gateway router |
| Gateway tests | 1 file | Leader election (tryAcquireLock, releaseLock, heartbeat) |
| Component tests | 4 files | DB adapter, automod, raid detection, lock utility |
| Utility tests | 23 files | DB bridge, modLog, schedulers, analytics, etc. |

### Running Tests

```bash
pnpm test                 # Full suite
pnpm test -- --reporter=verbose  # Verbose output
pnpm test tests/commands/ping.test.js  # Single file
pnpm test -- --coverage   # With coverage
pnpm test:watch           # Watch mode
```

### Writing Tests

Tests use Vitest with Discord.js mocks:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import myCommand from '../../src/plugins/moderation/commands/mycommand.js';
import { createMockInteraction, createMockUser } from '../mocks/discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getGuildData: vi.fn(),
    updateGuildData: vi.fn((store, guildId, updater) =>
        Promise.resolve(updater({ nextCaseId: 1 }))),
}));

describe('MyCommand', () => {
    it('should have correct name', () => {
        expect(myCommand.name).toBe('mycommand');
    });
    
    it('should execute successfully', async () => {
        const interaction = createMockInteraction({ /* ... */ });
        await myCommand.execute(interaction);
        expect(interaction.reply).toHaveBeenCalled();
    });
});
```

### CI/CD Pipeline

GitHub Actions workflows:

- **CI** (`ci.yml`): Lint + test on every push, pnpm 11, Node 26
- **Docker CI** (`docker-ci.yml`): Build production image, Trivy scan, SBOM generation
- **Security** (`security.yml`): Dependency audit, CodeQL analysis, SAST scanning
- **Docker Release** (`docker-release.yml`): Multi-platform publish to GHCR on tag
- **Deploy** (`deploy.yml`): Kubernetes rolling update on main
- **Code Review** (`code-review.yml`): Automated PR review suggestions

## Docker

### Development

```bash
docker-compose up -d
docker-compose logs -f
docker-compose down
```

### Production Build

```bash
docker build -f Dockerfile.prod -t apollo-discord-bot .

# Run with SQLite (single instance)
docker run -d --name apollo \
  -e DISCORD_TOKEN=your-token \
  apollo-discord-bot

# Run with PostgreSQL + Redis (multi-instance)
docker run -d --name apollo-gateway \
  -e RUN_MODE=gateway \
  -e DISCORD_TOKEN=your-token \
  -e DB_TYPE=postgres \
  -e DATABASE_URL=postgres://user:pass@host:5432/apollo \
  -e REDIS_URL=redis://host:6379 \
  apollo-discord-bot
```

### GitHub Container Registry

```bash
docker pull ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest
docker run -d --name apollo \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your-token \
  ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest
```

## Troubleshooting

### Bot Won't Start
- Verify `DISCORD_TOKEN` is set correctly in `.env`
- Run `pnpm install` to ensure all dependencies are installed
- Check Docker logs: `docker-compose logs -f`
- For PostgreSQL: ensure `DATABASE_URL` is correct and DB is reachable

### Commands Not Appearing
- Run `node deploy-commands.js` to register slash commands
- Global commands take up to 1 hour to propagate
- Using `GUILD_ID` in `.env` makes commands appear instantly (dev only)

### Multi-Instance Issues
- **Workers not processing**: Check `REDIS_URL` connectivity and BullMQ queue
- **Leader not elected**: Verify Redis is running and `POD_ID` values are unique
- **Cross-pod events not firing**: Ensure all pods share the same Redis instance
- **Database conflicts**: SQLite does not support multi-writer — use PostgreSQL

### Specific Features
- **Welcome messages**: Create a `#welcome` channel, ensure bot has Send Messages permission
- **Logging**: `/setlogchannel set #channel`, `/logging enable event_name`
- **Tickets**: Run `/ticketsetup category` first, ensure bot has Manage Channels
- **Mute role**: If Discord timeout fails, bot falls back to a `Muted` role (auto-created if missing)
- **Tests failing**: `pnpm test` requires better-sqlite3 native build — run `pnpm rebuild better-sqlite3` if needed

## Feature Details

### Warning System
- Issue with `/warn @user reason`
- Thresholds: 3 → mute, 5 → kick, 7 → ban (configurable per-server via `/warnconfig`)
- View with `/warnings @user`, clear with `/clearwarnings @user`

### Auto-Moderation
Configure with `/automod`:
- Banned words, invite filter, link filter, mention spam, caps filter, spam detection, account age minimum
- Exempt channels/roles bypass all filters

### Ticket System
1. `/ticketsetup category`, `/ticketsetup supportrole`, `/ticketsetup panel`
2. Users click panel button or use `/ticket`
3. Staff close with `/closeticket` or close button
4. Transcripts saved to `data/transcripts/` as JSON

### Reaction Roles
- `/reactionrole add <messageId> <emoji> @role`
- `/reactionrole remove <messageId> <emoji>`
- `/reactionrole list`, `/reactionrole clear <messageId>`

### Blacklist System
- `/blacklist add @user reason` — user is auto-banned on future join attempts
- `/blacklist remove @user`, `/blacklist list`
- Optional global blacklist (all servers using the bot)

### Polls
- `/poll question:"Question" options:"A | B | C"` with optional `duration:1h`
- Results auto-posted when duration expires (requires scheduler)

### Case System
- Every moderation action creates a case with a unique numeric ID
- `/case view <id>`, `/case search <user>`, `/case edit <id>`, `/case delete <id>`

## API Reference

### EventBus Events

| Event | Payload | Emitter | Description |
|-------|---------|---------|-------------|
| `moderation:action` | `{ type, targetId, moderatorId, reason }` | Moderation plugin | Any mod action taken |
| `tickets:created` | `{ ticketNumber, guildId, userId }` | Tickets plugin | New ticket opened |
| `tickets:closed` | `{ ticketNumber, guildId, userId }` | Tickets plugin | Ticket closed |
| `automod:action` | `{ type, userId, guildId, details }` | Automod plugin | Auto-mod triggered |
| `member:joined` | `{ userId, guildId, memberCount }` | Core events | Member joined |
| `member:left` | `{ userId, guildId, memberCount }` | Core events | Member left |

### Provided APIs

| API | Parameters | Returns | Provider | Description |
|-----|-----------|---------|----------|-------------|
| `moderation:getCaseCount` | `(guildId)` | `number` | Moderation | Total cases in guild |
| `moderation:getWarnings` | `(guildId, userId)` | `Array` | Moderation | User's warnings |
| `tickets:getOpenTickets` | `(guildId)` | `Array` | Tickets | Open tickets count |
| `automod:checkMessage` | `(message)` | `Object` | Automod | Message filter results |

### Reactive State Keys

| Key | Type | Provider | Description |
|-----|------|----------|-------------|
| `moderation:config` | `Object` | Moderation | Per-guild mod settings |
| `automod:filters` | `Map` | Automod | Active filter state |
| `tickets:panels` | `Map` | Tickets | Active ticket panels |

## Bot Permissions

When inviting the bot, ensure it has these permissions:
- Send Messages, Embed Links
- Manage Roles, Manage Messages, Manage Channels
- Kick Members, Ban Members, Moderate Members (timeout)
- View Channel, Add Reactions, Read Message History

## Documentation

For detailed setup guides, command references, developer guides, and troubleshooting, visit the **[Apollo Org documentation](https://the-a-p-o-l-l-o-organization.github.io/Apollo-Org-Docs/docs/projects/apollo/intro)**.

## License

This project is licensed under the GPLv3 License — see the LICENSE file for details.

## Legal

- [Privacy Policy](legal/PRIVACY.md) — How Apollo processes data when self-hosted
- [Terms of Service](legal/TOS.md) — Terms governing use of the Bot
- [NOTICE](NOTICE) — Third-party attributions and Discord policy references

**Before running the bot**, you must read both the Terms of Service and Privacy Policy, then set `OPERATOR_AGREEMENT=true` and `OPERATOR_CONTACT` in your `.env` file. The bot will refuse to start otherwise.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Write tests for new features
2. Ensure all tests pass: `pnpm test`
3. Follow existing code style (ES modules, Vitest, discord.js v14 patterns)
4. Update documentation as needed

## Acknowledgments

- [discord.js](https://discord.js.org/) — Discord API library
- [BullMQ](https://bullmq.io/) — Redis-backed job queues
- [Knex](https://knexjs.org/) — SQL query builder
- [Vitest](https://vitest.dev/) — Test framework
- [Discord Developer Portal](https://discord.com/developers/applications) — Bot management
