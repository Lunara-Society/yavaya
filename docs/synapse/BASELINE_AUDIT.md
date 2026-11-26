# Baseline audit of the existing Yavaya ecosystem (Chapter 01)

Written 26 November 2026 against repository commit `c468e5b` and the live site
https://yavaya.lat (production build `a4117771`, deployed 21 November 2026).
Nothing in production was changed to produce it. It is the verified starting
point for the Android and iOS work: later chapters compare against it, and a
claim here is only as good as the evidence column next to it.

States used: **REAL** works and was verified · **DEMO** works with sample
content, labelled · **MOCK** simulated, never shown as real · **BLOCKED** built
or buildable, but waiting for credentials, a provider or an owner decision ·
**NOT IMPLEMENTED** not built. The website's own register
(`platform/src/config/capabilities.ts`, shown live at `/status`) uses REAL /
DEMO / MOCK / REQUIRES_CONFIGURATION; its REQUIRES_CONFIGURATION rows are
split here into BLOCKED (built, waiting) and NOT IMPLEMENTED (not built).

## 1. How the baseline was established

| Check | Method | Result |
| --- | --- | --- |
| Inventory | read the code: `package.json`, routes, domains, schema, migrations, tests, docs | §2 |
| Live capability register | `/status` page on yavaya.lat, 26 Nov 2026 | 65 rows: 56 REAL, 8 REQUIRES_CONFIGURATION, 1 DEMO, 0 MOCK |
| Type safety | `npm run typecheck` (`tsc --noEmit`, strict) in `platform/` | pass, 0 errors |
| Platform test suite | `npm test` (Vitest) in `platform/`, against a local Postgres 16 | **94 test files, 851 tests, all pass** (524 s) |
| Mobile test suite | `npm test` in `mobile/` | 18 of 18 pass (Chapter 01 prototype) |
| Phone rendering and speed | Playwright, real Chromium, 360 × 780 phone viewport, cache off, 12 public pages, two profiles: mid (no throttling) and low (4× CPU slowdown, 1.6 Mbps, 150 ms latency) | §5; screenshots in this chapter's scratch work, not committed |
| Production health | Railway deployments, HTTP 5xx log since 25 Nov; Sentry unresolved issues (14 days) | §6 |
| Dependencies | `npm audit` in `platform/` (production and full tree) and `mobile/` | §6 |
| Security headers | response headers of https://yavaya.lat/ | §4 |

Not checked: anything signed in on the live site (no test account was used, by
rule), real payments, real deliveries, and the app on a phone.

## 2. The verified inventory

