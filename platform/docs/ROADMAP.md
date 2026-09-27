# Roadmap

Status is what is *built*, not what is planned. `/status` in the running app is
the live version of this.

## Phase 0 — Foundation ✅ complete

Architecture, database, authentication, identity, geography, permissions,
audit, security foundation. Plus the platform primitives Phase 1 depends on:
the token ledger, the reputation engine, the Trust Shield, rate limiting, the
demo-content framework, and the payment abstraction.

93 tests. Typecheck and production build clean.

## Phase 1 — Core Yavaya

Mercadito · Services · Community · Animals · Impact · Tokens UI · Admin ·
Notifications · Trust Shield surfaces.

Prerequisites that must land first: email delivery (registration cannot open to
the public without it), media storage (listings need photos), and the
moderation workflows whose schema already exists.

Per district: listing/request lifecycle, category taxonomy, search and
location filtering, reporting on every user-generated object, and the district's
own layout archetype — not a recoloured grid.

Impact requires cause review before publication, with evidence requirements
that vary by cause type. Animals requires the full adoption pipeline
(application → identity verification → household information → suitability
review → interview where appropriate → approval → agreement → follow-up) with
an auditable case record. Neither is instant, by design.

## Phase 2 — Work and movement

Works · YavayaGo · driver network · restaurant onboarding · delivery operations
· PayPal integration.

Driver applications need the full document set and a state machine
(Applied → Documents Submitted → Under Review → Approved/Rejected →
Suspended/Deactivated) with every decision logged and a 72-hour review target.
No driver is active before approval.

YavayaGo Phase 1 payment model stays as specified: the customer pays the
restaurant directly, the restaurant receives its own money directly, Yavaya
holds no restaurant funds, and driver compensation is a separate operational
agreement. Automated payouts are Phase 4.

Works uses subscriptions (weekly and monthly), kept architecturally separate
from Yavaya Tokens. No bidding wars, no race to the bottom — reputation,
portfolio and skills drive matching.

## Phase 3 — Depth

Tavern · advanced reputation · recommendations · automation.

Every paid Tavern contest requires jurisdiction-by-jurisdiction gambling,
sweepstakes and lottery review before activation. The framework exists so
compliant games can be added; nothing regulated ships because it sounds
engaging.

## Phase 4 — Payment infrastructure

Marketplace payment splitting · automated restaurant payouts · automated driver
payouts · expanded mobility.

This is where "Yavaya protects this transaction" could become a true statement.
Until an actual escrow or protection system exists, nothing in the product may
claim it.

## Standing rules for every phase

Inspect the repository first. Establish the architecture before writing
features. Schema, then backend contracts, then authorization, then frontend.
Test. Security review. UX review. Verify on mobile. Document what was built.
List what remains blocked and why.

Never claim something is implemented when it is mocked. Never create a fake
payment success. Never invent a business rule that was not specified — build the
abstraction and flag it instead.
