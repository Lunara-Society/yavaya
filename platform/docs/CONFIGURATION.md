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
| `SESSION_SECRET` | ≥32 chars | Signs short-lived values, appeal links and unsubscribe links; sessions do not depend on it. Rotate with `SESSION_SECRET_PREVIOUS` (§ Rotating keys) |
| `SIGNAL_PEPPER` | ≥32 chars | Keys the hashes of email, phone, device and network signals. **Rotating it orphans every stored signal** and resets duplicate detection — treat as permanent |

Generate:
`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`

## Rotating keys

Do this when a secret may have been exposed — as on 21 October 2026, when
Railway reported that customers' environment variables may have been read —
or when someone who held it leaves. Set each value on **both** `yavaya-web`
and `yavaya-scheduler`, then redeploy both. Nothing below needs downtime.

**1. The database password.** Railway → Postgres → Database → Config →
**Regenerate**. It changes the password and the `DATABASE_URL` reference in
one step; the services pick it up on their next deploy. If the database has
public networking switched on and nothing outside Railway needs it, switch
it off.

**2. Yavaya's own secrets** (generated with the command above, nobody else
issues them):

| Variable | How to rotate | What it costs |
| --- | --- | --- |
| `TWO_STEP_KEY` | Move the old value to `TWO_STEP_KEY_PREVIOUS`, set a new one, deploy | Nothing. The release step reseals every authenticator secret under the new key and logs `reseal …`; once a release says everything is under the current keys, delete `TWO_STEP_KEY_PREVIOUS` |
| `SAFE_SPACE_KEY` | The same, with `SAFE_SPACE_KEY_PREVIOUS` | Nothing; Espacio Violeta messages stay readable throughout |
| `SESSION_SECRET` | Move the old value to `SESSION_SECRET_PREVIOUS`, set a new one | Nothing while the previous value is kept. Delete it after 14 days (the appeal window, `SANCTION_RULES.appealWindowDays`); after that, older unsubscribe links in past emails stop working and the member uses Settings instead |
| `PREVIEW_ACCESS_KEY`, `GUIDE_UPLOAD_TOKEN` | Replace (the upload token should be blank except during an upload) | Nothing |
| `SIGNAL_PEPPER` | Replace — there is no previous-value form | Stored signals can no longer be matched: duplicate-account and rate-limit history starts again. Accounts and sign-in are unaffected. Worth it only if the database itself may have been read |

If a `…_PREVIOUS` key is set without its current key, the release fails on
purpose rather than leave data sealed under nothing.

**3. Keys issued by providers** — create a new one at the provider, paste it
into Railway, deploy, then revoke the old one at the provider:
`STRIPE_SECRET_KEY` (Stripe → Developers → API keys → roll the restricted
key), `RESEND_API_KEY`,
`GOOGLE_CLIENT_SECRET` (Google Cloud → Credentials → the OAuth client → add a
secret, then disable the old one), `TWILIO_AUTH_TOKEN`, `ELEVENLABS_API_KEY`.
The bucket's `MEDIA_S3_*` credentials are reset by Railway itself and reach
the services through reference variables on the next deploy.

**4. Check.** Both services' deploy logs show the release completing and no
`password authentication failed`; `/status` shows the same states as before;
sign in, open `/account/tokens`, and play a guide film.

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
than a code change. Pick one with reliable delivery to all eight launch
countries (Central America and Mexico).

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

> **Deferred — owner's decision, 20 October 2026.** No SMS provider for now:
> it costs money per message. Free methods come first — email verification,
> Continuar con Google, password reset by email and two-step sign-in with an
> authenticator app. The flow below is built and stays ready; the account
> page shows no phone shortcut until a provider is configured.

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

## Payments — Stripe (every country)

**Needed for:** buying tokens (`/account/tokens`). Later: Trabajo
subscriptions and other paid flows, through the same adapter.

Routing (`config/payments.ts`): **Stripe for every country** (the owner's
choice, October 2026); it is the only provider. Until its key is set,
`/status` says "requires configuration" and the tokens page shows packages
with no buy button.

**How a purchase works:**

1. The member picks a package. Yavaya records the payment and asks Stripe for
   a Checkout Session for exactly that package; the member pays on Stripe's
   hosted page. Card details never reach Yavaya.
2. Stripe sends the member back to `/api/payments/stripe/return`. Coming back
   proves nothing and credits nothing: it only prompts Yavaya to read the
   session from Stripe, server to server.
3. Only a session that reads `complete` and `paid`, for **exactly** the price
   and currency asked, credits the tokens — once, however often it is read. A
   different amount is held as a discrepancy (audited, never credited) for a
   person to look at; an expired session is marked failed.
4. A member who pays and closes the tab is settled by the scheduler, which
   re-reads waiting payments every 15 minutes (`reconcile-payments`). No
   webhook secret is needed, and payment notifications are refused.

**Owner setup:** set on **both** `yavaya-web` and `yavaya-scheduler` (as a
variable, never in chat or in the repository) `STRIPE_SECRET_KEY` — a
**restricted** key (`rk_live_…`) with only Checkout Sessions: Write,
PaymentIntents: Read, Refunds: Write. A `rk_test_…` key is test mode: only
administrators see the buy buttons and `/status` says so, because test cards
are not money.

**Notes:** the Content-Security-Policy allows form redirects to
`checkout.stripe.com` and nowhere else. Refunds are not automated: `refund()`
exists in the adapter, but no screen calls it yet.

## dLocal Go — removed

dLocal Go was removed in October 2026 at the owner's request: Yavaya uses
Stripe only. There is no dLocal Go code, route or setting left; its old
addresses answer "not found", and past purchases made through it keep their
label on the tokens page. `DLOCALGO_*` variables, if any remain on a Railway
service, do nothing and can be deleted.

