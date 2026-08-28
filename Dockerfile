# syntax=docker/dockerfile:1.4
# Dockerfile for Apollo Discord Bot
# Optimized for fast builds with BuildKit cache mounts

FROM node:26.7.0-alpine

# Install build dependencies for better-sqlite3 + pnpm in one layer
RUN apk add --no-cache python3 make g++ sqlite-dev && \
    npm install -g corepack && corepack enable && corepack prepare pnpm@11 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./

# Install dependencies with BuildKit cache mount for pnpm store
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# Copy application source code
COPY src ./src
COPY bin ./bin
COPY scripts/deploy-commands.js ./
COPY plugin-manifest.json ./

# Create directories for persistent data
RUN mkdir -p /app/src/data /app/logs /app/data/plugins && \
    ln -s /app/bin/apollo.js /usr/local/bin/apollo

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Health check - hits real /health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:9090/health', (r) => { if (r.statusCode !== 200) process.exit(1) }).on('error', () => process.exit(1))" || exit 1

CMD ["pnpm", "start"]