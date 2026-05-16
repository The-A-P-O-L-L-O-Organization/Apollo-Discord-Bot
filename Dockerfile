# Dockerfile for Apollo Discord Bot
# Optimized for production use with Node.js

# Use official Node.js image as base
FROM node:26-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Install pnpm
RUN npm install -g corepack && corepack enable && corepack prepare pnpm@latest --activate

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./

# Install dependencies (postinstall rebuilds better-sqlite3)
RUN pnpm install --frozen-lockfile

# Copy application source code
COPY src ./src
COPY bin ./bin
COPY deploy-commands.js ./
COPY data ./data

# Create directories for persistent data
RUN mkdir -p /app/bot /app/logs /app/data/plugins && \
    ln -s /app/bin/apollo.js /usr/local/bin/apollo

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Start the bot
CMD ["pnpm", "start"]

