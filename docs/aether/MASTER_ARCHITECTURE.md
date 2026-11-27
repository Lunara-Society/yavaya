# Master architecture

The single map of Yavaya for the Aether × Roxi Anima programme: what exists,
in what state, where it lives, and how the thirteen systems of the
[constitution](CONSTITUTION.md) attach to it. Written 27 November 2026 (AX-01)
from the code at commit `46d73ac`, the live site, and the verified baseline of
26 November ([BASELINE_AUDIT.md](../synapse/BASELINE_AUDIT.md)). Update it in
the chapter that changes any of it.

## 1. Rules that bind every chapter

In order of precedence:

1. The owner's standing rules (in [handoff-yavaya.md](../synapse/handoff-yavaya.md) §4):
   nothing published without approval; no secrets in the repository; no
   redesign of production functionality; visible redesigns ship behind
   **Classic**; Roxi prepares, the member confirms (she never publishes,
   pays or sends); obsidian black and gold, and Roxi's glow is gold, not
   violet (the owner, 27 Nov); the owner's email and phone number never
   repeated.
2. The [constitution](CONSTITUTION.md): production software, not mockups;
   references are behaviour, never data; Roxi composes behaviour from
   content, never per-item animations; never invent facts; the app works
   fully without Roxi or effects; cinematic effects never delay an action.
3. The platform's own rules ([platform/CLAUDE.md](../../platform/CLAUDE.md)):
   no mock presented as real; no hard-coded user strings, geography or
   business numbers; authorization on the server; money and reputation only
   through their services; audit inside the transaction.

**The repository is public** (GitHub reports `Lunara-Society/yavaya` as
public, 27 Nov 2026). Everything committed can be read by anyone. Unreleased
design material and brand-critical masters are kept in private storage until
the owner decides otherwise (decision AX-D004).

## 2. States

| Label | Meaning | Was (Synapse / website register) |
| --- | --- | --- |
| **REAL** | works, and was verified where it must work | REAL |
| **DEMO** | works with sample content that is labelled and never counted | DEMO |
| **MOCK** | simulated; never shown as real | MOCK (none exist) |
| **INCOMPLETE** | built, but unfinished or not yet verified where it must work (for app features: never run on a phone) | "REAL (code); NOT TESTED on a phone" |
| **NEEDS CONFIGURATION** | built, waiting for credentials, a provider or an owner decision | BLOCKED / REQUIRES_CONFIGURATION (built) |
| **NOT IMPLEMENTED** | not built (used for capabilities the plan needs) | NOT IMPLEMENTED / REQUIRES_CONFIGURATION (not built) |

The first five are the constitution's labels for existing capabilities.
NOT IMPLEMENTED keeps the owner's earlier rule for what does not exist yet
(decision AX-D003).

## 3. The system as it is

```
 Members ──► yavaya.lat (Next.js 15 / React 19, platform/) ──► PostgreSQL (134 tables, Drizzle)
   │            │  Server Actions (website only) + API routes          │
   │            │  /api/mobile/v1/* (bearer sessions)                  ├─ yavaya-scheduler (jobs every 15 min)
   │            │                                                      ├─ whatsapp-bridge
   │            └─ /status renders src/config/capabilities.ts          └─ S3 storage, Resend email, Stripe
   │
   └─► Android app 0.4.0 (Expo SDK 58, RN 0.88.1, Skia 2.14, Reanimated 4.7.1, mobile/)
          native shell + district lists + Roxi (ElevenLabs over WebRTC) + website screens signed in
          Classic = the Chapter 00 website bridge
```

