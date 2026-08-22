# Security model

Security here is a subsystem, not a checklist applied at the end. The structure
of the code is the control: where a rule can be enforced by a type, a constraint
or a trigger, it is — because those survive a future contributor who has not
read this document.

## Authentication

Passwords are scrypt-derived (N=32768, r=8, p=1, 64-byte key) with a per-user
random salt. Parameters are stored in the hash string and upgraded transparently
at next login when they are raised. Verification is constant-time; malformed
stored hashes return `false` rather than throwing, so a corrupted row cannot be
distinguished from a wrong password.

Login does not reveal which addresses are registered. An unknown address runs a
dummy verification so the timing matches, and both failure modes return the same
result.

Session tokens are 32 random bytes. The database stores only the SHA-256, so a
database leak cannot be replayed as a login. Three independent expiries apply —
idle timeout, absolute lifetime, and explicit revocation — and tokens rotate
hourly. A banned or suspended account's sessions stop working immediately,
without waiting for a revocation sweep.

The cookie is `httpOnly` (an XSS bug cannot read it), `sameSite=lax` (a
cross-site form post cannot carry it), and `secure` everywhere except local
HTTP.

Registration signs the new account in immediately. The session grants nothing
by itself — the account is `pending_verification` — but it is what lets the
verification page know whose code is being entered. The alternative, asking for
the address again, would let anyone request a code for a stranger's account.

## Email verification

Codes are six digits, stored only as a SHA-256, and expire. Each challenge
carries its own attempt counter, so guessing is bounded per code rather than
per account.

Issuing a new code **expires every pending one**. Without that, each resend
would add another simultaneously-valid code, and a member who pressed the
button five times would leave five live codes in the database.

A resend reads the address from the account row and never from the request. A
resend endpoint that accepted an address would be a way to mail a valid code to
an inbox of the caller's choosing.

Three independent limits apply, and none of them was invented at the call site:
the `resend_code` bucket bounds abuse per account, `resendCooldownSeconds`
stops rapid-fire requests, and `maxChallengesPerDay` caps the total. The last
two are measured from the challenge rows rather than a counter, so they survive
a counter purge.

Failure reasons *are* distinguished here — expired, no pending challenge, too
many attempts, wrong code — unlike at login. The caller already holds a session
for the account, so the distinction reveals nothing they could not learn by
waiting, and it saves them retyping a code that can never work.

## Authorization

Every privileged operation calls `requirePermission` on the server. There is no
client-side authority anywhere: a hidden button is a usability affordance, never
a boundary.

Authority is never derived from an email address in application code. The
primary administrator is granted the `admin` role by a server-side bootstrap
that only promotes an account which already registered normally. There is a test
proving that registering with the administrator's address confers nothing.

A suspended or banned account is refused regardless of its roles — an
administrator who is themselves suspended has no authority.

Roles follow least privilege: `moderator`, `district_reviewer` and `support`
exist so routine operations do not require the full-authority account.

## Input and data handling

Validation is server-side, with Zod schemas shared between the action layer and
the domain service. Whatever the browser checked is irrelevant.

All queries go through Drizzle's parameterised builder. Where raw SQL is used,
values are still bound parameters — there is no string concatenation of user
input anywhere in the codebase.

Personal signals are never stored raw. Email, phone, device fingerprint and
network prefix are HMAC-SHA256 under `SIGNAL_PEPPER`. They can be compared for
equality; they cannot be read back or brute-forced without the pepper.

IP addresses are reduced to a /24 or /48 prefix hash for matching, and a
full-address hash for rate limiting only. No raw address is persisted anywhere.

## Abuse resistance

Rate limits are server-side counters keyed by an opaque subject, so a client
cannot reset them and limits hold across instances. Buckets exist for login,
registration, code verification, resends, reporting, and publishing — with a
stricter publishing limit inside the 72-hour monitoring window.

The duplicate-account risk score is layered and explainable. Every contributing
factor is stored with its weight so a decision can be shown to a moderator and
contested by the user. Deliberately:

