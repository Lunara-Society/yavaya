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

Set these three on the web service:

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

**Set the proxy topology.** `TRUSTED_PROXY_COUNT` defaults to 1, which is right
for a platform edge alone — including Railway behind plain registrar DNS. **A
proxying CDN in front of that edge is two hops, not one** — leave it at 1 there
and every visitor collapses into a single rate-limit bucket. See
[`CONFIGURATION.md`](CONFIGURATION.md#proxy-topology--trusted_proxy_count-client_ip_header).

**Schedule the background jobs.** All are idempotent and safe to re-run, so a
missed tick costs nothing and an overlapping one is harmless:

| Job | Command | Suggested cadence |
| --- | --- | --- |
| Graduate monitored accounts | `jobs.cjs graduate-monitored` | every 15 min |
| Expire demo content | `jobs.cjs expire-demo` | hourly |
| Purge expired sessions | `jobs.cjs purge-sessions` | daily |
| Purge expired rate limits | `jobs.cjs purge-rate-limits` | hourly |
| Verify the audit chain | `jobs.cjs verify-audit-chain` | daily, alert on failure |
| Deliver words prepared ahead | `jobs.cjs deliver-words` | every 15 min |
| Adoption follow-ups (30 days) | `jobs.cjs adoption-follow-ups` | hourly |
| Daily email summary | `jobs.cjs send-digests` | every 15 min (each member gets at most one a day) |

**Hosts with a single cron per service (Railway):** schedule `jobs.cjs tick`
every 15 minutes instead. It runs every job above in turn, each even if an
earlier one failed, and checks the audit chain in the first tick after 09:00
UTC. On Railway this is the `yavaya-scheduler` service: same repository and
Dockerfile as the web service, start command `node dist/scripts/jobs.cjs
tick`, cron `*/15 * * * *`, restart policy never, and its variables as
references to the web service's (`${{yavaya-web.DATABASE_URL}}` and so on), so
no secret is copied by hand. Without `SESSION_SECRET` and the email variables
the tick still runs; the summary simply waits.

Locally: `npm run jobs -- <job>`. In production: `node dist/scripts/jobs.cjs
<job>`, bundled to self-contained CommonJS for the same reason the migration
and seed scripts are — a scheduler runs a bare shell with no TypeScript.

`verify-audit-chain` **exits non-zero when the chain is broken**, so a scheduler
that mails on failure is the alert. A hash chain nobody checks proves nothing,
and a check whose result goes nowhere is a chain nobody checks.

These commands need `DATABASE_URL` and nothing else. They deliberately do not
require `SESSION_SECRET` or `SIGNAL_PEPPER`: a scheduler that does not inherit
the application's environment would otherwise force those secrets into a
crontab line in plaintext.

## Environment

Required:

```
NODE_ENV=production
APP_ENV=production
APP_URL=https://your-domain
DATABASE_URL=postgres://…            # managed Postgres 16+, TLS enforced
SESSION_SECRET=…                     # 48 random bytes
SIGNAL_PEPPER=…                      # 48 random bytes, permanent
PRIMARY_ADMIN_EMAIL=yavayago@gmail.com
PREVIEW_ACCESS_KEY=…                 # while the site is a private preview
TRUSTED_PROXY_COUNT=1                # 1 for a platform edge alone; 2 behind a proxying CDN
CLIENT_IP_HEADER=forwarded           # cf-connecting-ip only when Cloudflare proxies the traffic
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

The image is **verified in CI** on every change to the Dockerfile,
dependencies, build config or release scripts
(`.github/workflows/docker.yml`). That run does not just build it — it:

1. runs the bundled `migrate.cjs` and `seed.cjs` *from inside the image*
   against a real Postgres, which is exactly what the platform's pre-deploy
   step executes;
2. starts the container and waits for `/api/health` to return `ok`, which only
   happens once the database actually answers;
3. checks every page renders and the CSP header is present.

This caught a real failure on its first run: the runtime stage copied
`/app/public`, which does not exist because the project has no static assets
yet. That would have failed identically on a platform's first deploy.

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

Remove the variable from the service and redeploy to open the site.

## Deploying to Spaceship (target architecture)

Yavaya runs directly on Spaceship Pro Web Hosting through its supported Node.js
application environment — CloudLinux with Passenger, fronted by LiteSpeed. Not a
container, not a hand-maintained daemon, and not a VPS.

PostgreSQL stays external and unchanged. Shared hosting offers MySQL only, and
the database is load-bearing: 24 native enums, a PL/pgSQL immutability guard,
four append-only triggers and a transactional advisory lock that serialises the
audit chain. None of that survives a port to MySQL, and none of it is negotiable.

### Verify these before committing to the host

Two facts decide whether this works at all, and neither can be established from
outside the account. Check both over SSH first:

1. **Outbound TCP to PostgreSQL on 5432.** Shared hosts routinely block outbound
   traffic on non-web ports. If this is blocked, the architecture cannot work
   here and no code change rescues it.
   `nc -zv <db-host> 5432`
2. **Node.js 22 in the Setup Node.js App selector.** The project declares
   `"node": ">=22"` and the release scripts target `node22`.

Outbound SMTP (465/587) matters too, but only gates public registration rather
than the deployment itself.

### Build off-host

`next build` is memory-hungry and will likely exceed a CloudLinux LVE limit.
Build locally or in CI on x64 Linux, then upload the result:

```bash
npm ci
npm run build:deploy       # builds, then assembles ./deploy
```

`./deploy` is the complete application root: the traced server bundle, its
pruned `node_modules`, static assets, migrations and the release scripts. It
carries a **trimmed `package.json`** that declares no dependencies, because the
build already vendored them — so pressing **Run NPM Install** in the cPanel
panel cannot drag an entire build toolchain onto a memory-limited host.

```bash
rsync -az --delete deploy/ <user>@yavaya.lat:/home/<user>/yavaya/
```

### Setup Node.js App

| Field | Value |
| --- | --- |
| Node.js version | 22.x |
| Application mode | Production |
| Application root | `/home/<user>/yavaya` |
| Application URL | `app.yavaya.lat` to stage, `yavaya.lat` at cutover |
| Application startup file | `server.js` |

Passenger replaces `listen()` so the application is bound to a socket it owns;
`PORT` and `HOSTNAME` are read and then discarded. Nothing needs configuring for
this, and it has been verified against the assembled artifact.

### Environment

Everything in [Environment](#environment) above, with two values that differ
here:

```
DATABASE_POOL_MAX=3
TRUSTED_PROXY_COUNT=1
```

`DATABASE_POOL_MAX` is **per process**, and Passenger spawns workers on demand.
The default of 10 is sized for one long-lived server; left alone it multiplies
into far more connections than an external database will accept, and the failure
arrives under load looking like an unrelated outage.

`TRUSTED_PROXY_COUNT=1` is correct while LiteSpeed is the only hop. Put a
proxying CDN in front and it must become `2`, or `CLIENT_IP_HEADER` must become
`cf-connecting-ip` — otherwise every visitor collapses into one rate-limit
bucket.

### Release

Migrations run before the new code takes traffic, never on boot:

```bash
cd /home/<user>/yavaya
export DATABASE_URL='postgres://…'
node dist/scripts/migrate.cjs
node dist/scripts/seed.cjs
mkdir -p tmp && touch tmp/restart.txt     # Passenger picks up the new code
```

`touch tmp/restart.txt` drops in-flight requests. It is brief, but it rules out
releasing into live traffic.

### Cron

```
*/15 * * * *  cd ~/yavaya && node dist/scripts/jobs.cjs graduate-monitored
0    * * * *  cd ~/yavaya && node dist/scripts/jobs.cjs expire-demo
0    * * * *  cd ~/yavaya && node dist/scripts/jobs.cjs purge-rate-limits
30   3 * * *  cd ~/yavaya && node dist/scripts/jobs.cjs purge-sessions
0    4 * * *  cd ~/yavaya && node dist/scripts/jobs.cjs verify-audit-chain
*/5  * * * *  curl -fsS https://yavaya.lat/api/health >/dev/null
```

The last line is a keep-warm. Passenger stops idle applications, and the next
visitor pays the cold start — measured at 1.6s on fast hardware with a warm
cache, so expect several seconds on shared hosting.

### DNS

**No change required.** `yavaya.lat` already resolves to Spaceship, and `www` is
a CNAME to the apex. To stage first, add one record: `A app → 66.29.148.153`.

### What shared hosting costs

- **Cold starts** after idle, mitigated but not removed by the keep-warm ping.
- **No zero-downtime deploys.** A Passenger restart drops in-flight requests.
- **No control over worker count.** This is why the connection pool must be
  small and why nothing may live in process memory — both of which the
  application already respects: there are no timers, no module-level mutable
  state beyond two self-healing caches, and no filesystem writes.
- **CPU and memory ceilings** enforced per account. Roughly 128 MB resident per
  idle worker leaves headroom, but server-rendering every page against the
  database is the workload most likely to meet a CPU quota.
- **Database latency is paid on every request**, because every page is rendered
  on the server against the database. Co-locate the database with the host if
  you can.
- **No horizontal scaling.** The ceiling is one account on one machine.

## Deploying to Railway

Railway hosts both the app and the database in one project, which keeps the
app-to-database hop on the internal network and inside one region.

### Provisioned

| | |
| --- | --- |
| Project | `yavaya` |
| Region | `iad` (US East) — both services, deliberately colocated |
| Database | Postgres (`ghcr.io/railwayapp-templates/postgres-ssl:18`) with a persistent volume at `/var/lib/postgresql/data` |
| Web service | `yavaya-web`, built from the repository `Dockerfile` |
| Domain | `yavaya-web-production.up.railway.app` |

**Region is a product decision, not an infrastructure detail.** The database
first provisioned in `ams` (Amsterdam); both services were moved to `iad`
before any data existed. Yavaya renders every page on the server with database
queries, so a transatlantic hop would have been paid on every request, by users
on exactly the connections this product is built for.

### Service configuration

- **Build:** `dockerfilePath = Dockerfile`. Railway's default builder (Railpack)
  would run `next start`, which does not work with `output: standalone` — the
  output this repository produces everywhere except Vercel. The Dockerfile is
  the tested path.
- **Pre-deploy:** `node dist/scripts/release.cjs`, which migrates and then
  seeds. Railway runs this before new containers take traffic, which is
  exactly the release-step semantics migrations need — never on boot, where
  two starting containers could race. It is one script because Railway runs
  the pre-deploy command **without a shell**: the earlier
  `migrate.cjs && seed.cjs` passed `&& …` to the migration as ignored
  arguments, so the seed never ran and every registration failed on a missing
  `member` role while the health check stayed green.
- **Root directory:** `/platform`, watch pattern `/platform/**`, so changes to
  the static site alone do not redeploy the platform. These settings live on
  the Railway service (Railway has deprecated `railway.toml`).
- **Healthcheck:** `/api/health`, 120s timeout. It returns 200 only when the
  database answers, so a container that cannot reach Postgres never takes
  traffic. The path is exempt from the preview gate for this reason.
- **Restart policy:** `ON_FAILURE`, 3 retries.
- **`DATABASE_URL`** is a Railway reference to the Postgres service, so it
  follows the database rather than being a copied secret. It resolves to the
  private network address: no public exposure, no egress cost.

Because that connection is direct Postgres (port 5432, no pooler), prepared
statements stay enabled — `usesTransactionPooler` detects this automatically.
That is the opposite of the Supabase-on-Vercel case, and the reason the
detection exists rather than a hard-coded flag.

### The one manual step: repository access

Railway builds from GitHub, and `Lunara-Society/YavayaGo` is **private**, so
Railway's GitHub App has to be granted access to it. Until then the service
exists and is fully configured but never builds — `list-deployments` returns
an empty array, and asking Railway to deploy answers:

```
No GitHub installation found for repo: Lunara-Society/YavayaGo
```

There is no way around this from the Railway side. A redeploy cannot produce a
first deployment, and the alternative — letting Railway create a service from
the repository — hits the same missing installation.

`Lunara-Society` is a personal account rather than an organization, so no
admin approval is involved:

*GitHub → Settings → Applications → Installed GitHub Apps → Railway →
Repository access → add `YavayaGo`* (or install it from
`github.com/apps/railway-app`).

The repository's default branch is already the branch being deployed, so
nothing else needs pointing at it.

### Then

1. Railway builds automatically once access is granted; otherwise redeploy the
   `yavaya-web` service.
2. Watch the pre-deploy step apply the migrations and the seed.
3. Check `https://yavaya-web-production.up.railway.app/api/health` →
   `{"status":"ok"}`. A `503 degraded` means the app is up but cannot reach the
   database.
4. Reach the site with the preview key once per device:
   `https://yavaya-web-production.up.railway.app/?key=<PREVIEW_ACCESS_KEY>`.
5. Register with `PRIMARY_ADMIN_EMAIL`, then grant the role — the seed never
   creates a login:

```sql
INSERT INTO user_roles (user_id, role_key, scope)
SELECT id, 'admin', 'global' FROM users WHERE email = 'yavayago@gmail.com'
ON CONFLICT DO NOTHING;
UPDATE users SET status = 'active', trust_state = 'trusted'
WHERE email = 'yavayago@gmail.com';
```

### The domain: yavaya.lat

Registered at **Spaceship**, which is a registrar with plain authoritative DNS
— no proxy, no CDN. So there is exactly one hop in front of the application
(Railway's edge), and `TRUSTED_PROXY_COUNT=1` with `CLIENT_IP_HEADER=forwarded`
is correct. Both are set on the service.

**DNS.** One record, at the apex:

| Type | Host | Value |
| --- | --- | --- |
| CNAME | `@` | the target Railway shows for the custom domain |

Copy the target from Railway → `yavaya-web` → Settings → Networking. It is
per-service and randomly assigned — it is **not** derivable from the service
name, and anything of the form `<service>-<environment>.cname.railway.app` is
a guess, not the value.

A CNAME at the apex is not legal DNS on its own. Spaceship supports it the way
most modern registrars do, by flattening; if their interface refuses `@` for a
CNAME, use an ALIAS/ANAME record instead, or move the site to
`www.yavaya.lat` and redirect the apex.

**If Cloudflare is ever put in front** — as a CDN or for DDoS protection —
then there are two hops, and `TRUSTED_PROXY_COUNT` must become `2` (or
`CLIENT_IP_HEADER=cf-connecting-ip`, which does not depend on counting hops).
Left at `1`, every visitor collapses into a single rate-limit bucket. Also set
SSL/TLS to **Full (strict)** there: `Flexible` terminates TLS at Cloudflare and
speaks plain HTTP to the origin, silently undoing HSTS and the `secure` cookie
flag.

**`www`.** Railway's free plan allows one custom domain per service, so `www`
is not attached. Redirect it at the registrar, or leave it unused — one
canonical hostname means one set of cookies.

`APP_URL=https://yavaya.lat` is set on the service. It is what absolute links
and the session cookie domain derive from.

### Note on Postgres versions

Railway's template deploys Postgres **18**; the test suite runs against 16
locally and in CI. Nothing in the schema depends on the difference, and the
pre-deploy migration is the same code path verified against an empty database
— but the gap is worth closing when convenient.

## Other platforms

**Render** — connect the repository; it detects the Dockerfile. Add a managed
Postgres, set the environment variables, and configure the pre-deploy command
as `node dist/scripts/release.cjs`. Not
`npm run db:migrate`: that entry point is TypeScript, and the production image
contains neither TypeScript nor `tsx`.

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