| Layer | Today | Evidence |
| --- | --- | --- |
| Website and API | Next.js app: 31 server-action files (176 actions), 77+ API route files, 31 domains | BASELINE_AUDIT §2; `platform/src/` |
| Mobile API | `auth/{start,finish,exchange,session,web}`, `config`, `feed/[district]` (mercadito, work, animals, community), `roxi/start` | `platform/src/app/api/mobile/v1/` |
| App content contract | `FeedItem { id, title, detail, place, image, path, featured, at }`, read only | `feed/[district]/route.ts` |
| Database | 134 tables; for this programme: `mercadito_listings`, `work_posts`, `animals_listings`, `community_posts`/`replies`/`supports`, `board_posts`, `services_*` (incl. `services_reviews`), `sanctuary_*` (incl. `sanctuary_devotionals`), `go_*`, `roxi_*`, `mirador_*` | `platform/src/server/db/schema/` |
| Not in the database | member-to-member messages (outside Espacio Violeta), saved listings ("favourites"; Mercadito has saved searches), likes on community posts (there are "supports"), course enrolment, appointments | same, by search |
| Hosting | Railway production builds `main` when `/platform/**` changes; staging builds the work branch; CI on every push | `README.md`; `.github/workflows/ci.yml` |
| App builds | EAS project `@yavaya/yavaya`; preview APK 0.4.0 (build `27cc5ff7`) | handoff §8 |

## 4. Capability register (27 Nov 2026)

Website rows: verified in the 26 Nov baseline; the live `/status` page read
again on 27 Nov shows the same totals (56 real, 8 needing configuration,
1 demo, 0 mock). App rows: from the Synapse records and Chapter 09, with the
stricter rule that nothing is REAL until it has run on a phone.

### Website: platform

| Capability | State | Note |
| --- | --- | --- |
| Accounts and YAY ID | REAL | one person, one account |
| Password sign-in, sessions (idle expiry, revocable) | REAL | |
| Email verification, password reset | REAL | |
| Two-step sign-in (TOTP, backup codes) | REAL | |
| Continue with Google (website) | REAL | |
| Roles and permissions (server-checked) | REAL | |
| Geography (8 countries, region to neighbourhood) | REAL | the person chooses precision |
| Approximate location from IP | NOT IMPLEMENTED | register: requires configuration; no provider integrated |
| Language es/en, theme | REAL | Spanish first |
| Identity studio, profile photos, share card | REAL | |
| Bell notifications, daily digest, preferences | REAL | |
| Push notifications (web or app) | NOT IMPLEMENTED | no device registry or sender |
| Visit statistics (no identifiers), live activity (real events only) | REAL | |

### Website: trust and money

| Capability | State | Note |
| --- | --- | --- |
| One person one account, 72-hour watch; audit log (append-only, hash-chained) | REAL | |
| Tokens ledger (exactly once), invitations with rewards | REAL | |
| Reputation, Trust Shield; rate limits, moderation, appeals | REAL | |
| Stripe card payments (tokens, Play gems, Roxi Pro and Max) | REAL | web only; store billing in the app needs the owner's decision (R1) |
| Identity documents (drivers, personal verification) | REAL | human review |
| SMS phone verification | NEEDS CONFIGURATION | Twilio Verify; deferred by the owner |
| Trabajo professional subscriptions | NOT IMPLEMENTED | applying stays free |
| Plan Negocio billing (YavayaGo stores) | NOT IMPLEMENTED | nothing is charged |
| Card payment in YavayaGo | NOT IMPLEMENTED | cash; a regulatory decision |

### Website: districts and publishing (15 districts in `config/districts.ts`)

| Capability | State | Note |
| --- | --- | --- |
| Mercadito: free listings (5 active), boosts with tokens, WhatsApp contact, saved searches, moderation | REAL | categories: vehicles, real estate, electronics, services, fashion, home, sports, classifieds |
| Servicios: requests, "Lo necesito hoy", licences checked by hand, reviews | REAL | |
| Trabajo: offers with visible pay, verified employers, applications | REAL | |
| Comunidad: local help, replies, supports, prayer wall, family support | REAL | posts readable only when signed in |
| Community groups | NOT IMPLEMENTED | |
| Santuario: reviewed churches, schedules, word for the day, the candle (no account needed) | REAL | |
| Animales: care guide and certificate, verified rescuers, adoption applications, follow-up, lost-pet poster | REAL | |
| Board districts: Hogar, Movilidad, Salud y Bienestar, Aprender, Negocios, Campo, Barrio, Diáspora (posts, photos, alerts, WhatsApp contact) | REAL | one engine, each with its own layout and subdistricts (`config/boards.ts`) |
| Espacio Violeta (protected space, encrypted messages) | REAL | never shown in any native preview or screenshot |
| Publishing: forms, photos, dictation, Roxi drafts the member confirms | REAL | website |
| Advanced automatic review (stolen photos, scam words, impossible prices) | NOT IMPLEMENTED | exact duplicates flagged |
| Mirador short videos and offers; Roxi's voice on a video | REAL | behind the owner's switch |
| Talking Roxi video (HeyGen) | NEEDS CONFIGURATION | `HEYGEN_API_KEY` |

