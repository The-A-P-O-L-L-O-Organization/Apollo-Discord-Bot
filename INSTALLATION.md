# Installation Guide

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Single Instance)](#quick-start-single-instance)
- [Multi-Instance Kubernetes Setup](#multi-instance-kubernetes-setup)
- [Configuration Reference](#configuration-reference)
- [Docker Deployment](#docker-deployment)
- [Upgrading from v1 to v2](#upgrading-from-v1-to-v2)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required
- **Node.js** >= 26 (CI uses `node:26-alpine`)
- **pnpm** >= 11 (install via `corepack enable && corepack prepare pnpm@latest --activate`)
- A [Discord Application](https://discord.com/developers/applications) with a bot token

### For Multi-Instance
- **PostgreSQL** >= 14
- **Redis** >= 7
- **Kubernetes** cluster (kind, minikube, or production cluster)
- **kubectl** configured

---

## Quick Start (Single Instance)

The default mode runs everything in a single process using SQLite — no external services needed.

### 1. Clone and Install

```bash
git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
cd Apollo-Discord-Bot
pnpm install
```

### 2. Configure Environment

Copy and edit the example environment file:

```bash
cp .env.example .env
```

Minimal required config:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
OWNER_IDS=your_discord_user_id
```

### 3. Deploy Slash Commands

```bash
node deploy-commands.js
```

### 4. Start the Bot

```bash
pnpm start
```

The bot starts in **gateway mode** by default (`RUN_MODE=gateway`), using **SQLite** for data storage. All plugins are auto-loaded from `src/plugins/`.

### Verify It's Running

Check the console for:
```
[SUCCESS] Bot is online! Logged in as BotName#0000
[INFO] Loading plugins...
[SUCCESS] Bot fully initialized!
```

Use `/system` to view health status, `/plugin list` to see loaded plugins.

---

## Multi-Instance Kubernetes Setup

The multi-instance architecture splits the bot into two pod types:

- **Gateway** (1 replica, managed by leader election): Connects to Discord via WebSocket, handles real-time events, enqueues expensive work to BullMQ
- **Worker** (N replicas): Pulls jobs from BullMQ, executes them, responds via Discord REST API, no discord.js dependency

```
                    ┌──────────────┐
                    │   Discord    │
                    │   Gateway    │
                    └──────┬───────┘
                           │ WebSocket
                    ┌──────▼───────┐
                    │   Gateway    │  ← Leader election via Redis
                    │   Pod (x1)   │     (SET NX PX + heartbeat)
                    └──────┬───────┘
                           │ enqueue
                    ┌──────▼───────┐
                    │   BullMQ     │
                    │   (Redis)    │
                    └──────┬───────┘
                           │ pull
                    ┌──────▼───────┐
                    │   Worker     │  ← N replicas, stateless
                    │   Pods (xN)  │     respond via REST API
                    └──────┬───────┘
                           │ read/write
                    ┌──────▼───────┐
                    │  PostgreSQL  │
                    │  (shared DB) │
                    └──────────────┘
```

### 1. Infrastructure Setup

#### PostgreSQL

Create a database and user:

```sql
CREATE DATABASE apollo;
CREATE USER apollo WITH PASSWORD 'strong-password';
GRANT ALL PRIVILEGES ON DATABASE apollo TO apollo;
\c apollo
GRANT ALL ON SCHEMA public TO apollo;
```

Run migrations:

```bash
DATABASE_URL=postgresql://apollo:strong-password@postgres-host:5432/apollo \
DB_TYPE=postgres \
node -e "import('./src/db/knex.js').then(m => m.runMigrations())"
```

#### Redis

Configure with `requirepass` for production:

```bash
# redis.conf
requirepass strong-redis-password
```

### 2. Build the Docker Image

```bash
docker build -f Dockerfile.prod -t apollo-bot:latest .
```

Or use the provided Kubernetes manifests.

### 3. Kubernetes Manifests

Create the following resources (adjust for your cluster):

#### Namespace & ConfigMap

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: apollo
```

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: apollo-config
  namespace: apollo
data:
  DB_TYPE: "postgres"
  DATABASE_URL: "postgresql://apollo:strong-password@postgres-svc:5432/apollo"
  REDIS_HOST: "redis-svc"
  REDIS_PORT: "6379"
  QUEUE_ENABLED: "true"
  QUEUE_PREFIX: "apollo"
  NODE_ENV: "production"
  RUN_MODE: "gateway"
```

#### Secrets

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: apollo-secrets
  namespace: apollo
type: Opaque
stringData:
  DISCORD_TOKEN: "your_bot_token"
  CLIENT_ID: "your_client_id"
  OWNER_IDS: "your_user_id"
  REDIS_PASSWORD: "strong-redis-password"
```

#### Gateway Deployment

```yaml
# k8s/gateway-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: apollo-gateway
  namespace: apollo
spec:
  replicas: 2  # Only 1 is active; leader election manages failover
  selector:
    matchLabels:
      app: apollo
      role: gateway
  template:
    metadata:
      labels:
        app: apollo
        role: gateway
    spec:
      containers:
      - name: gateway
        image: apollo-bot:latest
        envFrom:
        - configMapRef:
            name: apollo-config
        - secretRef:
            name: apollo-secrets
        env:
        - name: RUN_MODE
          value: "gateway"
        - name: POD_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

#### Worker Deployment

```yaml
# k8s/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: apollo-worker
  namespace: apollo
spec:
  replicas: 3  # Scale based on load
  selector:
    matchLabels:
      app: apollo
      role: worker
  template:
    metadata:
      labels:
        app: apollo
        role: worker
    spec:
      containers:
      - name: worker
        image: apollo-bot:latest
        envFrom:
        - configMapRef:
            name: apollo-config
        - secretRef:
            name: apollo-secrets
        env:
        - name: RUN_MODE
          value: "worker"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1"
```

#### Horizontal Pod Autoscaler (Worker)

```yaml
# k8s/hpa-worker.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: apollo-worker-hpa
  namespace: apollo
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: apollo-worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 4. Deploy to Kubernetes

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/gateway-deployment.yaml
kubectl apply -f k8s/worker-deployment.yaml
kubectl apply -f k8s/hpa-worker.yaml
```

### 5. Verify Multi-Instance

```bash
# Check pods
kubectl get pods -n apollo

# Check which gateway is leader
kubectl exec -n apollo deploy/apollo-gateway -- sh -c "
  node -e \"const {Redis} = require('ioredis');
  const r = new Redis({host: process.env.REDIS_HOST, password: process.env.REDIS_PASSWORD});
  r.get('apollo:gateway:leader').then(v => {console.log('Leader:', v); r.quit()})\"
"

# Check queue stats
kubectl exec -n apollo deploy/apollo-gateway -- sh -c "
  node -e \"
  const {getQueueMetrics} = require('./src/queue/metrics.js');
  getQueueMetrics({enabled: true, redis: {host: process.env.REDIS_HOST, password: process.env.REDIS_PASSWORD}, prefix: 'apollo'}).then(console.log)
  \"
"

# View worker logs
kubectl logs -n apollo -l app=apollo,role=worker --tail=20
```

### 6. Run Database Migrations

```bash
kubectl exec -n apollo deploy/apollo-gateway -- node -e "
  import('./src/db/knex.js').then(m => m.runMigrations()).then(() => console.log('Migrations complete'))
"
```

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DISCORD_TOKEN` | — | Discord bot token (required) |
| `CLIENT_ID` | — | Discord application client ID (required) |
| `OWNER_IDS` | — | Comma-separated Discord user IDs with owner access |
| `RUN_MODE` | `gateway` | `gateway` for WebSocket connection, `worker` for job processing |
| `POD_ID` | `default` | Unique pod identifier for leader election |
| `NODE_ENV` | `production` | Environment name |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_TYPE` | `sqlite` | `sqlite` (single-instance) or `postgres` (multi-instance) |
| `DATABASE_URL` | `postgresql://localhost:5432/apollo` | PostgreSQL connection string (only used when `DB_TYPE=postgres`) |
| `DB_POOL_MIN` | `2` | Minimum PostgreSQL pool connections |
| `DB_POOL_MAX` | `10` | Maximum PostgreSQL pool connections |

### Queue (BullMQ / Redis)

| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_ENABLED` | `false` | Set to `true` to enable BullMQ work queue |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis authentication password |
| `QUEUE_PREFIX` | `apollo` | Prefix for BullMQ queue keys |
| `QUEUE_STALLED_INTERVAL` | `30000` | Stalled job check interval (ms) |

### Full Config Structure

The runtime config is defined in `src/config/config.js`. All fields have safe defaults.

```js
{
  DISCORD_TOKEN: '...',
  CLIENT_ID: '...',

  activity: {
    name: 'for new members join',
    type: 'WATCHING'
  },

  welcome: {
    channelName: 'welcome',
    message: 'Welcome {user} to {server}! ...'
  },

  moderation: {
    defaultReason: 'No reason provided',
    muteRoleName: 'Muted',
    muteDuration: 3600000,
    maxMessagesPerPurge: 100,
    purgeCooldown: 5000,
    logModerationActions: true,
    moderationLogChannel: 'mod-logs'
  },

  warnings: {
    thresholds: { mute: 3, kick: 5, ban: 7 },
    muteDuration: 3600000,
    dmOnWarn: true
  },

  automod: {
    enabled: false,
    bannedWords: [],
    maxMentions: 5,
    maxCapsPercent: 70,
    minCapsLength: 10,
    minAccountAge: 0,
    filterInvites: true,
    filterLinks: false,
    spamThreshold: 5,
    spamInterval: 5000,
    action: 'warn'
  },

  tickets: {
    categoryName: 'Support Tickets',
    channelPrefix: 'ticket-',
    welcomeMessage: 'Thank you for creating a ticket! ...'
  },

  logging: {
    availableEvents: ['messageDelete', 'messageEdit', 'memberJoin', 'memberLeave', 'roleChanges', 'voiceChanges'],
    defaultEvents: { messageDelete: true, messageEdit: true, memberJoin: true, memberLeave: true, roleChanges: true, voiceChanges: false }
  },

  reminders: {
    checkInterval: 30000,
    maxDuration: 2592000000
  },

  polls: {
    defaultDuration: 86400000,
    maxDuration: 604800000,
    maxOptions: 10
  },

  reactionRoles: {
    dmOnRole: false
  },

  plugins: {
    enabled: ['utility', 'admin', 'moderation', 'tickets', 'automod'],
    directory: './src/plugins',
    optionalDirectory: './data/plugins',
    registryFile: './data/plugin-registry.json'
  },

  database: {
    type: 'sqlite',       // or 'postgres'
    postgres: {
      connectionString: 'postgresql://localhost:5432/apollo',
      pool: { min: 2, max: 10 }
    }
  },

  podId: 'default',
  queue: {
    enabled: false,
    redis: { host: 'localhost', port: 6379, password: undefined },
    prefix: 'apollo',
    stalledInterval: 30000
  }
}
```

### Command Overview

| Command | Description | Owner Only |
|---------|-------------|------------|
| `/plugin list` | List loaded plugins | Yes |
| `/plugin enable <name>` | Enable a plugin | Yes |
| `/plugin disable <name>` | Disable a plugin | Yes |
| `/plugin reload <name>` | Hot-reload a plugin | Yes |
| `/plugin load <name>` | Load a plugin from disk | Yes |
| `/plugin install <name>` | Install from registry | Yes |
| `/plugin uninstall <name>` | Remove a plugin | Yes |
| `/plugin search <query>` | Search plugin registry | Yes |
| `/plugin update <name>` | Re-download and reload | Yes |
| `/system` | Health dashboard | Yes |
| `/queue` | Queue statistics | Yes |
| `/migrate status` | Migration status | Yes |
| `/migrate run` | Run migrations | Yes |
| `/setlogchannel` | Configure logging | No |
| `/logging` | Manage log events | No |
| `/reactionrole` | Reaction role config | No |
| ... | All moderation, ticket, utility commands | No |

---

## Docker Deployment

### Build

**Single-stage** (simpler, larger image):
```bash
docker build -f Dockerfile -t apollo-bot:latest .
```

**Multi-stage** (smaller, production-optimized):
```bash
docker build -f Dockerfile.prod -t apollo-bot:latest .
```

### Run

```bash
docker run -d \
  --name apollo-bot \
  -e DISCORD_TOKEN=your_token \
  -e CLIENT_ID=your_client_id \
  -e OWNER_IDS=your_user_id \
  -v apollo-data:/app/bot \
  apollo-bot:latest
```

### Docker Compose (Single Instance)

```yaml
# docker-compose.yml
services:
  bot:
    build:
      context: .
      dockerfile: Dockerfile.prod
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - CLIENT_ID=${CLIENT_ID}
      - OWNER_IDS=${OWNER_IDS}
    volumes:
      - apollo-data:/app/bot
    restart: unless-stopped

volumes:
  apollo-data:
```

### Docker Compose (Multi-Instance, Development)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: apollo
      POSTGRES_USER: apollo
      POSTGRES_PASSWORD: apollo-dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass apollo-dev
    ports:
      - "6379:6379"

  gateway:
    build:
      context: .
      dockerfile: Dockerfile.prod
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - CLIENT_ID=${CLIENT_ID}
      - OWNER_IDS=${OWNER_IDS}
      - DB_TYPE=postgres
      - DATABASE_URL=postgresql://apollo:apollo-dev@postgres:5432/apollo
      - REDIS_HOST=redis
      - REDIS_PASSWORD=apollo-dev
      - QUEUE_ENABLED=true
      - RUN_MODE=gateway
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: Dockerfile.prod
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - CLIENT_ID=${CLIENT_ID}
      - OWNER_IDS=${OWNER_IDS}
      - DB_TYPE=postgres
      - DATABASE_URL=postgresql://apollo:apollo-dev@postgres:5432/apollo
      - REDIS_HOST=redis
      - REDIS_PASSWORD=apollo-dev
      - QUEUE_ENABLED=true
      - RUN_MODE=worker
    deploy:
      replicas: 3
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

volumes:
  pgdata:
```

---

## Upgrading from v1 to v2

### What Changed

v2 introduces a modular plugin system, async database operations, and optional multi-instance support. Key structural changes:

| Area | v1 | v2 |
|------|----|----|
| Commands | `src/commands/*.js` (flat) | `src/plugins/*/commands/*.js` (scoped to plugin) |
| Events | `src/events/*.js` (flat) | `src/plugins/*/events/*.js` (scoped to plugin) |
| Bot Init | `src/handlers/commandHandler.js` + `eventHandler.js` | `src/core/PluginManager.js` auto-loads plugins |
| DB Layer | Synchronous `db.js` | Async `db.js` (all functions return Promises) |
| DB Writes | `getGuildData()` → mutate → `setGuildData()` | `updateGuildData(store, guildId, updater)` (atomic) |
| Config | Flat in `src/config/config.js` | Same file, but new sections: `database`, `queue`, `plugins`, `podId` |
| Multi-Instance | Not supported | PostgreSQL + Redis + BullMQ + leader election |
| Package Mgr | npm | pnpm (v11) |

### Pre-Migration Checklist

Before upgrading, check if your bot has any customizations:

```bash
# Check for custom commands (will be ignored in v2)
ls src/commands/ 2>/dev/null | grep -v -E "$(ls src/plugins/*/commands/ 2>/dev/null | xargs -I{} basename {} .js | tr '\n' '|')"

# Check for custom events
ls src/events/ 2>/dev/null

# Check for custom handlers
ls src/handlers/ 2>/dev/null
```

### Migration Steps

#### 1. Backup Your Data

```bash
# If using SQLite (default)
cp bot/apollo.db bot/apollo.db.v1.backup

# Also backup config
cp config.json config.json.v1.backup  # if you use one
```

#### 2. Install pnpm v11

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

#### 3. Install Dependencies

```bash
# Remove old node_modules
rm -rf node_modules

# Install with pnpm
pnpm install
```

#### 4. Migrate Custom Commands to Plugins

If you had custom commands in `src/commands/`, they must be moved into a plugin. Create a new plugin directory:

```bash
mkdir -p src/plugins/custom/commands
```

Move each command file into `src/plugins/custom/commands/` — no code changes needed if they follow the same export pattern (`{ name, description, options, execute }`).

Then register the plugin in `src/plugins/admin/admin.js` or add `'custom'` to `config.plugins.enabled` in `src/config/config.js`:

```js
plugins: {
    enabled: ['utility', 'admin', 'moderation', 'tickets', 'automod', 'custom'],
    // ...
}
```

#### 5. Verify Async DB Calls

If you have custom code that calls `getGuildData()`, `setGuildData()`, `getUserData()`, or `appendToUserArray()`, these are now async. Add `await`:

```js
// v1 (sync) — will break in v2
const data = getGuildData('store', guildId);

// v2 (async) — correct
const data = await getGuildData('store', guildId);
```

#### 6. Check Config for New Required Fields

The config file now expects `database`, `queue`, and `plugins` sections. All have safe defaults:

```js
database: {
    type: 'sqlite',  // or 'postgres'
    postgres: {
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/apollo',
        pool: { min: 2, max: 10 }
    }
},
queue: {
    enabled: process.env.QUEUE_ENABLED === 'true',  // false by default
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    prefix: process.env.QUEUE_PREFIX || 'apollo',
    stalledInterval: 30000,
},
podId: process.env.POD_ID || process.env.HOSTNAME || 'default',
plugins: {
    enabled: ['utility', 'admin', 'moderation', 'tickets', 'automod'],
    directory: './src/plugins',
    optionalDirectory: './data/plugins',
    registryFile: './data/plugin-registry.json'
}
```

No changes needed if using the default config — these are already present in `src/config/config.js`.

#### 7. Deploy Slash Commands

```bash
node deploy-commands.js
```

#### 8. Start and Verify

```bash
pnpm start
```

Check that:
- All plugins load (`/plugin list` shows 5 plugins enabled)
- Existing slash commands work (moderation, tickets, utility)
- `/system` shows healthy status
- Database operations work (warn, mute, ticket creation, etc.)

### Rollback Plan

If migration fails, revert to the v1 backup:

```bash
git checkout main
npm install  # v1 uses npm
cp bot/apollo.db.v1.backup bot/apollo.db
npm start
```

### Data Compatibility

- **SQLite**: The database schema is unchanged. The existing `bot/apollo.db` file is fully compatible with v2's SQLite mode.
- **PostgreSQL**: If migrating from SQLite to PostgreSQL, see the [data migration docs](./docs/data-migration.md).
- **Plugin Data**: Plugin configuration and guild data are stored in the same DB tables. No data migration needed when staying on SQLite.

---

## Troubleshooting

### Bot Won't Start

```
Error: Plugin is abstract; create a subclass that defines static id
```
A plugin directory exists but is missing a valid `plugin.js` entry point. Either create it or remove the directory.

```
Error: Cannot find module '...'
```
Run `pnpm install` to ensure all dependencies are installed.

### Commands Not Showing Up

1. Run `node deploy-commands.js` to register global slash commands
2. Discord may take up to 1 hour to propagate global commands; use guild commands for testing:
   ```bash
   node deploy-commands.js --guild YOUR_GUILD_ID
   ```

### Database Errors in Multi-Instance Mode

```
Error: relation "guild_store" does not exist
```
Run migrations: `/migrate run` or `node -e "import('./src/db/knex.js').then(m => m.runMigrations())"`

### Redis Connection Refused

```
[ioredis] Unhandled error event: Error: connect ECONNREFUSED
```
Check that `REDIS_HOST` and `REDIS_PORT` are correct, and Redis is running with authentication if `REDIS_PASSWORD` is set.

### Worker Not Processing Jobs

Check that:
- `QUEUE_ENABLED=true` on both gateway and worker pods
- Workers can reach Redis
- Workers can reach Discord REST API (no firewall blocking `discord.com`)
- Worker pods have `RUN_MODE=worker`

### Leader Election Issues

```
[Gateway] Another pod holds the leader lock. Standing by...
```
This is normal — only one gateway pod is active at a time. If the leader crashes, another pod takes over within 10 seconds (lock TTL). If no pod ever becomes leader, check that Redis is reachable and the lock key isn't stuck:

```
kubectl exec -n apollo deploy/apollo-gateway -- redis-cli -a $REDIS_PASSWORD DEL apollo:gateway:leader
```

### Performance

- **Single instance**: SQLite handles small to medium servers (< 10,000 members) without issues
- **Multi-instance**: PostgreSQL + BullMQ is recommended for larger servers or high availability
- **Worker scaling**: Start with 3 workers; monitor `/queue` for backlog. Add workers if `waiting` count grows
- **Memory**: Gateway pods use ~150-300MB; worker pods use ~50-100MB idle, more during job execution
