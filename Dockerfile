# Dockerfile for Apollo Discord Bot
# Optimized for production use with Node.js

# Use official Node.js image as base
FROM node:24.14-alpine3.23

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies (including native builds)
RUN npm install && \
    cd node_modules/better-sqlite3 && \
    npm run build-release

# Copy application source code
COPY src ./src
COPY deploy-commands.js ./

# Create directories for persistent data
RUN mkdir -p /app/bot /app/logs

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
CMD ["npm", "start"]
