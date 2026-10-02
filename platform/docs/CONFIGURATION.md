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

**Where outbound SMTP is blocked, use the Resend adapter.** Railway blocks
SMTP on every plan below Pro: an SMTP provider there hangs until its timeout
and delivers nothing. `EMAIL_PROVIDER=resend` sends through Resend's HTTPS API
instead:

```
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_…              # a sending-only key restricted to the domain
EMAIL_FROM="Yavaya <no-reply@yavaya.lat>"
```

The sending domain must be verified in Resend first; its DNS records are part
of the `email` set in the repository's DNS workflow. This is the production
configuration.

**Until configured:** registration succeeds and a code is generated, but
nothing is sent, and the interface says exactly that. In `APP_ENV=local` the
code is shown on screen so the flow can be finished by hand; it is never
returned from a deployed environment.

This is the only thing standing between a member and a verified account. The
rest of the flow — `/verify`, code entry, expiry, the attempt limit, resend
with its cooldown and daily cap, and activation — is implemented and covered by
integration tests. That is why the `email_verification` capability is
`REQUIRES_CONFIGURATION` rather than `REAL`: judged from the member's side, a
code they never receive is not a working verification.

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
signal and earns the `phone_verified` reputation rule.

**Built:** the whole flow, at `/account/phone`. A member enters a number in
international form, receives a 6-digit code by SMS, and types it back. Only
then is the number written to the account with `phone_verified_at`; starting
a verification for another number leaves the verified one in place until the
new one is confirmed. On confirmation the number is recorded as a duplicate
signal, the `phone_verified` rule is applied once per member, and the phone
medallion appears on the Trust Shield. In Mercadito, a listing shows
"verified by SMS" beside the WhatsApp button only when the WhatsApp number is
the verified number, and `/account/phone` offers to make it so.

