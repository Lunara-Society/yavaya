# Deployment

Yavaya is a server-rendered application with a PostgreSQL database, server
actions and sessions. It cannot be published as static files — it needs a Node
runtime and a database. What it does not need is a specific host: the container
runs anywhere, for the same reason the payment layer is not tied to one
provider.

## What must be true before Yavaya is public

Read this section before deploying, not after.

**Registration is not ready to open to the public.** Email delivery is
unconfigured, so a new member receives no verification code and cannot activate
their account. Deploy behind a private URL, or with registration closed, until
`EMAIL_PROVIDER` is real. This is the single hard blocker.

**Generate fresh secrets.** Never reuse a development value.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`SIGNAL_PEPPER` is effectively permanent: rotating it orphans every stored
anti-duplication signal and resets duplicate detection. Decide it once.

**Set the trusted proxy count.** `clientAddressFromHeaders` defaults to 1
proxy. If your platform puts a different number of hops in front of the app,
set it accordingly — too high and a client can spoof its own address and defeat
rate limiting.

**Schedule the background jobs.** All are idempotent and safe to re-run:

| Job | Function | Suggested cadence |
| --- | --- | --- |
| Graduate monitored accounts | `graduateMonitoredAccounts` | every 15 min |
| Expire demo content | `expireDueDemoContent` | hourly |
| Purge expired sessions | `purgeExpiredSessions` | daily |
| Purge expired rate limits | `purgeExpiredRateLimits` | hourly |
| Verify the audit chain | `verifyAuditChain` | daily, alert on failure |

A hash chain nobody checks proves nothing. Wire the last one to an alert.

## Environment

Required:

```
NODE_ENV=production
APP_ENV=production
APP_URL=https://your-domain
DATABASE_URL=postgres://…            # managed Postgres 16+, TLS enforced
SESSION_SECRET=…                     # 48 random bytes
SIGNAL_PEPPER=…                      # 48 random bytes, permanent
PRIMARY_ADMIN_EMAIL=Junoagattis@gmail.com
PREVIEW_ACCESS_KEY=…                 # while the site is a private preview
```

Everything else is optional and defaults to `unconfigured`, which makes the
capability report itself unavailable rather than failing at the point of use.
See [`CONFIGURATION.md`](CONFIGURATION.md).

## Release procedure

Migrations run as a **release step**, before the new instances start — never on
boot. Two instances starting at once must not race through the same migration.

The production image contains no TypeScript and no dev dependencies, so the
scripts are pre-bundled to self-contained CommonJS at build time. A release
command shelling out to `tsx` would work locally and fail on the first real
deploy.

```bash
node dist/scripts/migrate.cjs    # release step, in the image
node dist/scripts/seed.cjs       # idempotent; safe on every release
```

Locally the TypeScript entry points are equivalent: `npm run db:migrate` and
`npm run db:seed`.

Both bundled scripts have been verified against a fresh, empty database and
re-run for idempotency.

`db:seed` is safe to run on every deploy: it upserts reference data, never
overwrites a tuned reputation weight, and never creates a login.

## Container

```bash
docker build -t yavaya .
docker run -p 3000:3000 --env-file .env.production yavaya
```

The image is multi-stage, runs as a non-root user, contains no build toolchain
or dev dependencies, and declares a `HEALTHCHECK` against `/api/health`.

> The Dockerfile has **not** been built and run end to end — no Docker daemon
> was available in the environment where it was written. The standalone server
> it launches (`node server.js` against `.next/standalone`) *has* been verified
> in production mode: all routes render, the CSP is applied, and the health
> endpoint correctly returns `ok` with the database up and `503 degraded` with
> it down. Expect the Dockerfile to need at most minor adjustment on first
> build.

## Health check

`GET /api/health` returns `200 {"status":"ok"}` only when the database answers,
and `503 {"status":"degraded"}` otherwise — so a process that is running but
cannot reach Postgres is taken out of rotation instead of serving errors. It
exposes no version, hostname, or configuration: it is unauthenticated by
necessity and must not become a reconnaissance tool.

Point the platform's probe at it.

## Private preview

