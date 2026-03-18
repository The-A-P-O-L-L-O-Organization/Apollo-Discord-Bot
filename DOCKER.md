# Docker Deployment Guide

This guide will help you deploy the Apollo Discord Bot using Docker and Docker Compose.

## Prerequisites

- Docker installed ([Install Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed ([Install Docker Compose](https://docs.docker.com/compose/install/))
- A Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
cd Apollo-Discord-Bot
```

### 2. Configure Environment Variables

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your favorite text editor:

```bash
nano .env
# or
vim .env
```

Required variables:

```env
# Discord Bot Token (Required)
DISCORD_TOKEN=your-discord-bot-token-here

# Discord Client ID (Required)
CLIENT_ID=your-client-id-here

# Dashboard Settings (Optional)
DASHBOARD_PORT=3001
DASHBOARD_TOKEN=your-secure-random-token-here

# Bot Owner IDs (Optional - for /reload command)
OWNER_IDS=123456789012345678
```

### 3. Start the Bot

```bash
docker-compose up -d
```

This command will:
- Build the Docker image
- Start the bot container in detached mode
- Create persistent volumes for data and logs
- Expose the dashboard on port 3001 (if configured)

### 4. Verify the Bot is Running

```bash
# View logs
docker-compose logs -f bot

# Check container status
docker-compose ps
```

### 5. Access the Dashboard (Optional)

If you configured the dashboard, open your browser:

```
http://localhost:3001
```

Use the `DASHBOARD_TOKEN` from your `.env` file to authenticate.

## Docker Commands Reference

### Start/Stop

```bash
# Start the bot (if already built)
docker-compose start

# Stop the bot
docker-compose stop

# Restart the bot
docker-compose restart

# Stop and remove containers
docker-compose down
```

### Build and Update

```bash
# Rebuild and start (after code changes)
docker-compose up -d --build

# Pull latest code and rebuild
git pull
docker-compose up -d --build
```

### Logs

```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View last 100 lines
docker-compose logs --tail=100

# View logs for specific service
docker-compose logs -f bot
```

### Data Management

```bash
# View volumes
docker volume ls

# Inspect volume
docker volume inspect apollo-discord-bot_bot-data

# Backup database
docker cp apollo-discord-bot:/app/bot/data.db ./backup-data.db

# Restore database
docker cp ./backup-data.db apollo-discord-bot:/app/bot/data.db
docker-compose restart
```

### Clean Up

```bash
# Stop and remove containers (keeps volumes/data)
docker-compose down

# Stop and remove containers AND volumes (DELETES ALL DATA)
docker-compose down -v

# Remove unused Docker images
docker image prune -a
```

## Production Deployment

### Using Dockerfile.prod

For production, use the optimized multi-stage Dockerfile:

```bash
# Build with production Dockerfile
docker-compose -f docker-compose.yml build --build-arg DOCKERFILE=Dockerfile.prod

# Or build directly
docker build -f Dockerfile.prod -t apollo-discord-bot:prod .
```

### Environment-Specific Compose Files

Create `docker-compose.prod.yml`:

```yaml
services:
  bot:
    build:
      context: .
      dockerfile: Dockerfile.prod
    restart: always
    environment:
      - NODE_ENV=production
```

Run with:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Using Pre-built Images from GitHub Packages

```bash
# Pull the latest image
docker pull ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest

# Run the container
docker run -d \
  --name apollo-discord-bot \
  --restart unless-stopped \
  -v bot-data:/app/bot \
  -v bot-logs:/app/logs \
  -p 3001:3001 \
  -e DISCORD_TOKEN=your-token \
  -e CLIENT_ID=your-client-id \
  -e DASHBOARD_TOKEN=your-dashboard-token \
  ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest
```

## Persistent Data

The bot uses Docker volumes to persist data across container restarts:

- `bot-data`: Contains the SQLite database (`data.db`) and ticket transcripts
- `bot-logs`: Contains application logs

These volumes are automatically created by Docker Compose.

### Volume Locations

On Linux:
```
/var/lib/docker/volumes/apollo-discord-bot_bot-data/_data
/var/lib/docker/volumes/apollo-discord-bot_bot-logs/_data
```

On Windows (Docker Desktop):
```
\\wsl$\docker-desktop-data\data\docker\volumes\apollo-discord-bot_bot-data\_data
\\wsl$\docker-desktop-data\data\docker\volumes\apollo-discord-bot_bot-logs\_data
```

On macOS (Docker Desktop):
```
~/Library/Containers/com.docker.docker/Data/vms/0/data/docker/volumes/apollo-discord-bot_bot-data/_data
~/Library/Containers/com.docker.docker/Data/vms/0/data/docker/volumes/apollo-discord-bot_bot-logs/_data
```

## Troubleshooting

### Container Exits Immediately

Check the logs:
```bash
docker-compose logs bot
```

Common issues:
- Missing `DISCORD_TOKEN` in `.env`
- Invalid Discord token
- Missing required dependencies

### Permission Errors

The container runs as a non-root user (nodejs, UID 1001). If you have permission issues:

```bash
# Fix volume permissions
docker-compose down
docker volume rm apollo-discord-bot_bot-data apollo-discord-bot_bot-logs
docker-compose up -d
```

### Database Locked

If you see "database is locked" errors:

```bash
# Restart the container
docker-compose restart

# If that doesn't work, rebuild
docker-compose down
docker-compose up -d --build
```

### Port Already in Use

If port 3001 is already in use, change it in `.env`:

```env
DASHBOARD_PORT=3002
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

### Out of Disk Space

Clean up Docker:

```bash
# Remove unused containers, networks, images
docker system prune -a

# Check disk usage
docker system df
```

## Health Checks

The container includes health checks that run every 30 seconds. Check the health status:

```bash
docker inspect --format='{{.State.Health.Status}}' apollo-discord-bot
```

## Monitoring

### View Resource Usage

```bash
# Real-time stats
docker stats apollo-discord-bot

# One-time stats
docker stats --no-stream apollo-discord-bot
```

### Dashboard Metrics

Access the dashboard at `http://localhost:3001` for:
- Bot uptime
- Memory usage
- Server count
- Command statistics

## Security Best Practices

1. **Never commit `.env` file** - It contains sensitive tokens
2. **Use strong dashboard tokens** - Generate with: `openssl rand -base64 32`
3. **Limit exposed ports** - Only expose dashboard if needed
4. **Keep Docker updated** - Regularly update Docker and images
5. **Use secrets for production** - Consider Docker secrets or environment-specific configs

## Advanced Configuration

### Custom Network

```yaml
services:
  bot:
    networks:
      - bot-network

networks:
  bot-network:
    driver: bridge
```

### Resource Limits

```yaml
services:
  bot:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Multiple Bots

Run multiple bot instances:

```bash
# Copy and modify docker-compose.yml for each bot
cp docker-compose.yml docker-compose.bot2.yml

# Edit container names, ports, and env files
# Then run:
docker-compose -f docker-compose.bot2.yml up -d
```

## Support

If you encounter issues:
1. Check logs: `docker-compose logs -f`
2. Review [GitHub Issues](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot/issues)
3. Create a new issue with logs and configuration details
