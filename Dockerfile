# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:25-alpine AS deps

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN apk add --no-cache build-base python3

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,id=npm-ci,sharing=locked npm ci

FROM deps AS builder

COPY . .
RUN --mount=type=cache,target=/app/.next/cache,sharing=locked npm run build

FROM node:25-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs \
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
