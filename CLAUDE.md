# Working in this repository

Yavaya only. Do not reference, import, integrate, imitate or reuse branding,
architecture, terminology, assets, documentation or identity from any other
project. Yavaya is an independent product and codebase.

## Read first

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — domains and invariants
- [`docs/SECURITY.md`](docs/SECURITY.md) — the security model, including its gaps
- [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) — what is unconfigured and why

## Commands

```bash
npm run dev
npm run typecheck
npm test                # needs Postgres; migrates and seeds the test DB itself
npm run build
npm run db:generate     # after changing src/server/db/schema/*
npm run db:migrate
npm run db:seed         # idempotent
```

## Rules that are not negotiable

**Never claim something works when it does not.** No mocked integration
presented as real, no fake payment success, no fake live tracking, no fake
statistics, no fake users, no fake reviews, and never a mock silently
substituted for a production service.

Every capability declares a state in `src/config/capabilities.ts`: `REAL`,
`DEMO`, `MOCK`, or `REQUIRES_CONFIGURATION`. `/status` renders the register
directly, and anything not `REAL` must say what would have to change. Marking
something `REAL` without the implementation to match is the single change this
file exists to prevent.

When a capability is not `REAL`, the control that would use it is **absent or
clearly labelled** — never a button that looks live and leads nowhere. The
token purchase flow is the reference example.

**Never invent a business rule.** If the specification defines it, implement it
exactly. If it does not, build the abstraction and flag it in
`CONFIGURATION.md` rather than guessing.

**No hard-coded user-facing strings.** Every one is an i18n key in
`src/i18n/dictionaries/`. Spanish is the reference locale; the `Dictionary`
type makes a missing English key a compile error, and a test checks that
interpolation placeholders match across locales.

**No hard-coded geography.** Countries and cities are rows. Nothing compares a
place by name.

**No hard-coded business numbers.** They live in `config/business-rules.ts` and
are mirrored into `system_settings`, so operations can retune without a deploy.

**Authorization is server-side, always.** `requirePermission` before every
privileged operation. Never infer authority from an email address, a client
value, or the absence of a rendered button.

**Money and reputation move only through their services.** Never write to
`token_accounts`, `token_ledger`, `reputation_scores` or `audit_events`
directly. The database will refuse most of it anyway.

**Audit inside the transaction.** An action and its audit record commit
together or not at all.

**Demo content is registered, marked, excluded from statistics, barred from
notifications, and expires.** Real feeds show only real events.

## Conventions

Domain services take an `Executor` (a database or a transaction) as their first
argument, so callers can compose several operations into one transaction.
Mutating functions take a transaction.

Idempotency keys identify *the thing that happened* (an order id, a payment id),
not the moment of calling — so retries are harmless.

Errors are `DomainError` with an i18n key and a code. Mark an error
non-exposable when its detail would help an abuser.

Comments explain *why*, especially where a choice looks odd. There are several
places here where the obvious implementation is wrong (see the two forms of an
email address, or why network matches are downgraded) and the comment is the
only thing preventing a well-meaning "simplification".

## Adding a district

1. Register it in `src/config/districts.ts` with a distinct layout archetype.
2. Add its name and tagline keys to both dictionaries.
3. Add its accent tokens to `globals.css`.
4. Declare any billable actions in the seed — publishing costs are explicit,
   and free things stay free (community support, causes, animal welfare).
5. Build the district's own layout. Do not clone another district's grid.
6. Flip `status` to `available` **only when it actually works**, and enable it
   in the `districts` table.
