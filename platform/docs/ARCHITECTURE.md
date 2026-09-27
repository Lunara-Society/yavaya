# Yavaya architecture

## The shape of the system

Yavaya is one platform with one identity system and many districts. Everything
in this document exists to protect that sentence.

```
                       ┌──────────────────────────────┐
                       │        Shared platform        │
                       │                               │
   Identity ─ YAY ID ─ │  reputation · Trust Shield ·  │
                       │  tokens · audit · geography · │
                       │  moderation · notifications   │
                       └───────────────┬───────────────┘
                                       │
   ┌──────────┬──────────┬─────────────┼───────────┬──────────┬─────────┐
Services  Mercadito   YavayaGo      Works     Community   Impact  Animals  Tavern
```

A district owns its own experience — layout, information hierarchy,
atmosphere, interaction patterns. It never owns identity, reputation, trust or
money. Those are platform concerns, and a district reaches them through a
domain service, never by reaching into another domain's tables.

## Domain boundaries

| Domain | Owns | Never does |
| --- | --- | --- |
| `identity` | users, YAY IDs, verification, devices, signals, risk | authorise anything |
| `geography` | the location tree, privacy-preserving coordinates | hard-code a place |
| `access` | roles, permissions, grants, rate limits | infer authority from a client |
| `audit` | the append-only hash chain | store secrets or raw addresses |
| `tokens` | accounts, the ledger, billable actions, treasury | change a balance without a ledger entry |
| `reputation` | scores, rules, events | apply a weight that isn't configured |
| `trust` | the public Trust Shield | expose anything sensitive |
| `moderation` | reports, tickets, enforcement | leak reporter identity |
| `notifications` | preferences, notifications, live activity | emit an event for demo content |
| `payments` | transactions, provider adapters, webhooks | trust a browser |
| `platform` | settings, flags, districts, demo register | hide what is or isn't built |

## The invariants

These are enforced in code *and*, wherever possible, in the database — so a
future bug, a careless migration, or a compromised service account cannot
quietly break them.

**One person, one account** is defended in layers: email verification, phone
verification, device signals, network signals, behavioural signals, rate
limits, and a weighted risk score. No single signal can restrict an account —
the heaviest individual weight is deliberately below the blocking threshold,
and there is a test asserting it. Networks known to be shared (mobile carrier
CGNAT, universities, cafés) are downgraded to near-noise, because families,
businesses and public Wi-Fi legitimately collide.

**A high risk score never bans at registration.** It restricts what the account
can do and opens a human review case. An automated permanent decision here
would be wrong more often than right.

**A YAY ID is permanent and never re-issued.** `yay_id_registry` retains every
identifier ever allocated, including for removed accounts. The internal primary
key is a UUID; the YAY ID is a public label and is never a join key.

**Tokens only move with the ledger.** `applyEntry` locks the account row, then
checks idempotency, then writes both the balance and an immutable ledger entry
in one transaction. A failed action rolls the charge back with it. Database
constraints reject a negative balance, a charge that credits, and any UPDATE or
DELETE on the ledger. Administrative grants move tokens *out of the treasury*
rather than conjuring them, so total supply stays reconcilable.

**Audit records are evidence.** Append-only by trigger, hash-chained by content.
A test disables the trigger the way a compromised superuser would, alters a
record, and confirms the chain still detects it.

**Payments reach `succeeded` only through server-side verification.** There is
no code path from a browser callback to a credited balance. Webhooks are stored
before processing and deduplicated by provider event id.

**Nothing is fake.** Demo content is registered, marked, excluded from every
statistic, barred from generating activity events, and expires automatically.
Live activity shows only real events. A district that is not built is not a
link.

## Key decisions

**Next.js App Router, TypeScript, PostgreSQL, Drizzle.** One language across
the stack keeps the domain model honest between server and client. Drizzle
generates SQL migrations that are readable and reviewable — important when the
schema is the thing enforcing your trust guarantees. Postgres gives triggers,
constraints, row locks and advisory locks, all of which this design uses.

**scrypt from `node:crypto` for passwords, not argon2.** Argon2id is
marginally preferable cryptographically, but it needs a native build. A
zero-native-dependency install matters more here: it keeps deployment simple
across whatever infrastructure each country's operations ends up on. Parameters
are versioned in the hash string and upgraded transparently at login.

**Signals are stored as keyed hashes, never raw.** Email, phone, device
fingerprint and network prefix are compared for equality but never read back,
so they are HMACs under a server-held pepper. A database leak reveals no
personal data and the values are not brute-forceable without the pepper.

**Two forms of an email address, and they are not interchangeable.** The
canonical form (lower-cased) is the login identity and is unique. The folded
form (dots and +tags removed for providers that ignore them) is *only* a risk
signal — folding is a heuristic, and some providers really do treat `a.b@` and
`ab@` as different people.

**Business rules live in config and are mirrored to the database.**
`config/business-rules.ts` holds the defaults; `system_settings` holds the live
values. Operations can retune a reputation weight or a risk threshold without a
deploy, and no call site hard-codes a number.

**Locations are rows, never branches.** Nothing compares a country or city name.
Opening a market is an insert. Mexico is modelled under North America and
marked as an expansion market — supported geographically without being misfiled
as Central American.

**Distinct layout archetypes per district.** The district registry records a
layout archetype (`request-board`, `discovery-density`, `motion-map`, …) as
well as an accent, and a test asserts all eight are distinct. Recolouring one
card grid eight times is explicitly not the plan.

## The contradiction we resolved

The specification listed a 100-token package *and* a 50-token per-purchase
ceiling. Those cannot both hold. Resolved in favour of the ceiling: the
100-token package stays in the catalogue but is seeded disabled, so the
purchase UI offers 5 / 10 / 25 / 50. Raising `TOKEN_RULES.maxTokensPerPurchase`
and enabling the package is a deliberate business decision, not a code change.
A test enforces that no enabled package exceeds the ceiling.

## What Phase 0 deliberately left as a contract

Where an implementation needs an external provider, a regulatory decision or a
credential nobody has supplied, there is a clean interface and an honest
"unavailable" — never an invented integration. Every one of them is listed in
[`CONFIGURATION.md`](CONFIGURATION.md).
