FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY packages/bot/package.json ./packages/bot/
COPY packages/core/package.json ./packages/core/
COPY packages/exchanges/package.json ./packages/exchanges/
COPY packages/strategies/package.json ./packages/strategies/
COPY packages/risk-engine/package.json ./packages/risk-engine/

# Install dependencies
RUN npm ci --only=production

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build all packages
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV CONFIG_PATH=/app/config/prod.yaml

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 botuser

# Copy built files
COPY --from=builder --chown=botuser:nodejs /app/packages/bot/dist ./packages/bot/dist
COPY --from=builder --chown=botuser:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=botuser:nodejs /app/packages/exchanges/dist ./packages/exchanges/dist
COPY --from=builder --chown=botuser:nodejs /app/packages/strategies/dist ./packages/strategies/dist
COPY --from=builder --chown=botuser:nodejs /app/packages/risk-engine/dist ./packages/risk-engine/dist
COPY --from=builder --chown=botuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=botuser:nodejs /app/package.json ./

# Copy config
COPY --chown=botuser:nodejs packages/bot/config ./config

# Create logs directory
RUN mkdir -p /var/log/trading-bot && chown botuser:nodejs /var/log/trading-bot

USER botuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose health check port
EXPOSE 8080

# Start the bot
CMD ["node", "packages/bot/dist/index.js"]
