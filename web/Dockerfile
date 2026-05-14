# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────
# AgriGuardian AI — Next.js 15 dashboard
#   stage 1 (deps):  install only what package.json declares
#   stage 2 (build): produce a standalone .next/standalone bundle
#   stage 3 (run):   tiny node-alpine image serving the standalone server
#
# Designed for Cloud Run: listens on $PORT (defaults to 8080) and
# proxies /api/* to BACKEND_URL (the backend Cloud Run service).
# ──────────────────────────────────────────────────────────────

############################
# Stage 1 — deps
############################
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# package-lock.json may not exist in the demo repo — fall back to npm install.
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi

############################
# Stage 2 — build
############################
FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

############################
# Stage 3 — runtime
############################
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
# Cloud Run injects PORT — make sure Next listens on it.
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# Standalone output requires Next 13+ output:'standalone' (set in next.config.mjs).
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public

USER nextjs:nextjs
EXPOSE 8080
CMD ["node", "server.js"]