### Website: YavayaGo

| Capability | State | Note |
| --- | --- | --- |
| Deliveries from local stores; stores and drivers reviewed by a person; cash | REAL | |
| Trips and errands: the member offers a price, drivers accept or counter-offer | REAL | not a fixed fare |
| Live tracking for the customer during an order | REAL | proved end to end in a browser; not yet seen on a real order |
| Public live map (stores and totals, never a person) | REAL | |
| Tracking demonstration | DEMO | labelled "DEMOSTRACIÓN — DATOS SIMULADOS", never stored |
| Driver location with the screen off | NOT IMPLEMENTED | needs a native foreground service |

### Website: Roxi and integrations

| Capability | State | Note |
| --- | --- | --- |
| Roxi assistant, voice or text (ElevenLabs agent) with tools (search, open, draft) | REAL | one Roxi: same agent, tools and limits everywhere |
| Roxi plans (Pro, Max; metered credits), memory, member's MCP servers and APIs | REAL | |
| Roxi with Gmail and Calendar | NEEDS CONFIGURATION | Google Cloud setup and verification |
| WhatsApp inbox and Roxi on WhatsApp; image storage | REAL | |
| Yavaya Play (Three.js, Genesis characters, Vault) | REAL | |
| Admin area; status page | REAL | the admin area stays on the web |

### Android app 0.4.0

| Capability | State | Note |
| --- | --- | --- |
| EAS project, package `yavaya.lat`, build profiles, keystore held by EAS | REAL | |
| Preview APK 0.4.0 built and inspected | REAL | install and use on the owner's Samsung not yet reported |
| Remote flags (`/api/mobile/v1/config`), staging server | REAL | live on both servers |
| Sign-in in the phone's browser (PKCE), bearer sessions, website screens signed in | INCOMPLETE | local end-to-end test passes; not run on a phone |
| Roxi's voice in the app (WebRTC, her tools, metered) | INCOMPLETE | builds; not run on a phone |
| Roxi's hologram (Skia shader, her picture and depth map) | INCOMPLETE | rendered by Skia off the phone; frame rate not measured |
| Native lists: Mercadito, Trabajo, Animales, Comunidad (real data, read only) | INCOMPLETE | endpoints live; production has 0 items; not run on a phone |
| Other districts open their website screen | INCOMPLETE | not run on a phone |
| Design system, holographic engine, reconstruction (seven techniques), motion, sounds, haptics, awakening, Laboratorio | INCOMPLETE | code, tests, Skia compiler and browser runs; never on a phone |
| Classic switch | INCOMPLETE | not run on a phone |
| Dictation and photo capture inside the app | INCOMPLETE | dictation at risk (BASELINE_AUDIT R4) |
| EAS Update channels | INCOMPLETE | configured; no update published |
| Production bundle, Google Play release | NOT IMPLEMENTED | needs the owner's approval, the listing and a closed test |
| iOS app | NOT IMPLEMENTED | needs an Apple Developer account |
| App Links, push, store billing | NOT IMPLEMENTED | |
| Native search, item details, saved items, native write forms | NOT IMPLEMENTED | the API accepts bearer sessions; no native screens use it for writes |
| 3D Roxi | NOT IMPLEMENTED | pipeline chosen in AX-03 ([ROXI_PIPELINE.md](ROXI_PIPELINE.md)) |

## 5. The thirteen systems on the code

