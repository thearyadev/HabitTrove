# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:25-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,target=/app/.next/cache npm run build

FROM node:25-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid 1001 nextjs \
  && mkdir -p /app/data /app/backups \
  && chown -R nextjs:nodejs /app/data /app/backups

COPY --from=builder /app/public ./public
COPY --from=builder /app/CHANGELOG.md ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

VOLUME ["/app/data", "/app/backups"]

CMD ["node", "server.js"]
