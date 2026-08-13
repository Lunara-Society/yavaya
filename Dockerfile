# Yavaya production image.
#
# Platform-agnostic on purpose: this runs anywhere that accepts a container —
# Fly, Railway, Render, Cloud Run, ECS, or a plain VPS. Yavaya is not tied to
# one host, for the same reason it is not tied to one payment provider.
#
# Build:  docker build -t yavaya .
# Run:    docker run -p 3000:3000 --env-file .env.production yavaya

# --- Dependencies -------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Copied separately so the dependency layer is cached until the manifests change.
COPY package.json package-lock.json ./
RUN npm ci

# --- Build --------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The build must not reach a real database. Every page that touches Postgres is
# `force-dynamic`, so nothing here executes a query — but the environment schema
# is validated at import time, so placeholders are supplied to satisfy it.
# These values never reach the running container.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgres://build:build@127.0.0.1:5432/build"
ENV SESSION_SECRET="build-time-placeholder-value-not-used-at-runtime"
ENV SIGNAL_PEPPER="build-time-placeholder-value-not-used-at-runtime"

RUN npm run build

# --- Runtime ------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run as root. A container escape should not begin with a free root shell.
RUN addgroup --system --gid 1001 yavaya \
 && adduser --system --uid 1001 --ingroup yavaya yavaya

# `standalone` carries only the dependencies actually used, so no build
# toolchain and no dev dependencies reach production.
COPY --from=builder --chown=yavaya:yavaya /app/.next/standalone ./
COPY --from=builder --chown=yavaya:yavaya /app/.next/static ./.next/static
COPY --from=builder --chown=yavaya:yavaya /app/public ./public

# Migrations are run as a release step, not on boot: two instances starting at
# once must not race each other through the same migration.
COPY --from=builder --chown=yavaya:yavaya /app/drizzle ./drizzle

USER yavaya
EXPOSE 3000

# Reports unhealthy when the database is unreachable, so a broken instance is
# taken out of rotation rather than left serving errors.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