| Layer | What exists | Evidence |
| --- | --- | --- |
| Frontend | Next.js 15 App Router, React 19, server components; Spanish and English dictionaries; light, dark and system themes; MapLibre maps; Three.js (Yavaya Play) | `platform/package.json`, `src/app/` |
| Backend | the same Next.js app: 31 Server Action files with 176 exported actions (the main way the site writes data) and 77 API route files in 20 groups (`roxi` 20, `mirador` 16, `go` 10, `play` 10, the rest 1–2 each) | `src/app/**/actions.ts`, `src/app/api/` |
| Domains | 31 server domains (identity, access, trust, tokens, payments, reputation, moderation, mercadito, services, work, go, community, sanctuary, animals, boards, mirador, roxi, whatsapp, geography, notifications, media, play, referrals, promotion, safe-space, …) | `src/server/domains/` |
| Database | PostgreSQL through Drizzle: 129 tables, 58 migrations | `src/server/db/` |
| Background work | `yavaya-scheduler` service runs `npm run jobs` every 15 minutes (digests, expiry, video processing with ffmpeg) | `src/server/jobs/run.ts`, Railway |
| Messaging | `whatsapp-bridge` service and the WhatsApp Graph API (v21.0) | Railway services, `src/server/domains/whatsapp/` |
| Storage | S3-compatible object storage (`STORAGE_PROVIDER`, `S3_*`) for photos and video | `src/config/` |
| Email | provider-selectable (`EMAIL_PROVIDER`: Resend or SMTP) | `src/config/` |
| Hosting | Railway project `yavaya`: four services (yavaya-web, yavaya-scheduler, whatsapp-bridge, Postgres), **one environment (production)**, region `iad` (US East). Railway builds only when `platform/**` changes | Railway |
| Mobile | `mobile/`: Expo SDK 58 bridge (WebView of yavaya.lat) plus the Chapter 01 prototype (Roxi's reconstruction and Presence) | `mobile/` |

## 3. Functionality preservation matrix

Every row must keep working through the mobile work. "Mobile path" says how
the app should carry it: **Reuse** (the web screen inside the app, unchanged),
**Adapt** (server logic reused as it is; a new API entry point, a native screen
or a platform setting needed), **New native** (needs a native capability the
website cannot provide).

### Platform

| System | State | Evidence | Mobile path | Must be preserved |
| --- | --- | --- | --- | --- |
| Accounts and YAY ID (8-digit permanent id) | REAL | `/status`; identity domain; tests | Adapt: native sign-up later; web screen meanwhile | one person, one account; the YAY ID |
| Password sign-in, sessions (scrypt, idle expiry, revocable) | REAL | `src/server/auth/`; tests | **Adapt**: sessions are httpOnly, SameSite=Lax cookies; native calls need a mobile session (see §7) | idle expiry, revocation, sign-out everywhere |
| Email verification, password reset | REAL | `/status`; tests | Reuse | single-use links; reset signs out all devices |
| Two-step sign-in (TOTP, backup codes) | REAL | `/status`; `two-step-cookies.ts` | Reuse now; Adapt with native sign-in | free, optional |
| Continue with Google | REAL on the web; **BLOCKED in the app** | Google refuses sign-in in embedded WebViews | **New native**: system browser tab or native Google sign-in, returning through an App Link | Google sign-in only for confirmed emails |
| Roles and permissions | REAL | server-checked | Reuse (server) | every check stays on the server |
| Geography (region to neighbourhood, 8 countries, GeoNames) | REAL | `/status`; geography domain; `api/places` | Reuse (server); Adapt for native pickers | the person chooses precision, never the GPS |
| Approximate location from IP | NOT IMPLEMENTED | `/status` | not needed in the app: the phone can ask with permission | keep nothing if ever built |
| Language (es/en, device detection) and theme | REAL | `/status` | Adapt: native screens read the same choice | Spanish first |
| Identity studio, profile photos, share card with QR | REAL | `/status` | Reuse | draft until published; per-item privacy |
| Notifications: bell inside Yavaya, daily email digest, per-category preferences | REAL | `/status`; notifications domain | Reuse | one-click digest off |
| **Push notifications** | NOT IMPLEMENTED | no service worker, no PushManager, no device-token table | **New native**: Expo push / FCM, a device-token table, sending from the scheduler | the same categories and preferences as the bell |
| Visit statistics (no cookies, no identifiers) | REAL | `/status`; `api/metrics` | Adapt: count app screens the same way | no identifiers |
| Live activity (real events only) | REAL | `/status`; `api/live` | Reuse | never filled with made-up activity |

### Trust, money and records

| System | State | Evidence | Mobile path | Must be preserved |
| --- | --- | --- | --- | --- |
| One person one account, 72-hour new-account watch | REAL | `/status`; trust domain | Reuse (server) | combined signals plus human review |
| Audit log (append-only, hash-chained) | REAL | `/status` | Reuse | append-only |
| Tokens ledger (atomic, exactly once per action) | REAL | `/status`; tokens domain; tests | Reuse (server); Adapt for native balance screens | exactly-once accounting |
| Invitations with token rewards | REAL | `/status` | Reuse; App Links make invite links open the app | monthly cap; no reward for one's own accounts |
| Reputation rules, Trust Shield | REAL | `/status` | Reuse | strict privacy limit on the public summary |
| Rate limits, moderation (reports, tickets, sanctions), appeals | REAL | `/status`; `/apelacion` | Reuse | server-side counters |
| Stripe card payments (tokens, Play gems, Roxi Pro and Max) | REAL | `/status`; REST adapter `payments/providers/stripe.ts`; webhooks | **Adapt, with a store-policy decision first** (§6, risk R1) | credited only when Stripe confirms |
| Trabajo professional subscriptions | NOT IMPLEMENTED | `/status` | — | applying stays free |
| Plan Negocio billing (YavayaGo stores) | NOT IMPLEMENTED | `/status`: nothing is charged | — | stores told before it starts |
| Card payment in YavayaGo | NOT IMPLEMENTED (regulatory decision) | `/status`: cash on delivery | — | cash flows untouched |
| SMS phone verification | BLOCKED (owner deferred it, 20 Oct 2026; needs Twilio Verify credentials) | `/status` | Reuse once set | — |
| Identity documents (drivers, personal verification) | REAL | `/status` | Reuse; the app can later add a native document camera | human review |

### Districts and publishing

| System | State | Evidence | Mobile path | Must be preserved |
| --- | --- | --- | --- | --- |
| Mercadito (free listings up to 5 active, boosts with tokens, WhatsApp contact) and its moderation | REAL | `/status`; `mercadito/actions.ts`; tests | Reuse now; native screens later need **API endpoints**, because writes are Server Actions | free listing limit; reputation before contact |
| Services (requests, "Lo necesito hoy", licences checked by hand, reviews) | REAL | `/status` | Reuse; Adapt later | hand-checked licences |
| Trabajo (offers with visible pay, verified employers, applications) | REAL | `/status` | Reuse; Adapt later | employer verification by a person |
| Community (local help, prayer wall, family support) | REAL | `/status` | Reuse | moderation |
| Community groups | NOT IMPLEMENTED | `/status` | — | — |
| Santuario (reviewed churches, schedules, daily word; the candle, seven days, no account needed) | REAL | `/status` | Reuse; native share sheet later | the candle works without an account |
| Animales (care guide with certificate, verified rescuers, adoptions, one-month follow-up, lost-pet poster) | REAL | `/status` | Reuse | — |
| Eight board districts (Hogar, Movilidad, Salud y Bienestar, Aprender, Negocios, Campo, Barrio, Diáspora) | REAL | `/status`; `boards/actions.ts` | Reuse | free posting; WhatsApp contact for members |
| Espacio Violeta (women's protected space, encrypted messages, verified professionals) | REAL | `/status`; `api/violeta` | Reuse; **no screenshots or previews of its content in any native layer** | encryption and separation |
| Advanced automatic review (stolen photos, scam words, impossible prices) | NOT IMPLEMENTED (exact duplicates are flagged today) | `/status` | — | — |
| Publishing flow: forms, photos (cropped on the phone), voice dictation, Roxi drafts that the member confirms | REAL on the web | Server Actions; `api/media`; `ui/components/dictate.tsx` | Reuse; **dictation is at risk in the app** (risk R4); photos come in through file inputs with `capture`, which the WebView must hand to the camera (not tested on a phone) | the member always confirms; Roxi never publishes |
| Mirador short videos (feeds, likes, comments, follow, save, share, report; commerce links) | REAL (opens to all when the owner switches it on) | `/status`; 16 API routes; ffmpeg job | Reuse; Adapt to a native player later | the owner's switch |
| Mirador offers ("Lo quiero", paid in person) | REAL | `/status` | Reuse | Yavaya never holds that money |
| Roxi's voice on a video (tokens, price shown first, refund on failure) | REAL | `/status` | Reuse | refund on failure |
| Talking Roxi video (HeyGen) | BLOCKED (needs `HEYGEN_API_KEY` in the app's settings) | task record | — | — |

### YavayaGo

| System | State | Evidence | Mobile path | Must be preserved |
| --- | --- | --- | --- | --- |
| Deliveries from local stores; stores and drivers reviewed by a person; cash | REAL | `/status`; 10 API routes; `yavayago/actions.ts` | Reuse; Adapt later | human review; cash |
| Trips and errands (offer a price, accept or counter-offer) | REAL | `/status`; `yavayago/viajes` | Reuse | — |
| Live tracking for the customer during an order | REAL (proved end to end in a browser; not yet seen on a real order) | `/status`; `navigator.geolocation` in `ui/go/map.tsx` | **New native for drivers**: a browser, or the WebView, stops sending location when the screen is off; a reliable driver app needs a foreground location service (and Play's location declarations) | location only during the order, only to that customer |
| Public live map (stores and totals, never a person) | REAL | `/status`; `api/map` | Reuse | never a person's position |
| Tracking demonstration | DEMO, on purpose (labelled "DEMOSTRACIÓN — DATOS SIMULADOS", never stored) | `src/config/go-demo.ts` | Reuse | always labelled |

### Roxi, voice and integrations

| System | State | Evidence | Mobile path | Must be preserved |
| --- | --- | --- | --- | --- |
| Roxi assistant, voice or text (ElevenLabs agent in the browser) | REAL | `/status`; `@elevenlabs/client`; 20 API routes; CSP allows `api.elevenlabs.io` | Reuse in the WebView (microphone allowed for the site); Chapter 01's Presence already opens her real panel. Native hosting with ElevenLabs' mobile SDK is possible later and must be evaluated, not assumed | one Roxi: the same agent, tools and limits |
| Roxi plans (Pro, Max; metered credits) | REAL | `/status`; `roxi/billing.ts` | Adapt, under the store-policy decision (R1) | metering by real cost |
| Roxi memory (goals, tasks, reminders, moments; encrypted, deletable) | REAL | `/status` | Reuse; reminders are the first candidate for push | encryption; deletion |
| Roxi with the member's MCP servers and APIs | REAL | `/status` | Reuse | asks before changing anything |
| Roxi with Gmail and Calendar | BLOCKED (Google Cloud setup and `ROXI_GOOGLE_CONNECTOR`; Gmail scopes need Google verification beyond 100 accounts) | `/status` | — | — |
| WhatsApp inbox (encrypted) and Roxi on WhatsApp | REAL | `/status`; whatsapp-bridge | Reuse (server) | the team can step in |
| Image storage | REAL | `/status` | Reuse | — |
| Yavaya Play (3D game, Genesis characters, Vault, gems) | REAL | `/status`; 10 API routes; Three.js and WebAssembly | Reuse in the WebView; purchases fall under R1 | cosmetics only, never advantages |

### Administration

| System | State | Evidence | Mobile path | Must be preserved |
| --- | --- | --- | --- | --- |
| Admin area (a home page and 18 sections: members, profiles, appeals, moderation queues per district, YavayaGo, Violeta, WhatsApp, Vault, team, visits, organisations) | REAL | `src/app/admin/` | **Keep on the web.** No native admin; reachable in the app's WebView for staff | server-side permission checks |
| Status page generated from the register | REAL | `/status` | Reuse; the app shows the same truth | never claims more than the register |

## 4. Security baseline

| Area | Finding |
| --- | --- |
| Sessions | httpOnly, SameSite=Lax cookies; scrypt passwords; idle expiry; revocation; two-step optional |
| Writes from outside the site | API writes require a same-origin `Origin` header (`sameOrigin`, repeated in 11 files). A native app's requests carry no browser origin, so **no existing write endpoint can be called from native code as it is** |
| Headers (live) | strict CSP with a per-request nonce and `strict-dynamic`; `frame-ancestors 'none'`; HSTS with preload; `X-Frame-Options: DENY`; `Permissions-Policy: camera=(), microphone=(self), payment=(), geolocation=(self)` |
| What the headers mean for the app | the site never opens the camera itself (photos use file inputs, which is why `camera=()` is safe); the microphone and location work only for the site's own pages, which the app keeps inside its WebView. The site cannot be framed, so the app must load it at the top level, as it does |
| Audit and abuse | hash-chained append-only audit log; server-side rate limits; human review for trust decisions |
| Sensitive spaces | Espacio Violeta messages encrypted; Roxi memory encrypted |
| Known gaps | listed in `platform/docs/SECURITY.md` → Known gaps; not repeated here |

## 5. Mobile responsiveness and performance (measured)

Twelve public pages at 360 × 780, cache disabled, from this machine (Railway
runs in US East; real Central American latency is higher and is not measured
here).

| Page | Low tier: first paint / largest paint | Mid tier: largest paint | Transferred (cold, low tier) | JavaScript | Layout shift |
| --- | --- | --- | --- | --- | --- |
| Home | 1.57 s / 1.57 s | 1.82 s (first visit, cold server, 842 ms to first byte) | 618 KB | 242 KB | 0.004 |
| District pages (Mercadito, YavayaGo, Comunidad, Servicios, Trabajo, Animales, Santuario, Barrio) | 1.32–1.64 s / 1.32–1.72 s | 0.29–0.73 s | 462–509 KB | 235–240 KB | 0–0.028 |
| Sign-in | 1.56 s / 1.56 s | 0.26 s | 507 KB | 235 KB | 0.001 |
| Mirador | 0.99 s / 0.99 s | 0.26 s | 282 KB (1.8 MB with video on the mid run) | 148 KB | 0 |
| Yavaya Play | 1.27 s / **3.44 s** | 0.92 s | 498 KB (2.2 MB with the character on the mid run) | 351 KB | 0 |

- Server time to first byte for district pages: 77–127 ms.
- No page scrolls sideways at 360 px. Each page has 14–17 visible text
  elements under 12 px (bottom navigation labels and small print); readable,
  but at the floor for older eyes.
- Against the Synapse budget ([PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md)):
  every page is under the 1.5 MB first-screen data budget on the low tier, and
  every page paints well inside the 4 s cold-start budget except Play's
  largest paint, which is still under it.
- Seen in the screenshots, to confirm on a phone: on district pages a
  header button renders as an empty circle beside the location pin; the
  Mercadito subtitle runs under its sign illustration.

## 6. Production risks and technical debt

| # | Risk or debt | Severity | Evidence | Recommendation (not done in this chapter) |
| --- | --- | --- | --- | --- |
| R1 | **Digital goods sold through Stripe inside a store app.** Tokens, Play gems, Vault items and Roxi Pro/Max are digital. Google Play's payments policy expects Google Play Billing for in-app purchases of digital goods; Apple's rules expect In-App Purchase. Physical services (YavayaGo, paid in cash) are not affected | **High, release-blocking** | `/status`; `mobile/src/links.ts` keeps Stripe Checkout inside the app | owner decision before any store submission: add store billing for digital items, or keep their purchase out of the store builds; check the current policy text and any regional programmes at that time |
| R2 | Native code cannot write to the platform: writes are Server Actions or same-origin API routes | High for native screens | §2, §4 | a versioned mobile API (`/api/mobile/v1`) that wraps the same domain functions, with token sessions; no new business logic |
| R3 | Google sign-in does not work inside the app | Medium | Google's embedded-WebView policy | system browser tab or native sign-in, returning by App Link (`/.well-known/assetlinks.json`) |
| R4 | Voice dictation in posting forms uses the browser's speech recognition, which Android's WebView is not known to provide | Medium | `ui/components/dictate.tsx` | test on the phone first; if absent, native dictation bridged into the form |
| R5 | Driver location stops when the screen is off | Medium (YavayaGo reliability) | `navigator.geolocation` in `ui/go/map.tsx` | native foreground location service for drivers only, during an order |
| R6 | Known advisories in production dependencies: Next.js ≤ 15.5.28 (image-optimisation SVG bypass; HttpOnly cookie exposure through an internal header on the Edge runtime), Zod < 4.6.6 (memory exhaustion on oversized constrained collections), the Sentry plugin chain (glob, minimatch), Vite (listed through tooling). 8 in production (6 moderate, 2 high); 18 in the full tree, the 2 critical ones in test tooling only (Vitest, Tinypool) | Medium | `npm audit` | upgrade in a normal platform change with the full test suite; fixes are available and none is a major version |
| R7 | One environment only: every change lands straight in production | Medium | Railway | a staging environment before a mobile API exists (costs Railway resources: owner decision) |
| R8 | Hosting in US East only | Low to medium (latency for Central America) | Railway region `iad` | measure from the region with real phones before deciding anything |
| R9 | Scanner requests to made-up paths answer 500 instead of 404 (`POST /RSC/*.txt`, Sentry YAVAYA-WEB-K, 2 hits on 25 Nov) | Low | Railway HTTP log; Sentry | treat unparseable action posts as 400/404 |
| D1 | `sameOrigin` repeated in 11 route files | Debt | §4 | one shared guard, extended for the mobile API's token path |
| D2 | No push channel; no device registry | Debt / gap | §3 | push with the first native release |
| D3 | Mobile prototype repeats colours in two components; no native design tokens | Debt | `mobile/src/synapse/` | native tokens module (planned) |
| D4 | Universal preview APK is 132 MB | Debt | Chapter 01 build | the Play app bundle splits per device; measure on the first bundle |
| D5 | Platform tests need a local Postgres | Note | `tests/global-setup.ts` | fine; the cloud environment has Postgres 16 |

Production health on 26 Nov 2026: last web deploy succeeded on 21 Nov; later
commits touched only `mobile/` and `docs/` and were skipped by Railway as
designed. Since 25 Nov the only HTTP 5xx answers were the two scanner requests
above. Sentry shows one unresolved issue in 14 days (the same one).

## 7. Recommended Android and iOS architecture

Based on the findings above, not on preference.

1. **Keep one Expo / React Native codebase for Android and iOS** (already in
   place and building on EAS). Nothing found needs a separate native project:
   the hard native needs (push, a location foreground service, native sign-in,
   dictation, store billing) all have Expo modules or config plugins.
2. **Keep the website as the complete fallback, inside the app.** Every one of
   the 56 REAL capabilities already works in the WebView except the four marked
   in §3 (Google sign-in, and three at risk until a phone test: dictation,
   camera hand-off, background driver location). Native screens replace web
   screens one at a time; anything not rebuilt stays the web page; Classic can
   always return to it.
3. **A thin, versioned mobile API on the existing server**
   (`platform/src/app/api/mobile/v1/`): each endpoint calls the same domain
   function the Server Action calls today, with the same authorisation and the
   same rate limits. No business rule is written twice, and nothing in the app
   decides what the server should.
4. **Mobile sessions by token**: a sign-in exchange that issues a revocable
   session in the same sessions table, stored in the phone's secure storage and
   sent as a bearer token. Same-origin checks stay for the website; the bearer
   path is the mobile API's own protection. The WebView keeps its cookie
   session; a one-time hand-off links the two so the member signs in once.
5. **Native first where the website cannot follow**, in this order: push
   notifications (bell categories, Roxi reminders), App Links (invites, shares,
   the candle, Google sign-in return), dictation, then the driver's location
   service. Then the Synapse surfaces (Roxi's Presence and spatial
   information), then district screens by measured use.
6. **Store billing decided before the first store release** (R1).
7. **Staging before the mobile API** (R7), so the app is tested against a copy
   of production rather than production itself.

## 8. What this chapter did not do

No production code, configuration, data or deployment was changed. No store
submission. No paid service was added. The dependency upgrades, the mobile
API, push and the staging environment are recommendations for chapters the
owner authorises.
