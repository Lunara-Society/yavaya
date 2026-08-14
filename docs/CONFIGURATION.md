# Configuration points

Everything Yavaya needs from the outside world, and what happens until it
arrives.

The rule throughout: **an unconfigured integration reports itself unavailable.**
It never falls back to a simulated success, a fake send, or a pretend payment.
`/status` in the running app shows the live state of this list.

---

## Secrets (required to run at all)

| Variable | What it is | Notes |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | 16+ |
| `SESSION_SECRET` | ≥32 chars | Rotating it invalidates every session |
| `SIGNAL_PEPPER` | ≥32 chars | Keys the hashes of email, phone, device and network signals. **Rotating it orphans every stored signal** and resets duplicate detection — treat as permanent |

Generate:
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

---

## Email delivery — `EMAIL_PROVIDER`

**Needed for:** verification codes, receipts, security notices.

**The adapter is implemented.** SMTP delivery works and is wired into
registration; only credentials are missing. Set three variables and it becomes
`REAL`:

```
EMAIL_PROVIDER=smtp
SMTP_URL=smtps://user:pass@smtp.example.com:465     # or smtp://…:587 for STARTTLS
EMAIL_FROM="Yavaya <no-reply@your-domain>"
```

Any SMTP provider works, so choosing a vendor is a credentials change rather
than a code change. Pick one with reliable delivery to all seven launch
countries.

**Until configured:** registration succeeds and a code is generated, but
nothing is sent, and the interface says exactly that. In `APP_ENV=local` the
code is shown on screen so the flow can be finished by hand; it is never
returned from a deployed environment.

**`EMAIL_PROVIDER=console`** writes messages to the server log instead of
sending them. It is local-development only, refuses to run anywhere else, and
is registered as a **MOCK** capability — never `REAL` — so it cannot quietly
stand in for delivery.

A send that fails is reported as failed. `sendVerificationCode` returns an
outcome rather than throwing, so a briefly unreachable mail host does not roll
back a valid registration — but the caller must never report success on a
`delivered: false`, and does not.

---

## SMS delivery — `SMS_PROVIDER`

**Needed for:** phone verification, which is the heaviest single anti-duplication
signal and a prerequisite for the `phone_verified` reputation rule.

**Until configured:** phone verification cannot be completed. Accounts can still
register and transact at lower trust.

**To complete:** choose a provider with reliable delivery to all seven launch
countries — coverage and per-country pricing vary sharply across Central
America, and this is a commercial decision, not a technical one.

---

## Payments — PayPal

**Needed for:** token purchases, Works subscriptions, and later YavayaGo
commercial flows.

**Current state:** `src/server/domains/payments/providers/paypal.ts` is a real
adapter shell implementing the `PaymentProvider` interface. Every method that
would move money throws `ProviderUnconfiguredError`. `availability()` reports
`false` *even when credentials are present*, because the API calls are not
implemented — reporting otherwise would be exactly the fake success this
codebase forbids.

**To complete:**