- no single signal reaches the blocking threshold (asserted by test);
- a match on a known shared network is downgraded to near-noise;
- reaching the blocking band restricts an action and opens a review case — it
  never bans.

The user is never told which signal tripped. `errors.riskBlocked` is marked
non-exposable, because telling an abuser what to change is telling them how to
succeed.

## Auditability

Account creation, verification, token movements, moderation decisions,
enforcement, role changes, setting changes and payment state changes all write
an audit record inside the same transaction as the action. An action cannot
commit without its trail.

The log is append-only (trigger) and hash-chained (content). `verifyAuditChain`
recomputes from the beginning and reports the first inconsistency. A test
disables the trigger, alters a record, and confirms the chain still catches it.

Audit records must never contain a password, a token, a document, or a raw IP
or user agent. The columns are named `ipHash` and `userAgentHash` so there is
nowhere to put a raw value even by accident.

## Privacy

The Trust Shield type is the privacy boundary. It carries a YAY ID, a display
name, verification booleans, account age, score, transaction count and a status
key — and nothing else. Reports, addresses, documents, phone numbers, email
addresses, moderation notes and risk scores are structurally absent, and a test
asserts the exact field set.

Location precision is a separate explicit choice from GPS permission. Granting
GPS tells Yavaya where someone is; it does not permit Yavaya to tell everyone
else. Published coordinates are snapped to a grid sized by the chosen precision
— snapping rather than adding noise, so repeated reads cannot be averaged back
to the true position. `exact` is never the default.

The public enforcement registry may show a YAY ID, a status, a broad reason
category and a date. Never documents, reports, addresses or personal detail.

## Transport and headers

Applied globally in `next.config.ts`: HSTS with preload,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Cross-Origin-Opener-Policy: same-origin`, and a `Permissions-Policy` that
denies camera, microphone and payment while allowing same-origin geolocation.

A Content-Security-Policy is set per request in `src/middleware.ts` with a
fresh nonce, so `script-src` carries no `unsafe-inline` and an injected script
will not execute. `style-src` still allows inline styles: React writes inline
`style` attributes for the district accent tokens and there is no nonce
mechanism for those. Style injection is a far smaller hazard than script
injection, and the alternative would be abandoning per-district theming.

CSRF is handled by Next.js Server Actions, which validate origin on POST, plus
`sameSite=lax` cookies.

## Managed-Postgres data APIs

Platforms that host Postgres often publish the `public` schema through a REST
layer reachable with a browser-side key. Supabase does this by default: on a
fresh project every table is readable with the anon key unless privileges are
revoked or RLS denies it. For Yavaya that default would expose password hashes,
session token hashes, verification codes, risk assessments and the audit log.

`drizzle/0002_data_api_lockdown.sql` closes it in two independent layers —
privileges revoked from the API roles including for future tables, and RLS
enabled with no policies, which denies every non-owner role. Yavaya connects as
the owner and enforces access in the application, so it is unaffected; a
non-owner role would need policies written first.

This is the single most important thing to preserve when moving to another
managed platform.

## Known gaps

Stated plainly rather than left for someone to discover.

- **No device fingerprint is collected.** `requestContext` sets it to `null`
  rather than deriving one from the user agent, which would produce mass false
  matches across identical phone models. Real fingerprinting is client-side
  work.
- **File upload validation is unimplemented** because storage is unconfigured.
  The requirements are in `CONFIGURATION.md`; uploads are rejected until then.
- **No breached-password screening.** Length is enforced (10 minimum); a
  k-anonymity check against a breach corpus is a configuration point.
- **No automated audit-chain verification schedule.** The function exists; the
  runner does not.
- **No secrets manager integration.** Secrets come from the environment.
- **Schema `USAGE` on `public` is still inherited from the `PUBLIC` role** on
  Supabase. It grants nothing on its own — there are no table privileges and
  RLS denies every non-owner role — but it is why a privilege audit shows
  `has_schema_privilege('anon','public','USAGE')` as true.
- **`style-src` permits inline styles**, as explained above. Tightening it
  would require moving every district accent to a stylesheet-generated class.