## PayPal — removed

PayPal was removed in October 2026 at the owner's request: Stripe takes cards
from every country, so nothing on Yavaya pays through PayPal. There is no
PayPal code, route or setting left; `PAYPAL_*` variables, if any remain on a
Railway service, do nothing and can be deleted.

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

The photographs in `public/art/` are illustrative scenes generated for Yavaya
with an image model through the owner's ElevenLabs account, re-encoded here to
WebP at three widths with no metadata.

Since 20 October 2026 the district scenes and the trust, reputation, tokens
and districts pages show people — the same stills as the video guide (shot ids
in `tools/guide-video/shots.py`: mercadito m4, services s2, work t3,
yavayago g3, community c2, animals a3, sanctuary card sa4 and page sa1,
impact c7, tokens cf6, reputation cf1, trust i7, districts i1). The earlier
set had no people at all, which made the site read as a travel brochure. The
rule that keeps them honest: a person in a photograph never carries a name,
rating, price or listing, so nothing can be taken for a real member, seller or
review — and the footer says the photographs are illustrative. The hero,
roadmap, status, transparency and street scenes are places and stay so.

Since 21 October 2026 each photograph with people in it also says
"Ilustración" in a corner where it is shown (`ArtNote` in
`src/ui/site/art.tsx`): the district photographs, and the districts, trust,
reputation, tokens and sanctuary page photographs. The footer's sentence was
true but far from the picture.

**Inspected 21 October 2026**, every photograph at full size: no malformed
hands, faces or garbled lettering; the landscapes, dress and architecture
read as Central American. One thing to know: the banknotes in the Mercadito
and YavayaGo scenes look like US dollars — right for El Salvador, Panamá and
much of Nicaragua's trade, not for every market.

**The home page's market moves on phones** (since 24 October 2026):
`public/art/market-film-720.mp4`, seven seconds made from the market
illustration with a video model through the owner's Higgsfield account, then
re-cut to the phone still's exact rectangle so it starts on that picture
(`tools/hero-film/` at the repository root has the brief, the script and why
it plays once instead of looping). It is an illustration like the still: the
"Ilustración" note stays over it. It plays only where the visit can afford
it — phone width, a 4G connection or one that does not say, no data saver,
no reduced motion — and only after the page has loaded (`hero-film.tsx`);
everyone else sees the still. Inspected frame by frame on 24 October: no
malformed people, warped stalls or lettering.

**The home page's own pictures come from the owner's design** (since 30
October 2026): the street in the hero on wide screens, the artisan in the
Mercadito feature, the town under the video guide, and the window on each
district card. The design was a single 1024×1536 image, so each picture is
the design's own region with its words and buttons rebuilt away (LaMa) and
enlarged 4× (Real-ESRGAN), by `tools/cinematic/` at the repository root, whose
README lists every region, its size and how to reproduce it. They are
upscaled, not native: the hero's largest file is 3840 wide but holds the
detail of a 1024-pixel original. Phones keep the earlier upright market crop
in the hero, so its film still starts on the same frame. The districts' own
pages keep their full 1920-pixel photographs; the home cards show only the
top of the design's pictures, where the card's panel did not cover them. The
earlier seller photograph (`mercadito-seller-*`) was retired with this
change.

