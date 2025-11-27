# Multi-stage Dockerfile for Elova - Workflow Observability Platform

# Build arguments
ARG VERSION="0.1.0"
ARG GIT_COMMIT="unknown"
ARG BUILD_DATE="unknown"

# Stage 1: Build dependencies and application
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the Next.js application with minimal environment
# Database will be configured at runtime via initialization script
RUN npm run build

# Stage 2: Production image
FROM node:18-alpine AS runner

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S elova -u 1001

# Install runtime dependencies
RUN apk add --no-cache dumb-init curl jq bash sqlite

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Environment variables for database configuration should be provided at runtime
# The application will use SQLite by default or Supabase if configured

# Set build metadata as environment variables
ARG VERSION
ARG GIT_COMMIT  
ARG BUILD_DATE
ENV APP_VERSION=${VERSION}
ENV APP_GIT_COMMIT=${GIT_COMMIT}
ENV APP_BUILD_DATE=${BUILD_DATE}

# Copy built application from builder stage
COPY --from=builder --chown=elova:nodejs /app/.next/standalone ./
COPY --from=builder --chown=elova:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=elova:nodejs /app/public ./public

# Copy initialization script
COPY scripts/docker-init.sh /usr/local/bin/init.sh
RUN chmod +x /usr/local/bin/init.sh

# Copy database migrations
COPY --chown=elova:nodejs database/ ./database/

# No .env file needed - configuration is stored in database

# Create necessary directories
RUN mkdir -p /app/data /app/logs && \
    chown elova:nodejs /app/data /app/logs

# Switch to non-root user
USER elova

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run initialization script and start the application
CMD ["/bin/bash", "-c", "/usr/local/bin/init.sh && node server.js"]