| System | Purpose | Lives (or will live) | State today |
| --- | --- | --- | --- |
| **AETHER** | visual architecture and rendering | `mobile/src/render/`, `design/`, `motion/` | INCOMPLETE: Skia 2D/2.5D engine built; palette is still "Halo" (obsidian, violet, champagne); no 3D renderer |
| **ANIMA** | Roxi's digital human architecture | `mobile/src/roxi/`, `render/RoxiHologram.tsx`; new `mobile/src/anima/` | 2.5D portrait only (INCOMPLETE); digital human NOT IMPLEMENTED |
| **CORPUS** | anatomy, skeleton, locomotion | rigged GLB + runtime (`anima/corpus`) | NOT IMPLEMENTED |
| **VITALIS** | breathing, blinking, involuntary motion | procedural layer on CORPUS | NOT IMPLEMENTED (the website's Guardian breathes; Roxi does not) |
| **SENTIENCE** | context, emotion, decisions | ElevenLabs agent + tools (REAL on the web) + a state model in the app | decisions REAL on the web; expression NOT IMPLEMENTED |
| **VOX** | voice, listening, lip sync | `roxi/RoxiVoiceProvider.tsx` | voice INCOMPLETE in the app; lip sync NOT IMPLEMENTED (the hologram follows the voice level only) |
| **IMPOSSIBILIS** | holographic transformations, material states | `render/Reconstruct.tsx`, `techniques.ts`; 3D shaders later | 2D reconstruction INCOMPLETE; material states (glass body, gold light) NOT IMPLEMENTED |
| **OMNIPRAESENTIA** | where Roxi is, at what scale | `roxi/RoxiIsland.tsx`, Presence pill | docked island INCOMPLETE; placement and scale system NOT IMPLEMENTED |
| **SYMBIOSIS** | Roxi acting with the interface | `roxi/tools.ts` (results cards, open page, drafts) | tools REAL on the web, INCOMPLETE in the app; pointing at real elements NOT IMPLEMENTED |
| **ABSOLUTA** | one orchestrator over all Roxi systems | new `anima/absoluta` | NOT IMPLEMENTED |
| **GENESIS** | complete cinematic experiences | `screens/Awakening.tsx`; concept film `design/films/oro/` | awakening INCOMPLETE; the film is design only |
| **INFINITY** | everyday functional flows | native screens + mobile API | lists INCOMPLETE; search, details, actions NOT IMPLEMENTED (website screens cover them today) |
| **TRANSCENDENCE** | responsive optical interface | `render/HoloPanel.tsx`, `motion/`, `useTilt.ts` | glass panels, shared elements, tilt INCOMPLETE; prisms, orbits, refraction NOT IMPLEMENTED |

## 6. Roxi's behaviour architecture (design, NOT IMPLEMENTED)

The constitution's core requirement is that a listing nobody has seen before
(an antique piano, a tractor) gets the same quality of presentation as the
references, with no per-item work. Nothing in the design names a product,
category or price.

```
 domain rows ─► Content descriptor ─► Intent ─► Planner ─► Primitives ─► Choreographer ─► Renderer + Voice
 (same visibility    (server-built,     (member's    (chooses by    (present, point_at,   (layout geometry,     (2.5D or 3D tier;
  as the website)     typed, translated  voice, text   descriptor     hold_up, fan_out,     camera, IK targets,   VOX speaks only
                      real fields only)  or tap)       shape)         compare, guide...)    UI highlights)        descriptor facts)
```

**Content descriptor v1** (extends today's `FeedItem`; built by a new mobile
endpoint from the same domain functions):

```ts
type ContentDescriptor = {
  id: string; district: DistrictKey; kind: string;        // 'listing' | 'job' | 'animal' | 'post' | 'board_post' | ...
  title: string; summary?: string;
  price?: { minor: number; currency: string; text: string };   // only when the domain row has one
  place?: { name: string; precision: 'country' | 'region' | 'city' | 'neighbourhood' };
  media: { url: string; width: number; height: number; kind: 'photo' | 'video' }[];
  attributes: { key: string; label: string; value: string }[]; // domain fields, translated on the server
  badges: { key: string; label: string }[];                    // facts the server checked (verified employer...)
  actions: { key: string; label: string; requires: 'none' | 'member'; path: string }[];
  provenance: { publishedAt: string; byDisplayName?: string };
  path: string;                                                // the real page
};
```

Guards that make "never invent" testable:

- Roxi's spoken facts come only from descriptor fields; a transcript audit
  checks every number, price, place, rating and availability claim against
  the descriptor ([PRODUCTION_TESTS.md](PRODUCTION_TESTS.md), T-FACTS-01).
- She offers only the descriptor's `actions`; each still runs through the
  real server rules (she prepares, the member confirms).
- Missing media or attributes change the plan (no photo: she presents the
  title card; no price: she does not mention one), never the facts.
- Primitives target layout geometry (where a card is on screen), so the same
  `point_at` works for any item. The catalogue is in
  [ROXI_CAPABILITIES.md](ROXI_CAPABILITIES.md) §3.

## 7. Rendering tiers

Refined in AX-04 into the degradation ladder L4 Full, L3 Balanced, L2 Lite,
L1 Basic and L0 Classic, per layer
([PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md) §6, AX-D030);
decorative particles are out (VISUAL_LANGUAGE §1). The table below is the
AX-01 view.

| Tier | What draws | Who gets it |
| --- | --- | --- |
| Classic | the previous app (website bridge) | anyone who switches; always one tap away |
| Lite | native screens with views only, no canvases | weakest phones, reduce motion, battery saver |
| Aether | Skia: glass, light ribbons, particles, Roxi's 2.5D portrait | default until 3D passes its tests |
| Anima 3D | one shared GPU view for 3D Roxi and the Guardian (renderer chosen by measurement, AX-D009) | phones that hold the budget |
| Video | pre-rendered cinematic moments with a still fallback | moments too costly in real time; never blocking |

The rule from Synapse stands: an effect counts only if it runs on a phone
of about 120 USD. Budgets: [PERFORMANCE_BUDGET.md](../synapse/PERFORMANCE_BUDGET.md)
until moved here with measurements.

## 8. Dependencies

```
AX-01 memory ─► everything
AX-02 references ─► AETHER tokens ─► TRANSCENDENCE ─► GENESIS
                 └► INFINITY flows ─► mobile API v1 expansion (search, details, actions)
AX-03 pipeline ─► AX-04 spike (renderer + base mesh + identity test)
                    └► CORPUS ─► VITALIS ─► VOX lip sync ─► SENTIENCE expression
                                    └► IMPOSSIBILIS material states
                                    └► OMNIPRAESENTIA placement ─► SYMBIOSIS (needs descriptors + layout geometry) ─► ABSOLUTA ─► GENESIS
Owner decisions gate: Roxi's outfit colour · which flows first · new features shown in references (AX-D006)
```

INFINITY (search, details, actions) does not depend on 3D Roxi and can move
in parallel. GENESIS depends on almost everything; its cinematic moments can
ship first as video tier with stills, then move to real time.

## 9. Where things are documented

| Topic | File |
| --- | --- |
| The owner's words | [CONSTITUTION.md](CONSTITUTION.md); Synapse [MASTER_DIRECTIVE.md](../synapse/MASTER_DIRECTIVE.md) |
| Chapters and their state | [CHAPTER_STATUS.md](CHAPTER_STATUS.md) |
| References and what they ask for | [REFERENCE_MATRIX.md](REFERENCE_MATRIX.md) |
| Roxi: capabilities and pipeline | [ROXI_CAPABILITIES.md](ROXI_CAPABILITIES.md), [ROXI_PIPELINE.md](ROXI_PIPELINE.md) |
| Production architecture for Android and iOS (AX-04) | [PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md) |
| The permanent visual language (AX-04) | [VISUAL_LANGUAGE.md](VISUAL_LANGUAGE.md) |
| Roxi's character engine and identity (AX-04) | [ROXI_ENGINE.md](ROXI_ENGINE.md), [IDENTITY_SPEC.md](IDENTITY_SPEC.md) |
| Look and motion (references, identity, safety) | [VISUAL_CONSTITUTION.md](VISUAL_CONSTITUTION.md) |
| Assets | [ASSET_REGISTRY.md](ASSET_REGISTRY.md) |
| Decisions | [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md) (AX-D…); earlier D-001–D-038 in [DECISION_LOG.md](../synapse/DECISION_LOG.md) |
| Tests | [PRODUCTION_TESTS.md](PRODUCTION_TESTS.md); earlier runs in [TEST_REPORTS.md](../synapse/TEST_REPORTS.md) |
| The website's own architecture | [platform/docs/ARCHITECTURE.md](../../platform/docs/ARCHITECTURE.md) |
| The app's layers (Synapse) | [ARCHITECTURE.md](../synapse/ARCHITECTURE.md) |
