# Yavaya

Digital infrastructure for Central America.

One identity → one YAY ID → one reputation → multiple districts → shared trust
infrastructure.

Yavaya is not a marketplace with extra pages bolted on. It is one platform:
a person registers once, earns one reputation, and carries it across every
district — services, commerce, delivery, professional work, community support,
fundraising, animal welfare and entertainment.

---

## Honesty states

Every capability in Yavaya declares one of four states, and the interface
renders it. This is a mechanism, not a promise: `/status` reads the register
directly, and a test requires anything not `REAL` to explain itself.

| State | Meaning |
| --- | --- |
| `REAL` | Implemented, wired to production infrastructure, working now |
| `DEMO` | Sample content — marked, excluded from every statistic, expires |
| `MOCK` | A stand-in with no real behaviour. Never in a flow that implies it works |
| `REQUIRES_CONFIGURATION` | Implemented, but inert until credentials, a provider, or a regulatory decision arrives |

There are currently **no MOCK capabilities**, and a test keeps it that way
unless someone changes it deliberately.

## What exists right now

This repository contains **Phase 0: the platform foundation**, complete and
tested, plus the global controls, member area, and the design system and shell
the districts will be built into.

Built and covered by tests:

| Subsystem | What it does |
| --- | --- |
| Identity | Registration, permanent 8-digit YAY ID, verification challenges |
| Authentication | scrypt passwords, hashed session tokens, rotation, revocation |
| Authorization | Server-side roles and permissions; admin granted by backend bootstrap |
| Geography | Region → country → state → city → town → village → neighborhood, as data |
| Anti-duplication | Layered signals, weighted risk score, human review — never a single-signal ban |
| New-user monitoring | 72-hour enhanced monitoring window with graduation |
| Audit | Append-only, hash-chained, database-enforced immutability |
| Tokens | Atomic exactly-once ledger, treasury, starter grants, reward caps |
| Reputation | Configurable rules, idempotent events, cooldowns, daily caps |
| Trust Shield | Derived public summary with a hard privacy boundary |
| Rate limiting | Server-side counters per bucket and subject |
| Content-Security-Policy | Per-request nonce; no `unsafe-inline` for scripts |
| Email delivery | SMTP adapter, wired into registration — needs credentials only |
| Payments | Provider-agnostic interface (**no working integration yet**) |
| Language | Spanish/English, auto-detected from the device, overridable and remembered |
| Appearance | Light / dark / system, resolved server-side so there is no flash |
| Member area | Trust Shield, token balance and history, shortcuts — all real data |
| Settings | Language, appearance, notification preferences, location privacy |

**Not built yet**, and the interface says so rather than pretending otherwise:
the eight district experiences, moderation workflows (schema exists), the
driver network, Works subscriptions, the Tavern, and any payment integration.

Visit `/status` in the running app for the live version of this table,
including which external integrations are configured.

**Database is live.** A Supabase project (`yavaya`, us-east-1) is provisioned,
migrated, seeded and hardened — its auto-exposed data API is closed in two
layers. The web app still needs to be connected to it on Vercel; see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Running it

Requires Node 22+ and PostgreSQL 16+.

```bash
npm install
cp .env.example .env          # then fill in the two secrets
npm run db:migrate
npm run db:seed
npm run dev
```

Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Checks

```bash
npm run typecheck
npm test          # 118 tests; integration tests need a Postgres at DATABASE_URL
npm run build
```

The integration tests use a separate database (`yavaya_test` by default,
override with `TEST_DATABASE_URL`). They migrate and seed it automatically.

### Becoming the administrator

The seed never creates a login. Register through the normal flow with the
address in `PRIMARY_ADMIN_EMAIL`, then re-run `npm run db:seed` — it grants the
`admin` role server-side. Registering with that address confers no authority on
its own; there is a test that proves it.

---

## Layout

```
src/
  config/          Business rules, capability register, districts, preferences, env
  i18n/            Spanish (default) and English dictionaries, key-complete
  server/
    db/            Schema by domain, migrations, seed
    domains/       identity, geography, access, audit, tokens, reputation,
                   trust, moderation, notifications, payments, platform
    security/      crypto, network signals, rate limiting
    auth/          sessions, cookies, request context
  ui/              Design system components and the app shell
  app/             Next.js App Router
docs/              Architecture, security, configuration, roadmap, design
drizzle/           Generated SQL migrations
tests/             Unit and integration tests
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — domains, invariants, key decisions
- [`docs/SECURITY.md`](docs/SECURITY.md) — the security model and what it refuses to do
- [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) — every integration point that needs credentials or a decision
- [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) — shared foundation, eight district worlds
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — how to run it in production, and what must be true first
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what each phase delivers
- [`CLAUDE.md`](CLAUDE.md) — conventions for anyone (human or agent) working in this repository