Guards: one live code per member, the email flow's resend cooldown and daily
cap (`VERIFICATION_RULES`), at most 5 codes an hour per member and 5 a day
per number across all accounts (the per-number limit stops the form being
used to flood a stranger's phone or pump premium-rate numbers), and 5
attempts per code.

**Until configured:** `/account/phone` says SMS verification is not active and
shows no form; the capability reads `REQUIRES_CONFIGURATION`. Accounts can
still register and transact at lower trust.

**To complete** — Twilio Verify, which handles sender IDs and carrier rules
per country (the adapter speaks its REST API directly, no SDK):

1. Create a Twilio account and, under Verify, a Service. Set its friendly name
   to `Yavaya` — it is the name in the SMS text.
2. Under Verify → Geo permissions, enable the launch countries. Only these can
   receive codes; others get "we cannot send SMS to that country".
3. Set on the web service:
   `SMS_PROVIDER=twilio_verify`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_VERIFY_SERVICE_SID`. Keep them as secrets.
4. `/status` then reports SMS delivery as REAL.

`SMS_PROVIDER=console` is for local development: codes go to the server log,
nothing is sent, and the capability reads `MOCK`.

**Open decisions:**

- **One number, several accounts.** Families share phones. A number that
  verifies more than one account is recorded as a duplicate signal and is not
  refused. Whether it should be refused is the owner's call.
- **WhatsApp as a channel.** Twilio Verify can send codes over WhatsApp, which
  many members prefer to SMS. It needs a WhatsApp sender registered with Meta;
  the adapter sends `Channel=sms` only until that exists.
- **Cost.** Twilio charges per verification, and the price varies by country.

---

## Payments — dLocal Go

**Needed for:** buying tokens (`/account/tokens`). Later: Trabajo
subscriptions and other paid flows, through the same adapter.

**Current state:** implemented and tested against a stand-in that behaves as
dLocal Go documents (`providers/dlocalgo.ts`, `tests/integration/payments.test.ts`).
Not yet run against dLocal Go itself — that is the sandbox step below. Until
the keys are set, `/status` says "requires configuration" and the tokens page
shows packages with no buy button.

**How a purchase works:**

1. The member picks a package. Yavaya records the payment and asks dLocal Go
   for a checkout (`POST /v1/payments`); the member pays on dLocal Go's page.
   Card details never reach Yavaya.
2. dLocal Go calls `https://yavaya.lat/api/payments/dlocalgo/notify` on every
   status change. Yavaya checks the HMAC-SHA256 signature, then asks dLocal Go
   for the payment's status (`GET /v1/payments/:id`).
3. Only `PAID`, for **exactly** the price and currency asked, credits the
   tokens — once, however many times dLocal Go retries. A different amount is
   held as a discrepancy (audited, never credited) for a person to look at.
4. Coming back to Yavaya from the checkout proves nothing and credits nothing.
   The page shows each purchase as dLocal Go confirmed it.
5. If a notification is lost, the scheduler re-reads waiting payments every
   15 minutes (`reconcile-payments`).

**Owner setup:**

1. Create the dLocal Go account and, in the **sandbox** dashboard
   (`dashboard-sbx.dlocalgo.com` → Integrations → API Integration), copy the
   sandbox API key and secret key.
2. In Railway, set on **both** `yavaya-web` and `yavaya-scheduler` (as
   variables, never in chat or in the repository):
   `DLOCALGO_ENV=sandbox`, `DLOCALGO_API_KEY`, `DLOCALGO_SECRET_KEY`.
3. In sandbox mode only administrators see the buy buttons, and `/status`
   shows payments as DEMO: test cards are not money, so nothing bought with
   them may reach ordinary members. Buy a package as the admin with test card
   `4111 1111 1111 1111` (any future date, any CVV) and check that the tokens
   arrive. `5555 5555 5555 4444` should be rejected and credit nothing.
4. Activate the live account, configure its payment methods (settings do not
   carry over from sandbox), and replace the three variables with the live
   keys and `DLOCALGO_ENV=live`. Then make one small real purchase.
5. Before step 4: the lawyer has reviewed the Terms of Use for purchases, and
   the prices in `TOKEN_PACKAGES` (USD) are the ones you want.

**Notes:** the checkout pages are on `checkout.dlocalgo.com` /
`checkout-sbx.dlocalgo.com`; the Content-Security-Policy allows form
redirects there and nowhere else. Refunds are not automated: `refund()`
exists in the adapter, but no screen calls it yet, and a refund
notification is recorded without changing balances.

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

**Needed for:** Mercadito listing photos (publishing requires at least one).

**Until configured:** uploads are rejected rather than silently lost, the
publish page says publishing is unavailable, and `/status` shows both
`media_storage` and `mercadito` as requiring configuration.

**Configured in production:** `MEDIA_STORAGE_PROVIDER=s3` against the Railway
bucket `yavaya-media`. The credentials are Railway reference variables on the
web service, never copied values:

| Variable | Value |
| --- | --- |
| `MEDIA_S3_ENDPOINT` | `${{yavaya-media.ENDPOINT}}` |
| `MEDIA_S3_BUCKET` | `${{yavaya-media.BUCKET}}` |
| `MEDIA_S3_REGION` | `${{yavaya-media.REGION}}` |
| `MEDIA_S3_ACCESS_KEY_ID` | `${{yavaya-media.ACCESS_KEY_ID}}` |
| `MEDIA_S3_SECRET_ACCESS_KEY` | `${{yavaya-media.SECRET_ACCESS_KEY}}` |

`MEDIA_S3_FORCE_PATH_STYLE=true` is only for a local MinIO; Railway buckets use
virtual-hosted URLs. There is deliberately no local-disk provider: a container
disk is wiped on each deploy, and the photos would vanish while their listings
stayed.

**The pipeline** (`src/server/domains/media/`):

- The type is decided by the file's first bytes (JPEG, PNG, WebP), never by
  its name or the browser's declared type.
- Each file is decoded with a pixel ceiling (decompression bombs are refused
  before allocation), EXIF orientation is applied, and a **new WebP is
  encoded from the pixels** at up to 1600 px. Nothing of the original file is
  stored, so EXIF GPS, camera serials and any payload riding in the file are
  gone. For this reason there is no separate malware scan of images: there is
  no uploaded file left to scan.
- Photos are served by `/media/<id>` from the application, with
  `Content-Security-Policy: default-src 'none'` and `nosniff`. The bucket
  stays private. A separate media origin was the earlier plan; it is not
  needed while the only thing served is a WebP Yavaya encoded itself, and it
  becomes necessary the day any other file type (PDF evidence, video) is
  accepted.
- Objects are written before the database transaction and deleted if it
  fails, so a refused listing (no tokens, over the limit) leaves nothing
  behind. A crash between the two can leave an orphaned object with no row;
  nothing references it. A periodic sweep of objects with no `media` row is
  not built yet.

---

## Imagery

The photographs in `public/art/` (home hero and the six district scenes) are
illustrative scenes generated for Yavaya with an image model through the
owner's ElevenLabs account, then re-encoded here to WebP at three widths with
no metadata. The prompts excluded people, text and logos, so nothing in them
can be taken for a real member, seller, listing or brand, and the site footer
says the photographs are illustrative. Replacing any of them with licensed or
commissioned photography is a file swap: keep the name and widths
(`<name>-<width>.webp`).

The guilloché seal and ornamental rules are drawn in code
(`src/ui/site/art.tsx`).

---

## District structure (owner decision, October 2026)

Seven districts, each answering one question: **Mercadito** (buy and sell
things), **Servicios** (someone does something for me — trades, urgent home
problems, professionals including psychology), **Trabajo** (jobs and
professional projects; registry key `works`), **YavayaGo** (deliveries and
errands), **Comunidad** (free help between neighbours, family support,
causes), **Santuario** (churches, daily word, prayer wall) and **Animales**
(welfare, screened adoption, rescue).

- The line between Comunidad and Servicios: no money → Comunidad; money or an
  agreed job → Servicios.
- Impacto became the "Causas" section of Comunidad (`/impact` redirects there).
  The Tavern was taken off the roadmap. Both rows stay in `districts` as
  `retired` so history resolves.
- The prayer wall moved to `/sanctuary/prayer`. Prayer requests are still
  Community posts of kind `prayer` (same moderation, same discretion); the
  square lists only `NEIGHBOUR_KINDS`.

## Animales — what is built and what was decided

Owner's direction: animal welfare is the priority, and adopting must be
earned "almost like a licence". Built:

1. **Learn.** A responsible-care guide (water and food, shelter, no chains,
   vet and rabies vaccine, sterilisation, respectful training, heat and signs
   of illness, lifelong commitment) and a 10-question quiz. Passing
   (`ANIMALS_RULES.quizPassMark`, 8/10) grants the *certificado de cuidado
   responsable*. Retrying is allowed at once; every answer is explained.
2. **Rescuers.** Only rescuers approved by a reviewer (`adoptions.review`:
   district reviewers, admins) can publish animals — the easiest way to sell
   puppies would otherwise be to call yourself a rescuer. Changing name,
   description or place sends them back to review.
3. **Adopt.** No animal has a price. An application covers home, tenure and
   landlord permission, household (all must agree), other animals,
   experience, hours alone, where it sleeps, vet plan and motive, plus six
   commitments that must all be accepted (no chains, vaccines, sterilisation,
   vet care, return rather than abandon, follow-up). The rescuer chooses the
   home; declining requires a written reason. Completing the adoption applies
   `approved_animal_adoption` (+50) to the adopter, once.
4. **Follow-up.** `followUpDays` (30) after an adoption the scheduler asks the
   adopter for news and reminds the rescuer to check in.

The guide says Central American countries have animal-protection laws and
that cruelty can be reported; it deliberately cites no law numbers.

5. **Lost and found** (`/animals/lost`). Any active member may post (no
   review: speed matters), with 1–4 photos, the day and the city. Public to
   read; the WhatsApp is for signed-in members only, against the ransom scam,
   and every page warns never to pay in advance. A new "found" post notifies
   owners of open "lost" posts for the same species in the same city (once a
   day per post), and each post lists its possible matches. Posts close after
   `lostOpenDays` (60) via the scheduler's `expire-lost-found`.

Not built: home visits (they happen outside Yavaya; nothing claims Yavaya
verified a home), a public directory of vets, and
re-taking the quiz when the guide changes (`certificateVersion` is stored for
that).

## Servicios — what is built and what was decided

Built: the request board (members only, urgent first), asking (with
"Lo necesito hoy"), provider profiles with "Disponible hoy", replies, choosing
who does the job, completion, reviews, reports, and a review queue for
licences and reports (`services.review`: moderators, district reviewers,
admins). Numbers live in `SERVICES_RULES`; categories in `config/services.ts`.

Decided under the owner's delegation (retune freely):

- **Free.** Asking and replying are billable actions at cost 0. No payment
  passes through Yavaya; a reply's price is free text the two people agree on.
- **Contact.** A reply shows the provider's WhatsApp to the person who asked,
  at once — a roof leaking at 3 a.m. cannot wait for a second step. Choosing
  who did it is what makes a review possible.
- **Sensitive categories** (Mental health, Health and care) are seen only by
  the asker and providers of that category, and only there may the asker hide
  their name.
- **Regulated categories** (Mental health, Health and care, Legal) require a
  stated licence. It reads "sin verificar" until a reviewer confirms it in the
  official register; changing the text sends it back to review. Reviewers
  check by hand: there is no document upload and no registry integration yet.
- **Urgent requests** notify providers in the same country who switched on
  "Disponible hoy" (lasts 12 h), up to 30. Ordinary requests send each
  matching provider at most one "new requests" notice per category per day.
- **Reputation.** A review of 4–5 stars applies `verified_positive_review`
  (+10), once per job. `successful_transaction` is *not* applied: Yavaya does
  not see money change hands, so it cannot confirm a transaction.

Open: whether to add licence document upload; whether providers should pay
for visibility (the Bible's Work subscriptions are a different district).

## Espacio Violeta — what is built and what was decided

A protected space for women going through something hard (abuse, a partner
who cheated or left, a pregnancy faced alone, mental-health struggles), at
`/violeta`, reached from Comunidad and the account page. The security model
is in SECURITY.md; numbers are `SAFE_SPACE_RULES`; word lists, professions,
pledges and report reasons are `config/safe-space.ts`.

Built: the entrance with pledges; handles of the space (women from flowers,
sky and sea; professionals from trees, plus a badge and colour); the shared
room; who is online (members can hide); private conversations that only the
two people read, with "talked before" so women recognise each other; block,
delete, report; a guardian queue at `/admin/violeta`; settings (new name,
presence, leave and erase); quick exit; live refresh without sockets.

**Requires `SAFE_SPACE_KEY`** (32+ random characters) on the web service.
Without it the space is closed and `/status` says why. Rotating it makes
existing messages unreadable; since everything expires within 90 days, a
rotation costs at most that.

Decided under the owner's delegation (retune freely):

- **Who may enter.** Women, by pledge — there is no way to verify gender
  without identity documents, and requiring documents would keep out the
  women who most need anonymity. Reports remove those who lie.
- **Professionals** are psychologists and psychiatrists whose Servicios
  profile carries a mental-health licence a reviewer verified. If the licence
  stops being verified, they are locked out on the next request.
- **Who writes first.** Women may start a private conversation with anyone;
  professionals may not start one. This protects the women from unsolicited
  contact and the professionals from being accused of it.
- **Guardians** are a separate role (`safe_space_guardian`) the owner grants
  by name. Ordinary moderators do not see these reports. Admins do, because
  admin holds every permission.
- **Retention.** Room 30 days, private 90 days, decided reports 90 days.
- **Not audited, not notified:** see SECURITY.md for why.
- The privacy page states the 30/90-day periods in prose; if
  `SAFE_SPACE_RULES` changes, update `i18n/site/*` privacy text too.

Open:

- **Verified help lines per country.** The space tells women in danger to
  call their country emergency number, but shows no numbers: Yavaya has no
  verified list yet, and a wrong number in this place is worse than none.
  Operations should supply verified numbers (emergency, women's helplines)
  per country; they belong in a table, not in code.
- Who the first guardians are (grant `safe_space_guardian` to them).
- Whether professionals should be paid or volunteer, and how a woman can
  move from a conversation to a paid session in Servicios.

## Trabajo — what is built and what was decided

Built: the offer board (public, filter by field, kind and remote), employer
verification (`/work/employer`, reviewed at `/admin/work` with `work.review`:
moderators, district reviewers, admins), job and project offers, professional profiles (members only, not indexed),
applications with a message, the employer's steps (shortlist, decline with an
optional note, hire), closing, 30-day expiry (`expire-work-posts` in the
tick), reports and a review queue (`work.moderate`: moderators and admins).
Numbers live in `WORK_RULES`; fields and contract types in `config/work.ts`.
The district key stays `works` (data already written under it); the route is
`/work`.

Decided under the owner's delegation (retune freely):

- **Free for now.** The Bible prices Work by subscription ($4.99 a week,
  $14.99 a month, business and agency plans later). Subscriptions need card
  payments, which are not live, so posting and applying are free until the
  owner sets a start date. `/status` lists `work_subscriptions` as
  REQUIRES_CONFIGURATION. Starting to charge is an owner decision, and
  members should be told before it happens.
- **Pay is required.** Every offer states its pay as free text (an amount or
  a range, with currency and period). No auctions: candidates apply with a
  profile and a message, never a price.
- **No-fee promise.** Publishing requires promising never to charge
  candidates (to apply, for training or materials), the region's commonest
  employment scam. "They asked me for money to apply" is its own report
  category.
- **Contact.** Applying shares the candidate's WhatsApp with that employer.
  The employer's WhatsApp is shown to a candidate only once shortlisted or
  hired.
- **Notices.** Members marked "open to work" in the offer's field and area
  get at most one "new offers" notice per field per day (up to 200 people per
  offer). Candidates hear about each decision and about closing.
- **Moderation.** Removing an offer notifies its author. Suspending a
  profile hides it and stops it applying; it does not close offers already
  posted (remove those individually).
- **Limits.** 10 open offers per employer; 20 open applications per candidate.
- **Verified employers only** (owner decision, October 2026). Every employer
  applies once — as a person or a business — and a person approves them
  before their first post. A business must give a registration or tax
  number, and posts under the verified name only: the post form has no
  company field, because borrowing a real company's name is the commonest
  employment scam. Changing name, type or registration sends the employer
  back to review; phone, description and website do not. Suspending an
  employer removes their open offers and tells waiting candidates. Offers
  published before verification existed stay up without the badge until
  they expire.
- **What "verified" means** is that a reviewer looked: a business number
  checked in the country's public register, a person contacted on WhatsApp.
  There is no registry integration or document upload; the review guidance
  on `/admin/work` says what to check.

Open: the subscription start date and plans; reviews between employers and
professionals; whether to integrate a business registry per country.

## Community — what is built and what is undecided

Built: the town square at `/community` with local help (requests and
offers), the prayer wall and family support; replies; "I am with you" on
prayer and family posts; the author marking a post resolved or withdrawing
it; reports on posts and on single replies; the moderation queue at
`/admin/community`. Posting is free (`community.publish_request`, cost 0).

Decisions taken, open to change:

- **Members only.** The square is not public: many posts are about someone's
  hardest week, and the Bible forbids presenting a vulnerable person's
  situation as entertainment.
- **Discretion.** Prayer and family-support posts can hide the author's
  name from other members. Moderators always see it. Local-help posts always
  show it, because a stranger coming to your door should know who asked.
- **No activity-feed events** for Community, for the same reason.

Undecided (not built, flagged rather than guessed):

- **Reputation and tokens for helping.** The Bible says contribution earns
  reputation (primary) and tokens (secondary), with a weekly cap, but sets no
  amounts and no definition of a "confirmed" help. Nothing is awarded yet.
- **Community groups** need their own design (membership, group
  moderators) and are shown as not built.

## Sanctuary — what is built and what is undecided

Built: `/sanctuary`, inside Community. Open to everyone to read.

- **Churches register themselves** (`/sanctuary/register`): name,
  denomination as they describe it, description, city, address, WhatsApp,
  broadcast link (https only) and weekly service times in the church's own
  local time (taken from its place's timezone).
- **A person approves each church** before it appears, at
  `/admin/sanctuary`, with the `sanctuary.review` permission (held by the
  admin, moderator and district-reviewer roles). Nobody reviews their own
  church. Rejecting or suspending needs a written reason, which only the
  owner sees.
- **Changing what identifies an approved church** — its name,
  denomination, city, WhatsApp or broadcast link — sends it back to review,
  so an approval can't be carried over to something else. Its description,
  address and service times change freely.
- **The prayer and word for the day** is written by approved churches, up to
  3 per church per day, dated from 1 day back to 14 days ahead. A word shows
  only once its day has arrived where the church is. Yavaya writes and
  publishes none of this content.
- **Following a church** shows its next service and its words first.
  Writing to a church on WhatsApp needs an account, as in Mercadito.
- **Reports** on a church or on one of its words collect under one ticket;
  a reviewer can dismiss, remove the reported words, or suspend the church.
- Everything is free (`sanctuary.register_church`,
  `sanctuary.publish_devotional`, both cost 0).

Decisions taken here, open to change: the limits above and the field
lengths are guardrails in `SANCTUARY_RULES`, not rules from the Bible. Two
are mirrored into `system_settings`.

Undecided (flagged rather than guessed):

- **What a reviewer must confirm before approving a church.** The review
  page asks the reviewer to confirm the church exists and that the person
  who registered it represents it, but no required evidence is defined
  (registration documents, a call, a visit). Owner decision.
- **Church verification as a badge** on the owner's Trust Shield, and any
  reputation for running a church, are not built.
- **Live services inside Yavaya.** Broadcasts are links out to YouTube,
  Facebook or another site; nothing is embedded or streamed by Yavaya.
- **Words prepared ahead reach followers on their day**, from 06:00 where the
  church is (`SANCTUARY_RULES.wordDeliveryLocalHour`), via the scheduler's
  `deliver-words` job. A word whose day passed while the scheduler was down
  is not sent late. Decided under the owner's delegation; retune freely.

---

## Notifications — in-app only

Built: the bell in the header and `/notifications`. A notification is written
by the service that caused it, inside the same transaction, as an i18n key
with parameters, so it reads in the member's current language.

| Event | Who hears | Limit |
|---|---|---|
| Reply to a Community post | the author (not for their own replies) | none |
| Support on a prayer or family post | the author, never told who | one per post per day |
| New listing matching a saved search | the searcher (never the seller) | one per search per day |
| Church approved, rejected or suspended | the church owner | — |
| Today's word from a followed church | followers | one per church per day |
| Moderation removing a post, listing or word | its author | — |

Members switch categories off in Settings; every category is on until they do.
Registered demo content never produces a notification.

**Daily email summary** (decided under the owner's delegation, "best for all
users"; numbers in `NOTIFICATION_RULES`):

- One email a day at most, between 07:00 and 12:00 where the member lives
  (13:00–18:00 UTC for members with no place set).
- Only notifications still unread, at least an hour old (the site gets the
  first chance) and at most three days old.
- On by default for members with a verified email; one switch in Settings,
  and a signed one-click unsubscribe in every message (RFC 8058
  `List-Unsubscribe-Post`, plus a page that asks before acting, since mail
  scanners open links).
- Never sent through the console provider, and an item is marked as emailed
  only after the provider accepts the message.

**Not built:** SMS or push delivery of notifications.

---

## Mercadito — rules and open decisions

Live values are in `system_settings` (seeded from `MERCADITO_RULES` in
`config/business-rules.ts`) and can be changed without a deploy.

| Setting | Default | Source |
| --- | --- | --- |
| `mercadito.new_seller_window_days` | 7 | Master Bible: "Account <7 days: max 3 listings" |
| `mercadito.new_seller_max_listings` | 3 | same |
| `mercadito.restricted_categories_unverified` | `[]` | **Undecided** — see below |
| Photos per listing | 1–6 | Technical default, not from the Bible |
| Cost of publishing | 1 token | `billable_actions` row `mercadito.publish_listing` |

**Decisions the specification leaves open:**

1. **What counts toward "max 3 listings".** Implemented as every listing the
   account has created in its first 7 days, whatever its state now — so
   withdrawing and republishing cannot get around it. If the intent was
   "3 listings live at once", change the count in
   `sellerStanding`/`publishListing` to published listings only.
2. **"Unverified account: limited categories".** The Bible does not say which
   categories. The mechanism is built (an identity-unverified seller is refused
   any category in `mercadito.restricted_categories_unverified`), and the list
   ships empty. Identity verification is itself not available yet, so any
   category put on the list would be closed to every seller.
3. **"Listings with no phone: reduced visibility".** Implemented as ordering:
   listings whose seller has a WhatsApp number sort first; the rest follow,
   never hidden.
4. **Phone numbers.** A WhatsApp number shows as verified only when the
   seller verified that same number by SMS (see "SMS delivery"). Until SMS is
   configured every number shows as not verified, and the listing page says
   so beside the WhatsApp button.
5. **AI checks.** Of the Bible's list, exact duplicate photos across sellers
   and repeated titles by one seller are flagged to the moderation queue.
   Reverse image search, scam-keyword detection and price-anomaly detection are
   not built (capability `listing_screening`).
6. **Payments.** Yavaya does not process Mercadito payments; the site and the
   listing page say so.

---

## IP geolocation — `GEOIP_PROVIDER`

**Needed for:** suggesting a country and city on first visit.

**Until configured:** users pick their location manually, and GPS is offered
with explicit permission. This is a degraded experience, not a broken one.

**Never:** raise a user's published location precision because GPS was granted.
Precision is a separate, explicit choice — see `LOCATION_PRIVACY`.

---

## Proxy topology — `TRUSTED_PROXY_COUNT`, `CLIENT_IP_HEADER`

**Needed for:** rate limiting and the duplicate-account network signal. Nothing
else consults the client address — sessions and permissions do not — so a wrong
value here degrades abuse resistance rather than authentication.

Every proxy in front of Yavaya appends to `X-Forwarded-For`. The count tells
the application which entry in that chain is the real client rather than a
value the client wrote themselves.

| Deployment | `TRUSTED_PROXY_COUNT` | `CLIENT_IP_HEADER` |
| --- | --- | --- |
| Platform edge only (Railway, Render, Fly) | `1` | `forwarded` |
| Cloudflare in front of that edge | `2` | `forwarded` |
| Cloudflare, hop-count-independent | any | `cf-connecting-ip` |
| Local development | `1` | `forwarded` |

**Both ways of getting it wrong are silent.** Too low and a client can spoof
its own address to slip past rate limiting. Too high, or the wrong header, and
*every* visitor resolves to the proxy's own address — one shared bucket, in
which a single abuser exhausts the limit for everybody and per-account limits
effectively cease to exist. Neither failure raises an error, which is why the
Cloudflare chain is covered by tests rather than left to inspection.

`cf-connecting-ip` is written and overwritten by Cloudflare on every proxied
request, so it does not depend on counting hops correctly — worth preferring,
because adding or removing a proxy later silently changes the right count. When
that header is selected the application never falls back to `X-Forwarded-For`:
the header is missing precisely because the request did not come through
Cloudflare, and reading a chain the configuration says not to trust is how a
bypass becomes a spoof.

**Neither setting can defend an origin that is still reachable directly.**
Anyone who finds the platform's own hostname can write these headers
themselves. Keep the origin hostname quiet, and prefer a platform that can
restrict inbound traffic to the proxy's addresses.

---

## Infrastructure decisions still open

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
- **Mercadito prohibited items.** The Terms do not yet list what may not be
  sold (weapons, drugs, medicines, live animals, counterfeit goods, and so on),
  and the list differs by country. Moderators can remove any listing through
  reports today; the list itself is an owner and legal decision.
- **Legal entity.** The Terms first promised to name the responsible legal
  entity, the applicable law and the dispute process "before the districts
  open". The owner opened Mercadito before those were settled, so the Terms
  now say they will be published as soon as they are defined. They are still
  owed.
- **Pharmacy pickup in YavayaGo.** Legal only in some jurisdictions and often
  only for specific product classes.
- **Data protection.** Retention periods, subject-access rights and breach
  notification duties differ across the seven launch countries. The audit log
  is append-only by design, which interacts with erasure requests: the
  resolution is to store no personal data in audit metadata (already the rule)
  and to erase the referenced records instead.