**Inspected 30 October 2026**, every new picture at full size and at the size
it is shown. One flaw was found and removed: a jar at the edge of the
Servicios picture carried three garbled letters, now rebuilt away (the mask
is in `extract.py`). No other lettering, and faces and hands are well formed
at the sizes they are shown. Things to know: the raised hand on the Santuario
card has two fingertips that run together when enlarged several times (at
the card's size it reads as an open hand); at 100% sunlight makes blotches on
the Servicios man's face; where the hero's shortcuts were rebuilt, two
walkers' legs fade into the dark street, under the hero's own shading; and
the enlargement shows its nature up close: embroidery and stone look painted
rather than photographed.

**Real photography is the next step** (owner's to arrange: a photographer in
Managua, signed releases from everyone pictured). Replacing any image is a
file swap: keep the name and run `node scripts/derive-images.mjs`, which makes
every smaller width from the largest file (`<name>-<width>.webp`; a test
checks that each width a page offers exists). Remove the name from
`PEOPLE_PHOTOS` once a photograph shows real, consenting people rather than an
illustration — and only then.

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
Without it the space is closed and `/status` says why. Rotate it with
`SAFE_SPACE_KEY_PREVIOUS` (§ Rotating keys) and nothing becomes unreadable.

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
- **The daily light** (owner's request, Oct 2026): 365 texts written by
  Yavaya — 92 prayers, 91 sayings, 91 quotes, 91 blessings — in
  `src/i18n/daily/`, one a day, on the Sanctuary page. Deliberately not tied
  to any one tradition: no names, scriptures or formulas of a particular
  church, so anyone can read them. Quotes are Yavaya's own and unsigned on
  purpose (attributing a line to someone who did not say it would be
  inventing); sayings are popular proverbs. The text changes at 08:00 local
  (`SANCTUARY_RULES.dailyLightLocalHour`; 14:00 UTC without a place) and the
  `daily-light` job sends members one in-app note then — category `daily`,
  switchable in settings, and never included in the email summary. Members
  tick which kinds they want; default and "none ticked" mean all four, which
  is what gives a different text every day of the year. Fewer kinds repeat
  through the year on a shorter cycle. Editing a text is safe; inserting or
  removing one shifts every later day.

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
| `mercadito.free_open_listings` | 5 | Owner decision, October 2026 (see "Revenue model") |
| `mercadito.feature_days` | 7 | same |
| Publishing within the allowance | free | `billable_actions` row `mercadito.publish_listing_free` (cost 0) |
| Each open listing beyond the allowance | 1 token | `billable_actions` row `mercadito.publish_listing` |
| Featuring a listing ("Destacado") | 3 tokens | `billable_actions` row `mercadito.feature_listing` |
| Renewing a listing ("Renovar": back to the top of the newest) | 1 token | `billable_actions` row `mercadito.renew_listing`; owner decision, October 2026 |
| `mercadito.renew_cooldown_hours` | 24 | Our default, not the owner's: stops renewing from becoming a permanent top spot (that is featuring, and it is labelled) |
| `mercadito.renew_suggest_after_days` | 7 | Our default: when "Mis publicaciones" suggests renewing or featuring a listing |

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
7. **Prohibited items.** There is no written list of what may not be sold,
   and nothing in the form refuses a category of goods; moderation acts on
   reports. Whether animals may be sold here is also undecided (Animales
   handles adoption). Roxi declines the obvious cases on her own — see
   "Roxi" below.

8. **Renewal and saved searches.** A renewed listing sorts by its renewal
   (`renewed_at`) but keeps its publication date, so it is not announced again
   to saved searches whose members have already seen it, and the date buyers
   see is the real one. The nudge on "Mis publicaciones" is by age only:
   Yavaya does not count listing views, so it never claims a listing "got no
   visits".

## Display names

| Setting | Default | Source |
| --- | --- | --- |
| `identity.free_name_changes` | 1 | Owner decision, October 2026 |
| Each change after the free ones | 1 token | `billable_actions` row `identity.change_name`; owner decision |
| `identity.name_change_cooldown_days` | 30 | Owner asked to prevent abuse; 30 is our recommendation |
| `identity.previous_name_days` | 30 | same |

The YAY ID, reputation and history do not change with the name, and every
change is audited with the old and new name. Against abuse (a seller hopping
names to shake off buyers who know them):

- **A wait between changes.** Any two changes are at least 30 days apart,
  free or paid; a token buys a change, never a faster one. A change refused
  for being too soon costs nothing, and Settings says when the next one is
  allowed instead of showing the form.
- **The previous name stays visible.** For 30 days after a change, the public
  profile says "Antes se llamaba «…»" under the name, next to the badges a
  member cannot hide.

## Revenue model (owner decision, October 2026)

The owner asked for the strategy with the best chance of reaching the most
people and earning the most, and delegated the choice. The decision: **free
for people, paid by those who earn, growth first.**

- **People never need tokens to take part.** Publishing in Mercadito is free
  up to `mercadito.free_open_listings` open listings at once (5). Asking for
  help, Community, Animales, Santuario, Trabajo, YavayaGo and Espacio Violeta
  were already free and stay free.
- **Tokens buy speed and volume, which only sellers need.** Featuring a
  listing for `mercadito.feature_days` (7) costs 3 tokens; each open listing
  beyond the allowance costs 1. A featured listing is always labelled
  "Destacado" on its card and page: paid placement is never passed off as
  relevance.
- **Tokens can be earned without paying.** The starter allocation (2 a day
  for the first week) and invitations: when an invited friend verifies their
  email, the inviter gets `referral.inviter_reward` (3) and the friend
  `referral.invitee_reward` (2), up to `referral.max_rewarded_per_month` (10)
  rewarded invitations per inviter in any 30 days. An invitation where
  registration found the two accounts sharing a device or network is recorded
  as `suspect` and never pays.
- **Payment rail:** Stripe (cards) is the only live one. That fits the model:
  the people who pay are sellers and businesses, the members most likely to
  hold a card. Mobile wallets, carrier billing and cash collection are not
  configured; see "Payments".

**Phase 2 (built):** the same rule in two more districts. Basic use stays
free; what is paid is optional placement, or volume beyond a free allowance.

| Setting / action | Default | What it is |
| --- | --- | --- |
| `work.free_open_posts` | 2 | Open Trabajo posts an employer may have at once without paying |
| `work.publish_post` | 3 tokens | Each open post beyond the allowance (employers only; candidates never pay) |
| `work.feature_post` / `work.feature_days` | 3 tokens / 7 days | Featured post: first on the board, labelled |
| `go.feature_store` / `go.feature_days` | 5 tokens / 7 days | Featured store: first among open stores, labelled; still no commission on orders |

Placement rules live in `server/domains/promotion/featured.ts`: a feature
lasts a fixed number of days, buying again extends it from its end, and
whatever is featured carries a "Destacado" label.

**Not built yet:** priority placement for professionals in Servicios needs
a public directory of professionals first, which does not exist yet.

## Places, the location bar and live messages

**Mexico** was opened as a launch market by owner decision (October 2026),
alongside the seven countries of Central America. It stays filed under North
America, where it belongs, and uses the same rules, prices and districts.
Stripe takes cards from Mexico as from everywhere else. Two things
are still undecided and flagged here, not guessed:
- whether Mexico needs its own legal text (terms, privacy under the LFPDPPP);
- whether the brand tagline ("…de Centroamérica") should change.

**Places.** 6,531 cities and towns across the eight launch countries, from
GeoNames (licence CC BY 4.0; attribution is in the site footer and in
`src/server/db/seed/places-data.ts`). In Central America the import includes
every municipal seat, plus every other populated place with at least 1,000
inhabitants. Mexico has several times more small localities than the rest
together, so there the line is INEGI's own urban threshold: every municipal
seat, plus every locality of 2,500 or more (4,369 places).
Each row carries its GeoNames population and coordinates. Operations can
deactivate a place, or add one, in the `locations` table.

- **Data caveats.** Population figures are GeoNames' and of uneven age, and
  some towns have none. El Salvador's places follow its 2024 municipal
  reorganisation.
- **Size tiers** (`PLACE_RULES.sizeTiers`: large / medium / small city and
  town) are a reading aid in the picker only. They set no price, limit or
  permission. The thresholds (250k / 75k for cities, 10k / 5k for towns) are
  a judgement, not specification.

**Location bar.** The place chosen in the header is stored in a cookie,
`yav_place`, holding the place code. It is a browsing preference, not a
claim about where someone is.

- Every district list defaults to that place, and `?place=all` overrides it.
- "Use my location" rounds the browser's position to about 1 km, sends it
  once to `/api/places?near=`, and keeps only the nearest town. The position
  itself is never stored.

**Live messages.** These are the rotating messages at the bottom of the
screen, and they show real `activity_events` only. When nothing has
happened, nothing is shown. The pacing (`LIVE_FEED_RULES`) is a judgement:

| Setting | Value |
|---|---|
| First message after the page opens | 8 s |
| Time each message stays on screen | 7 s |
| Gap between messages | 25 s when busy, 50 s when quiet |
| A seen message may repeat after | 30 min |
| Refetch interval | 2 min |
| "Pausar" lasts | 45 min |

- The "En vivo" pill brings the messages back at any time. Pausing and
  seen-state are kept in that browser's localStorage.
- The messages never appear in Espacio Violeta, in administration or in
  sign-in.
- **What is announced:**
  - Mercadito listings.
  - Service requests, except in sensitive categories.
  - Jobs and projects.
  - Animals listed, adopted, lost and found.
  - First approval of a YavayaGo store.
  - Approval of a church.
  - Community requests and offers of help.
- **Never announced:** prayers, family support, anything from Espacio
  Violeta, or any person's name.

## IP geolocation — `GEOIP_PROVIDER`

**Needed for:** suggesting a country and city on first visit.

**Not built** (audit, 31 October 2026). No provider is integrated: the
variable takes only `none` or `unconfigured`, and neither looks anything up.
`/status` used to show the row as REAL for `none`; it now always reads
REQUIRES_CONFIGURATION, because a setting is not an implementation.

**Until built:** users pick their location manually, and GPS is offered
with explicit permission. This is a degraded experience, not a broken one.

**To build it:** choose a provider (a local IP-to-city database file, which
sends nothing anywhere, or an API), then: suggest a country or city only,
never a street; keep nothing — look up, suggest, discard the address; and
say so where the suggestion appears. The privacy page needs a line before it
ships.

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

## Configuration readiness — audit of 31 October 2026

What each outstanding dependency has, lacks, and needs from whom. None of
them is shown as working: each reads REQUIRES_CONFIGURATION on `/status`.

| Dependency | Built | Missing | Needs credentials or a provider | Blocked? | Tested without credentials | Administrator steps |
| --- | --- | --- | --- | --- | --- | --- |
| **SMS delivery** (`sms_delivery`) | The whole phone-verification flow at `/account/phone`, its limits, the reputation rule, Mercadito's "verified by SMS" (see SMS delivery above). | Only the provider account. | Yes — Twilio Verify (`TWILIO_*`). Costs per message. | Deferred by the owner (20 October 2026); drivers' phones are confirmed by a reviewer calling them meanwhile. | `tests/integration/phone.test.ts` runs the flow against the local console verifier, which sends nothing and never counts as delivery. | Create the Twilio Verify service, enable the launch countries, set the four variables. |
| **Approximate location by IP** (`geoip`) | Nothing beyond the setting and manual/GPS location. | The provider adapter, consent wording and a keep-nothing rule (see IP geolocation above). | Yes — a provider (database file or API). | Not built; nothing depends on it. | — | Choose the provider; then it is a code change. |
| **Mercadito automatic screening** (`listing_screening`) | Exact duplicate photos across sellers and repeated titles are flagged to the moderation queue; people decide, with appeals. | Reverse image search, scam-keyword lists, price-anomaly thresholds. | Reverse image search needs a provider; keywords and thresholds need an operations decision per category and market. | Not built. Human review and appeals stay mandatory for any consequential decision, whatever is added. | The duplicate checks are covered by `tests/integration/mercadito.test.ts`. | Decide the keyword lists and thresholds; choose an image-search provider. |
| **Trabajo subscriptions** (`work_subscriptions`) | Trabajo itself; card payments (Stripe) for tokens. | Recurring billing, plans and a start date. | Uses the existing Stripe account; needs Stripe Billing products. | Waiting for the owner's start date; applying is free and employers post up to 2 open offers free (beyond that, tokens). | — | Owner: set plans, prices and start date; then it is a code change. |

Nothing here was switched on, invented or charged for by this audit.

## Infrastructure decisions still open

**Rate limit storage.** Counters currently live in Postgres — correct and
consistent, but a write per request. Move to Redis if that write becomes a
bottleneck; the interface in `security/rate-limit.ts` is the seam.

**Session store.** Sessions are database rows. Fine to five figures of
concurrent users; revisit with the same seam if not.

**Nearby search.** `geography.nearby` uses a bounding box plus a haversine sort,
so there is no PostGIS dependency. If proximity search becomes hot, install
PostGIS and rewrite that one function.

**Background jobs.** Settled: the `yavaya-scheduler` service runs
`jobs.cjs tick` every 15 minutes (the full list is in `DEPLOYMENT.md`), and a
failed job reaches the admins in the daily operations email. The open part
is scale — the tick runs jobs one after another, which is fine while each
takes seconds.

**Audit chain verification.** Settled: `verify-audit-chain` runs once a day
in the tick, and a broken chain fails the job, which is reported like any
other failure.

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
  notification duties differ across the eight launch countries (Mexico's
  LFPDPPP included). The audit log
  is append-only by design, which interacts with erasure requests: the
  resolution is to store no personal data in audit metadata (already the rule)
  and to erase the referenced records instead.

## YavayaGo

**Live.** Stores, menus, checked drivers, cash orders and live tracking.

**Money.** Customers pay the driver in cash on delivery, the price the store
set. Stores set their own delivery fee, which goes to the driver. Yavaya
takes no commission, per the specification ("Stream 4 — not immediately;
build trust with restaurants first"). Card payment for orders is **not
built**: it would make Yavaya collect money on behalf of stores and drivers
and pay it out, which needs a marketplace payout account and a decision per
country. It shows as `REQUIRES_CONFIGURATION` on /status.

**Drivers.** The specification requires identity, a matching photo, vehicle
details, a verified phone, and background checks where legally possible.
SMS is not configured (Twilio), so a reviewer confirms the phone by calling
it; approval is refused without that box or an SMS-verified phone, and
without a note of what was checked. Background checks are left to the
reviewer's judgement and local law and are recorded in the note.
`KYC_PROVIDER=manual` reflects that documents go to this human review.

**Maps.** Tiles from OpenFreeMap (no key, no account), proxied through
`/api/map` so visitors never contact a third party. If OpenFreeMap ever has
to be replaced, only that route's `UPSTREAM` and allowed paths change. The
map worker is a copy of `maplibre-gl`'s own file in
`public/maplibre/<version>/`; upgrading the package means copying the new
one (a unit test checks they match).

**Live map** (`/yavayago/mapa`, since 31 October 2026). Open to anyone,
with or without an account and with or without anything happening. It shows
approved stores (their addresses are public on their own pages) and counts —
deliveries under way and drivers online — never a position of a driver, a
customer or a drop-off. The driver count is withheld below
`go.public_map_min_count` (3, `GO_RULES.publicMapMinCount`), so a lone driver
in a small town is not pointed out; this is a privacy floor we chose, not a
specification rule. A signed-in member also sees their own order or trip on
it through the same authorised tracking endpoint as its own page. With no
deliveries it says so and offers a **demonstration**: one made-up delivery,
drawn in the browser from `src/config/go-demo.ts` (steps in metres from the
launch city's centre, whichever city `go.launch_place` names), labelled
"DEMOSTRACIÓN — DATOS SIMULADOS" throughout, never sent to or stored by the
server. Its route is drawn, not routed, and its arrival estimate is marked
simulated. `/status` lists it as DEMO (`live_map_demo`); real tracking is the
separate `live_tracking` row, REAL with its evidence stated (proved end to
end by tests/e2e/live-tracking.cjs; no real order yet, as no store is
approved).

**Operational guesses, not specification** (in `GO_RULES`, retunable):
15 minutes for a store to answer before the order is cancelled; 2 open cash
orders per customer; 15 km maximum straight-line delivery distance; one
order at a time per driver; drivers offline after 20 idle minutes; exact
drop-off points and phone numbers erased 24 hours after an order ends.

### How YavayaGo earns — decided October 2026 (owner's delegation)

The owner asked for the model that works best, after weighing the big
delivery apps' commission model, and delegated every choice. Decided:

- **No commission, ever, on orders.** Restaurants in the region already pay
  30–35% to the incumbent and say so publicly; "0% commission" is the one
  promise a newcomer can make that they cannot, and it is what every
  restaurant contacted has been told.
- **A flat monthly plan instead** (`GO_PLAN_RULES`): 30 delivered orders a
  month free; beyond that the Plan Negocio, US$19 a month. A flat fee is
  collectable in a cash economy; a per-order commission would have to be
  invoiced and chased store by store.
- **Founding stores free for 12 months** from approval, for stores approved
  on or before 31 March 2027 (`foundingUntil`, set at first approval and
  backfilled by the seed for stores approved earlier). This keeps the
  promise made in the outreach.
- **Billing the plan is not built.** Stores see where they stand ("este mes:
  12 de 30 gratis"); nothing is charged and nothing is blocked. Charging needs
  a recurring card or transfer collection per country — `REQUIRES_CONFIGURATION`
  on /status. Stores are to be told before it starts.
- **Launch city: Managua** (`GO_TRIP_RULES.launchPlaceCode`, mirrored to the
  `go.launch_place` setting). Chosen because the team, the WhatsApp line and
  the first restaurants are there, motorcycle delivery is already how the
  city orders, and one city with real volume beats eight countries with
  none. Other cities keep working; Managua is what is shown first.
- **Gift orders** ("es para otra persona"): anyone can order to someone
  else's door — family abroad sending food home is the target. The person
  receiving pays in cash; paying by card from abroad needs the same payout
  capability as card orders and is not built.
- **WhatsApp ordering link**: each approved store gets its public page link
  and a ready text for its WhatsApp Business auto-reply, so orders arrive
  structured instead of typed out by hand.

### Viajes y mandados — rides, parcels, errands, personal help

**Live.** A customer asks for a checked driver for a ride (motorcycle or
car), a parcel, an errand (buy or collect something, with a spending limit
repaid in cash on delivery) or personal help in one place. They propose the
fare; online drivers in that city whose vehicle fits accept it or counter;
the customer chooses. Cash to the driver, who keeps all of it.

Privacy: before a driver is chosen, drivers see the kind, description,
distance, fare and a ~1 km rough area — never the door or the phone. The
chosen driver sees both until the trip ends; they are erased 24 hours later.
The customer can share a live, read-only link with someone they trust; it
dies when the trip ends. One job per driver at a time, across orders and
trips.

Operational guesses (in `GO_TRIP_RULES`, retunable): 20 minutes to choose
before a request closes; one active request per customer; 60 km maximum;
one passenger on a motorcycle, four in a car; counter-offers at most five
times the customer's price.

**Owner decisions still open:**
- **Legality of paid rides per country.** Carrying passengers for money may
  need a transport licence or permit (and insurance) in some countries.
  Yavaya connects people and checks drivers; it does not hold a transport
  licence. Confirm with a local lawyer before promoting rides outside
  parcels and errands.
- **Driver earnings model.** Drivers keep 100% at launch. A future weekly
  driver plan (never a cut of fares) is possible; not decided.
- **Ratings after a trip** are not built.

## Continuar con Google — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

Built and tested; the button appears (in the bar at the top of every page, and
on the sign-in and registration pages) only once both values are set. Until
then `/status` lists it as requiring configuration and nothing shows.

To switch it on (about ten minutes, in a Google account the owner controls):

1. Google Cloud Console → create a project (for example "Yavaya").
2. **APIs & Services → OAuth consent screen**: user type *External*; app name
   *Yavaya*; support email; authorized domain `yavaya.lat`; links to
   `https://yavaya.lat/privacy` and `https://yavaya.lat/terms`. Scopes: only
   `openid`, `email`, `profile` — these need no review by Google. Then
   **Publish app** (in "Testing" only listed test users can sign in).
3. **Credentials → Create credentials → OAuth client ID**: type *Web
   application*; authorized redirect URI exactly
   `https://yavaya.lat/auth/google/callback`; authorized JavaScript origin
   `https://yavaya.lat` (needed by the sign-in prompt shown on arrival).
4. Put the client ID and client secret in the web service's variables on
   Railway as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The deploy that
   follows turns the button on; nothing else changes.

How accounts are matched and why is in `SECURITY.md` → *Continuar con Google*.

## Signing out after inactivity (owner decision, October 2026)

A member is signed out after **two hours without activity**
(`SESSION_RULES.idleTimeoutMinutes`); using the site keeps the session open.
The bar at the top then says the session closed and offers the quickest way
back in — with Google, a single tap to the same account.

**"Mantener mi sesión iniciada"** (since 31 October 2026, asked for in the
owner's stabilisation brief). A box on the sign-in page, never ticked for the
person, applies to whichever way they sign in — email, Google or the
two-step code. A remembered session is signed out after **14 days without
use** (`SESSION_RULES.rememberedIdleDays`, our figure: the usual practice for
an explicit opt-in) instead of two hours; everything else stays: the 30-day
absolute lifetime, signing out, "sign out the other devices", immediate end
on suspension. Remembered sessions are marked in Settings → "where you're
signed in". On a remembered device, turning on two-step needs a sign-in from
the last hour (`SESSION_RULES.freshSignInMinutes`), because it is the one
change a stranger holding the phone could use to lock the owner out;
changing the password already asks for the current one, and turning two-step
off asks for a code. Session tokens are still re-issued only at sign-in (see
docs/SECURITY.md, Known gaps).

## Account sanctions

**Built** (`/admin/members`, `/admin/appeals`, `sanctions.ts`): find a member
by YAY ID or exact email; suspend (moderators and admins), ban (admins),
reinstate (admins), sign out on every device, and turn off two-step for a
member who lost their phone (admins, after checking who they are outside
Yavaya). Every action needs a written note, goes into the member's
enforcement record and the audit log in one transaction, and ends the
member's sessions where it should. Staff can be sanctioned only by an admin;
nobody can sanction themselves.

**The policy** — decided by Claude on the owner's delegation, 20 October 2026
("I'll let you make the best idea about suspension"). The numbers are
`SANCTION_RULES`; the owner can change any of it.

- **Length.** A suspension is 1, 7 or 30 days, or "until an admin reviews"
  for suspected fraud still being checked. The moderator chooses; 7 days is
  the default in the form. Nothing ties a length to a reason: the same reason
  ranges from a first spam post to an organised campaign, and a table would
  pretend otherwise. A ban is permanent and admin-only.
- **It ends on time.** The scheduler's `lift-suspensions` job lifts every
  timed suspension that has run out (within 15 minutes), records it as a
  system action, and emails the member.
- **The member is told, every time.** Suspended, banned, reinstated, or an
  appeal answered: an email in their language with the reason *category*
  (never the internal note), when it ends in their own time zone, and how to
  appeal. Signing in with the right password now says the account cannot be
  used and points to that email; a wrong password still reads the same as an
  unknown address, so nothing is learned about who is registered.
- **One appeal per sanction**, within 14 days, from a sealed link in the
  email (the member cannot sign in to prove who they are, so the link does).
  Between 20 and 1,500 characters; capped per network. Appeals wait in
  `/admin/appeals` and in the operations inbox (`users.restore`, i.e.
  admins). The admin keeps or lifts the sanction and writes the member an
  answer, which is emailed. An appeal on a sanction that ends meanwhile is
  closed as `ended` and leaves the queue.
- **A ban replaces a running suspension**, so there is one sanction in force
  and one appeal, and the clock can never undo a ban.

**Still open:** no sanction notice goes out while email is unconfigured (the
action still happens and is audited). Warnings and feature restrictions
(`enforcement_records.type` has both) have no tool yet.

## Two-step sign-in — `TWO_STEP_KEY`

**Set:** 32 or more random characters on the web service. It seals each
member's authenticator secret. Without it two-step sign-in is not offered.

**Rotate it only with `TWO_STEP_KEY_PREVIOUS`** (§ Rotating keys). Replaced
on its own, secrets sealed under the old key cannot be opened and every
member with two-step on would have to sign in with a backup code and set it
up again; with the previous value kept, the release step reseals them and
nobody notices.

Free to run: nothing is sent. Members find it in Settings → Cuenta y
seguridad.

## Password reset

Needs only email delivery. The link points at `APP_URL/login/nueva-clave`,
so `APP_URL` must be the public address.

## The guide in video — `GUIDE_UPLOAD_TOKEN`

Ten films explain Yavaya in Spanish: one per district (shown at the top of
that district's page, and on `/trust` and `/tokens` for trust and tokens) and
the whole guide stitched into one at `/guia`, with chapters. The list, running
times and chapter times are in `src/config/guide.ts`.

- **Where the files are.** The MP4s are too large for the repository. They
  live in the media bucket under `guide/` and `/video/[file]` streams them in
  byte ranges, so a viewer starts at once and can jump to any chapter. Only the
  names in `config/guide.ts` are served. Posters and captions (WebVTT) are
  small and ship in `public/guide/`.
- **Subtitles.** Every film has Spanish captions and English subtitles, cue for
  cue on the same timings (a test checks this). English subtitles switch on by
  themselves for someone reading the site in English; Spanish captions stay
  off unless chosen, since the narration is Spanish. A re-cut needs both
  tracks rewritten: the timings come from the new narration.
- **Two sizes.** Each film exists in 1080p and 720p; touch screens get 720p,
  which is lighter on a phone's data plan.
- **Putting files in the bucket.** The bucket's keys are not handed out, so the
  site writes them itself through `/api/ops/guide-upload` (multipart, 8 MB
  parts). That route answers 404 unless `GUIDE_UPLOAD_TOKEN` is set (32+
  characters) and is called with it. Set it for an upload, then blank it.
  Each finished file is recorded in the audit log as `guide.video_uploaded`.
- **A new cut.** Raise `GUIDE_VERSION`: every file name changes, so browsers
  that cached the old films (they are cached for a year) fetch the new ones.
- **What the films show.** The scenes are illustrations made for Yavaya, and
  the page says so; the screens are real captures of the live site. Every fact
  narrated is taken from the site as it works today. When a district changes,
  its film can say something that is no longer true, so a change to a
  district's rules is also a reason to re-cut its film.

## Roxi — `ROXI_AGENT_ID`, `ELEVENLABS_API_KEY`

Roxi, the assistant, is an ElevenLabs agent (`docs/roxi/README.md` has the
agent, its tools, knowledge and tests). The capability register reports her
`REAL` when `ROXI_AGENT_ID` is set, and the button appears for signed-in
members; without it there is no button and `/status` says why.

- **`ROXI_AGENT_ID`** — the agent's id (`agent_…`). Not a secret: the browser
  needs it to connect.
- **`ELEVENLABS_API_KEY`** — optional. With it, `/api/roxi/start` asks
  ElevenLabs for a signed link valid for one conversation and hands that to
  the member's browser; the agent can then be switched to *require* signed
  links (agent → Security → enable authentication), so nobody can open a
  conversation outside Yavaya even from an allowed origin. Without it, the
  browser connects with the agent id and what holds the agent is its allowlist
  (`yavaya.lat`, `www.yavaya.lat`, origin header required) and its own limits.
  Give the key only the Agents permission.

**What it costs and what limits it.** Every conversation is billed by
ElevenLabs (voice and model). Three ceilings hold the bill:

| Limit | Value | Where |
| --- | --- | --- |
| Conversations per member per day | 20 | `RATE_LIMITS.roxiConversation` |
| Searches and account look-ups per member per hour | 120 | `RATE_LIMITS.roxiLookup` |
| Conversation length | 10 minutes | agent setting |
| Conversations at once / per day, all members | 25 / 1 500 | agent setting |

These are cost guards set as technical defaults, not business rules from the
specification; raise or lower them with the ElevenLabs plan.

**Language model.** ElevenLabs runs the model. Claude models did not answer
on this workspace, so Roxi uses OpenAI's top model with Google's as backup;
the privacy page names both. Changing provider means changing the privacy
page (`/privacy#roxi`) in the same change.

**Voice.** A premade multilingual voice is in use until a Latin American
voice from the library is added to the workspace (see the README).

**Signed links are not on yet.** Production has no `ELEVENLABS_API_KEY`, so
conversations open with the agent id and rely on the allowlist. Adding the
key (Agents permission only) and then enabling authentication on the agent
is the owner's step; until then `/status` is right to call Roxi `REAL`, and
`docs/SECURITY.md` names the gap.

**Welcome voice notes — who and how often.** The owner asked for a voice
note from Roxi to the community manager, Tania Ponce, and to the
administrator, on their next two logins, ten seconds after signing in.
`src/server/domains/roxi/welcome.ts` decides from the account: an active
`community_manager` role **and** a display name whose first word is Tania;
or the `admin` role **and** the address in `PRIMARY_ADMIN_EMAIL`. So, in
production:

- Tania's account must hold the community manager role and her display name
  must start with "Tania". Neither can be checked from outside production.
- The counts are per login, not per day; reloading does not use one up.

| Setting | Default | `system_settings` key |
| --- | --- | --- |
| Logins that hear a note | 2 | `roxi.welcome_plays` |
| Seconds after signing in | 10 | `roxi.welcome_delay_seconds` |
| Minutes a login counts as fresh | 15 | `roxi.welcome_login_window_minutes` |

The fifteen-minute window is a technical default (so a tab left open since
yesterday does not suddenly speak), not part of the request.

**Check-in and simulated call.** Both are page elements governed by the
member's own settings, never by Yavaya: Silenciosa shows neither, Disponible
(the default) only the check-in, Proactiva also the call. The numbers below
are technical defaults chosen to be unintrusive; the 15–20 minutes and 20
seconds came from the request. They live in `ROXI_RULES` and are not yet
mirrored into `system_settings`, because they are read in the browser.

| Rule | Default |
| --- | --- |
| Check-in after visible browsing | 6 minutes, at most once a day, visible 20 s |
| Call after visible browsing | random 15–20 minutes, Proactiva only |
| Call rings for | 20 seconds |
| Rest after a declined or missed call | 24 hours |
| Quiet hours (member can change) | 21:00–07:00 |

**Open item — terms text.** The terms still say a purchase "con efectivo o
transferencia puede tardar más", left from when dLocal Go was planned. Tokens
are bought by card through Stripe only; the sentence is the owner's legal
text and has not been changed. Roxi's knowledge carries it, but her prompt
says Stripe card is the only way to buy tokens, and a test holds her to it.

**Open decision — what may not be sold.** Mercadito has no written list of
prohibited items (see "Mercadito — rules and open decisions"), so Roxi quotes
none. She declines on her own to prepare listings for weapons, drugs,
identity documents, things that look stolen, or photos of people, and sends
anyone wanting to sell an animal to Animales, where animals are adopted.
Whether animals may be sold on Mercadito at all is **undecided**; the
publish form does not refuse it. When the owner decides a list, it belongs in
`MERCADITO_RULES` (so the form enforces it) and Roxi's knowledge picks it up
on the next regeneration.

---

## Identity Studio — what is built and what is open

"Personalizar mi perfil" (`/account/profile`), linked from the member area
and from the member's own profile. How it is secured is in docs/SECURITY.md,
"Identity Studio".

**Works with nothing to configure** (`identity_studio`, `REAL`): designs from
the library, 40 themes, colours, cards, typography, sections (order, folding,
the highlighted one, presentation modes), who sees each section, favourites,
saved looks, a live preview as computer or phone and as yourself, a member or
a visitor, switching between the draft and the published version, drafts,
publishing, undo,
reporting a profile, and the moderators' queue (`/admin/profiles`, also in
the operations panel).

**Needs media storage** (`identity_photos`, measured like the Mercadito): a
member's own profile photo, cover and background. Without storage the Studio
does not offer the upload. Production has it (see "Media storage").

**The design library.** Made and measured by `tools/identity-assets/` (its
README says how), served from `public/identity/`. Every design is a file a
member can apply:

| Collection | Designs | What they are |
| --- | --- | --- |
| Sovereign Surfaces (backgrounds) | 50 | The owner's liquid-gold artwork, as supplied: **1672×941, not 4K**. 49 drawn by shaders at 3840×2160. |
| Infinite Horizons (covers) | 50 | 8 of Yavaya's own photographs (7 at 2560 wide, the crater lake at 1920). 42 illustrated landscapes at 3840×2160. |
| Identity Frames | 40 | Vector (SVG), sharp at any size. |
| Personal Expression (ornaments) | 40 | Vector (SVG): corners, crests, trims. |
| Professional Signature | 30 | 3840×2160. |
| Signature Realms | 40 themes | Named combinations of the designs above and the Studio's settings — configurations, not image files. |

That is 210 design files (575 files on disk counting every size, 23 MB) and
40 themes. The build counts 186 distinct drawings: the other 24 designs are a
drawing again in another metal or colour, and are variants, not new work.
The contact sheet that came with the directive was a visual reference only;
nothing in the library is cut from it.

**Defaults, not the owner's decisions** (`PROFILE_STUDIO_RULES` unless said):

| Setting | Value |
| --- | --- |
| Headline · about · link label · link address | 80 · 600 · 40 · 300 characters |
| Links · languages | 5 · 6 |
| Favourites · saved looks | 60 · 12 |
| Own photos kept at once | 12 (older unused ones are removed on publishing) |
| Uploads · draft saves · publishes per hour | 30 · 240 · 30 |
| Photo visibility | Everyone or signed-in members; a profile photo cannot be "only me" |
| Why a profile can be reported (`profile-reports.ts`) | Offensive or harassment; impersonation or deception; scam; spam or advertising; other |
| What a moderator's reset removes | The published look and draft, the member's words, saved looks and profile photos. Not the account, listings, reputation or anything in a district. |

**Not built yet:**

- **Roxi inside the Studio** (the directive's priority 3): suggestions or help
  while customising. Roxi changes nothing in a profile today.
- **Customising the private member area** (`/account`): its layout is fixed.
- **Side-by-side comparison of two designs.** The Studio compares the draft
  with the published profile, and a design is previewed by applying it (undo
  takes it back).

---

## Visit statistics — nothing to configure

Yavaya counts its own visits (`src/server/domains/stats`, the owner reads them
at `/admin/visitas`): pages viewed per day, where visits arrive from, the kind
of screen, real-phone speed (the five Web Vitals), and a funnel from visit to
new account to first real action. It needs no key and no third party, and it
is `REAL` in the register (`site_stats`).

What it stores is in docs/SECURITY.md, "Visit statistics": daily counts only,
no cookie, address or identifier. Espacio Violeta, the panels and browsers
that send Do Not Track or Global Privacy Control are never counted, nor is
the owner's own browsing.

| Setting | Value | Status |
| --- | --- | --- |
| How long daily counts are kept | 395 days (13 months) | **Default, not the owner's decision.** Long enough to compare a month with the same month a year before. `SITE_STATS_RULES.keepDays`, mirrored as `stats.keep_days`; the privacy page quotes it. |
| Clock a "day" is counted on | `America/Managua` | Follows the launch city. Change `SITE_STATS_RULES.dayTimeZone` if the main market moves. |
| Events one network may send per minute | 120 | Abuse guard, held in memory only. |
| New page addresses accepted per day | 300 | Past this, unknown routes count as `(other)` — a guard against filling the table with invented paths. |

What the funnel's last step counts as "did something" is a list of audit
actions (`FIRST_ACTIONS` in the stats service): publishing in a district,
replying in Community, asking for or answering a service, applying for work
or an adoption, reporting a lost animal, ordering or asking for a trip,
registering a church. Change it there.