1. Set `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
2. Implement `createCheckout` — Orders v2 `POST /v2/checkout/orders`.
3. Implement `capture` — `POST /v2/checkout/orders/{id}/capture`.
4. Implement `verifyWebhook` — `POST /v1/notifications/verify-webhook-signature`.
   Verify server-side. Never trust the payload alone.
5. Change `availability()` to report readiness once the above are real.
6. Register a fulfiller for the `tokens` payment domain
   (`registerFulfiller('tokens', …)`) that calls `creditPurchasedTokens`.
7. Confirm the merchant account may operate in each target country.

**Architectural note:** nothing outside the adapter knows PayPal exists. Adding
a second provider, or replacing this one, is an adapter change.

**Phase 1 YavayaGo payment model is deliberately not automated.** The customer
pays the restaurant directly; the restaurant receives its own money directly;
Yavaya holds no restaurant funds; driver compensation is a separate operational
agreement. Do not build automated restaurant payouts until Phase 4 and a real
marketplace payment provider.

---

## Identity documents / KYC — `KYC_PROVIDER`

**Needed for:** driver applications (government ID, selfie verification,
criminal-record certificate where legally required) and identity verification
generally.

**Until configured:** `manual` routes submissions to the admin review queue.
There is no automated document check.

**Open decisions that are not ours to make:**
- Which documents are legally required per country for a delivery driver.
- Retention period for identity documents per country's data-protection law.
- Whether a criminal-record certificate is lawful to require, and by whom it
  may be seen.

Document storage must be encrypted at rest and readable only by reviewers
holding `users.verify_identity`. Identity documents must never appear in an
audit record, a Trust Shield, or a public registry.

---

## Media storage — `MEDIA_STORAGE_PROVIDER`

**Needed for:** listing photos, avatars, evidence attached to reports.

**Until configured:** uploads are rejected rather than silently lost.

**To complete:** implement a storage adapter plus the validation pipeline —
content-type sniffing (never trust the declared type), size limits, image
re-encoding to strip metadata (EXIF GPS in a listing photo is a location leak),
and malware scanning before anything is served. Serve user media from a
separate origin so a malicious file cannot execute against Yavaya's origin.

---

## IP geolocation — `GEOIP_PROVIDER`

**Needed for:** suggesting a country and city on first visit.

**Until configured:** users pick their location manually, and GPS is offered
with explicit permission. This is a degraded experience, not a broken one.

**Never:** raise a user's published location precision because GPS was granted.
Precision is a separate, explicit choice — see `LOCATION_PRIVACY`.

---

## Infrastructure decisions still open

**Trusted proxy count.** `clientAddressFromHeaders(headers, trustedProxyCount)`
defaults to 1. Set it to the actual number of proxies in front of the app.
Getting this wrong lets a client spoof its own address and defeat rate limiting.

**Rate limit storage.** Counters currently live in Postgres — correct and
consistent, but a write per request. Move to Redis if that write becomes a
bottleneck; the interface in `security/rate-limit.ts` is the seam.

**Session store.** Sessions are database rows. Fine to five figures of
concurrent users; revisit with the same seam if not.

**Nearby search.** `geography.nearby` uses a bounding box plus a haversine sort,
so there is no PostGIS dependency. If proximity search becomes hot, install
PostGIS and rewrite that one function.

**Background jobs.** Three things need scheduling and have no runner yet:
`graduateMonitoredAccounts` (72-hour window), `expireDueDemoContent`, and
`purgeExpiredSessions` / `purgeExpiredRateLimits`. All are idempotent and safe
to run repeatedly.

**Audit chain verification.** `verifyAuditChain` should run on a schedule and
alert on failure. A hash chain nobody checks proves nothing.

---

## Legal and regulatory decisions required before certain features ship

These are flagged rather than guessed, because guessing would be worse than
waiting.

- **Tavern paid contests.** Any contest with an entry cost or a prize of value
  must be reviewed for gambling, sweepstakes and lottery law in *each*
  jurisdiction before activation. The Tavern framework exists so compliant
  games can be added; no regulated mechanic ships on the grounds that it sounds
  engaging.
- **Impact fundraising.** Yavaya's commission is 0%. Do **not** claim that 100%
  of a donation reaches a recipient until payment processing fees, taxes,
  banking costs and currency conversion have been accounted for and disclosed.
  The honest statement is "Yavaya takes no commission", with fees itemised.
- **Animals district.** Which animals may lawfully be listed, and under what
  conditions, varies by country. Mercadito's `animals` category is likewise
  "where legally appropriate".
- **Pharmacy pickup in YavayaGo.** Legal only in some jurisdictions and often
  only for specific product classes.
- **Data protection.** Retention periods, subject-access rights and breach
  notification duties differ across the seven launch countries. The audit log
  is append-only by design, which interacts with erasure requests: the
  resolution is to store no personal data in audit metadata (already the rule)
  and to erase the referenced records instead.