While email delivery is unconfigured, a stranger who registers receives no
verification code and is stranded. Setting `PREVIEW_ACCESS_KEY` closes the site
to everyone without the key:

- every route except `/api/health` returns **404** without it — 404 rather than
  401, because a preview that announces itself invites attention;
- the platform's health probe still works, so the deploy can go green;
- `https://your-app/?key=…` once sets an `httpOnly`, `Secure` cookie and strips
  the key from the URL, so it does not linger in history or a screenshot;
- responses carry `X-Robots-Tag: noindex, nofollow`.

It is a **curtain, not a security boundary**. It keeps the unfinished product
away from the public; it is not what protects member data. The session and
permission system does that, and it applies underneath the curtain exactly as
it will in production.

Remove the secret to open the site: `fly secrets unset PREVIEW_ACCESS_KEY`.

## Deploying to Fly.io

`fly.toml` is committed and configured for `mia` (Miami) — the closest common
Fly region to Central America. Latency is a product decision here, not an
infrastructure detail.

```bash
# 1. Authenticate (your account, your credentials)
fly auth login

# 2. Claim an app name. --no-deploy because secrets are not set yet.
fly launch --no-deploy --copy-config --name yavaya

# 3. Managed Postgres, attached as DATABASE_URL
fly postgres create --name yavaya-db --region mia
fly postgres attach yavaya-db

# 4. Secrets. Generate each value fresh — never reuse a development one.
fly secrets set \
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  SIGNAL_PEPPER="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" \
  PREVIEW_ACCESS_KEY="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")" \
  PRIMARY_ADMIN_EMAIL="Junoagattis@gmail.com" \
  APP_URL="https://yavaya.fly.dev"

# 5. Deploy. The release command migrates and seeds before traffic shifts.
fly deploy
```

Then read the preview key back with `fly secrets list` — Fly shows only a
digest, so keep the value from step 4, or set it to something you choose.

Visit `https://yavaya.fly.dev/?key=<preview key>` once per device.

`SIGNAL_PEPPER` is effectively permanent: rotating it orphans every stored
anti-duplication signal. Decide it once, and keep a copy somewhere durable.

### Deploying from CI instead

`.github/workflows/deploy.yml` runs the same deploy from GitHub Actions:
typecheck, tests against a real Postgres, build, then `flyctl deploy
--remote-only`. It is `workflow_dispatch` only — a deploy to a live database
should be a decision, not a side effect of pushing.

It needs one repository secret, `FLY_API_TOKEN`, added under
**Settings → Secrets and variables → Actions**.

Note what a deploy token *cannot* do: it is scoped to an existing app, so the
one-time provisioning below (`fly launch`, `fly postgres create`) must still be
run once from a machine with `fly auth login`. After that, every deploy can go
through CI.

### After it is up

```bash
fly logs                       # watch the release command run migrations
fly status                     # health check should be passing
fly ssh console -C "node dist/scripts/seed.cjs"   # re-run after registering the admin
```

## Other platforms

**Railway / Render** — connect the repository, they detect the Dockerfile.
Add a managed Postgres, set the environment variables, and configure the
release command as `npm run db:migrate`.

**Google Cloud Run** — build with Cloud Build, push to Artifact Registry,
deploy with Cloud SQL (Postgres) attached. Run migrations as a Cloud Run job
before shifting traffic. Set minimum instances to 1 to avoid cold starts on a
session-backed app.

**Vercel** — works, but note that Vercel runs serverless functions rather than
the container, so the Dockerfile is unused there. Bring a managed Postgres with
connection pooling (the `DATABASE_POOL_MAX` default of 10 is sized for a
long-lived server, not for many short-lived function instances — lower it, and
use a pooler).

**Plain VPS** — the container plus a reverse proxy terminating TLS. Set the
trusted proxy count to match.

## After the first deploy

1. Register the administrator account through the normal flow with
   `PRIMARY_ADMIN_EMAIL`.
2. Re-run `npm run db:seed` to grant it the `admin` role server-side.
3. Visit `/status` and confirm the capability register matches reality in the
   deployed environment.
4. Confirm the CSP is present and that no console CSP violations appear.
5. Confirm `/api/health` is green and wired to the platform probe.
