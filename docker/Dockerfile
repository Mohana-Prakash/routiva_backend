# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN corepack disable 2>/dev/null || true
# Prisma's query engine binary for linux-musl needs OpenSSL present on Alpine.
RUN apk add --no-cache openssl

# ---- deps: install all dependencies (including dev) for building ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# ---- build: compile TypeScript and generate the Prisma client ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime: minimal production image ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma's query engine binary for linux-musl needs OpenSSL present on Alpine.
RUN apk add --no-cache openssl && addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health/live', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
