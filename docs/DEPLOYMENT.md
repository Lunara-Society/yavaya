# Deployment

Yavaya is a server-rendered application with a PostgreSQL database, server
actions and sessions. It cannot be published as static files — it needs a Node
runtime and a database. What it does not need is a specific host: the container
runs anywhere, for the same reason the payment layer is not tied to one
provider.

## What must be true before Yavaya is public

Read this section before deploying, not after.

**Registration cannot open to the public until email is configured.** The SMTP
adapter is implemented and tested against a real mail server; what is missing
is credentials. Until `EMAIL_PROVIDER=smtp`, `SMTP_URL` and `EMAIL_FROM` are
set, a new member receives no verification code and cannot activate their
account.

Deploy behind `PREVIEW_ACCESS_KEY` until then. Adding the three variables is
all that stands between the preview and a public launch:

Set these three in Vercel's environment variables:

```
EMAIL_PROVIDER  smtp
SMTP_URL        smtps://user:pass@smtp.example.com:465
EMAIL_FROM      Yavaya <no-reply@your-domain>
```

`/status` will then report email delivery as `REAL`.

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

Delete the variable in Vercel and redeploy to open the site.

## Deploying to Vercel + Supabase

The database is already provisioned, migrated, seeded and hardened. What
remains is connecting Vercel to it.

### 1. Supabase (done)

Project `yavaya`, region `us-east-1` — the closest Supabase region to Central
America. Schema, reference data and security hardening are applied and
verified against the reference database: 41 tables, 339 columns, 110 indexes,
44 foreign keys, 257 checks, 4 append-only triggers, 24 enums, 170 locations,
34 permissions, 54 role grants, treasury 50,000.

**The auto-exposed data API is closed.** See
`drizzle/0002_data_api_lockdown.sql` — this is the single most important thing
to preserve on any managed-Postgres platform.

Get the connection string from **Supabase → Project Settings → Database**. Use
the **transaction pooler** (port 6543) for Vercel: serverless invocations are
many short-lived processes, and a direct connection per invocation exhausts
Postgres. `DATABASE_TRANSACTION_POOLER` is detected from that port
automatically, which is what disables prepared statements.

If the password is not shown, reset it there — it is only displayed once.

### 2. Connect GitHub to Vercel

Vercel needs a GitHub login connection before it can link a repository. One
click: **Vercel → Settings → Login Connections → GitHub**.

### 3. Import the repository

**Vercel → Add New → Project → Lunara-Society/YavayaGo**. Framework detection
finds Next.js; no build settings need changing. Set the production branch to
the branch you are shipping.

### 4. Environment variables

**Vercel → Project → Settings → Environment Variables**:

```
DATABASE_URL      postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres
DATABASE_POOL_MAX 1
NODE_ENV          production
APP_ENV           production
APP_URL           https://<your-vercel-domain>
SESSION_SECRET    <48 random bytes>
SIGNAL_PEPPER     <48 random bytes, permanent>
PREVIEW_ACCESS_KEY <while the site is a private preview>
PRIMARY_ADMIN_EMAIL Junoagattis@gmail.com
```

`DATABASE_POOL_MAX=1` matters: the pool is per-process, and on serverless every
concurrent invocation is its own process.

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 5. Deploy, then become the administrator

Deploy from the Vercel dashboard. Then register through the normal flow with
`PRIMARY_ADMIN_EMAIL` and grant the role — the seed never creates a login:

```sql
-- Supabase SQL editor, after registering
INSERT INTO user_roles (user_id, role_key, scope)
SELECT id, 'admin', 'global' FROM users WHERE email = 'junoagattis@gmail.com'
ON CONFLICT DO NOTHING;
UPDATE users SET status = 'active', trust_state = 'trusted'
WHERE email = 'junoagattis@gmail.com';
```

Registering with that address confers no authority on its own; there is a test
that proves it.

### 6. Confirm

- `/api/health` returns `{"status":"ok"}` — if it returns `degraded`, the
  database is unreachable and `DATABASE_URL` is wrong.
- `/status` reports the capability register from the deployed environment.
- The CSP header is present, and no CSP violations appear in the console.

### Migrations from now on

Vercel has no release-command step, so migrations do not belong in the build —
parallel builds would race. Run them deliberately, either through the Supabase
SQL editor or with the bundled script against the **direct** connection (port
5432, not the pooler — DDL should not go through a transaction pooler):

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@db.<ref>.supabase.co:5432/postgres" \
  node dist/scripts/migrate.cjs
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
