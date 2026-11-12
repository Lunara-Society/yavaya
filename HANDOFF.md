# Handoff: state of Yavaya work (updated November 12, 2026)

**A new chat reads this first.** There are no secrets here: they live in Railway
variables. Then read `platform/docs/ARCHITECTURE.md`, `platform/docs/SECURITY.md`
and `platform/docs/CONFIGURATION.md`, which are kept current with every change.

## Where things are
- **Live code:** GitHub `Lunara-Society/yavaya`, Next.js app in `platform/`.
  - Not `Lunara-Society/YavayaGo`, which is a separate, older copy. Do not work there.
- **Working branch:** `claude/yavaya-lat-migration-uzwusm`.
  - Commit there, then push the same commit to `main`. Railway deploys `main` to yavaya.lat in about 3 minutes.
- **Before pushing:** run these from `platform/`:
  - `npm run typecheck`
  - `npm test` (needs Postgres: `service postgresql start`)
  - `npm run build`
  - `node scripts/check-budget.mjs` (JS budget 138 KB)
  - At last count 675 tests. One fails on a machine without the web secrets in the shell (`jobs.test.ts`, "runs without the web application secrets": `roxi-upkeep` reads `serverEnv()`); it failed before 11 Nov's changes too, and production is unaffected because the scheduler has the secrets.
- **Commit trailer, and no model names in commits:**
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <session link>
  ```
- **Railway project:** 682b2a31-cad5-4e80-a863-51a4dd23f012, environment `production` 2f3e40da-c664-41f9-a583-f5db9dcb8d71.
  - `yavaya-web`: 6fbb30af-f44c-415a-9e73-5a8e9ee4ac24
  - `yavaya-scheduler`: d49a2cfb-fd02-4b79-a8fd-03afa14e8d64
  - `Postgres`: a29a16b0-c3af-41b0-b780-4ece109518af (no public URL, so it cannot be queried from a session)
  - `whatsapp-bridge`: e907c02f-a27a-49d5-acf1-adec1ce4e7d8 (older tool, see below)
- **Connected tools the owner set up:** Railway, Sentry (org `yavaya`, project `yavaya-web`), ElevenLabs, Composio, GitHub, Google Search Console, Facebook/Instagram, HubSpot.
  - Composio accounts: Instagram yavayago, Facebook page 586790031193563, Reddit u/YavayaGo, Gmail yavayago@gmail.com.
- **Owner's rules:**
  - Never claim something works when it does not.
  - Every user-facing string is in i18n, Spanish first.
  - No hard-coded business numbers or geography.
  - Authorization is checked on the server.
  - Audit inside the same transaction.
  - Never print secrets.

## WhatsApp: team inbox and Roxi (built 7–11 November, live)
- **Number:** +505 5836 5522, WhatsApp Business app in coexistence with the official API through **Dualhook**.
  - WABA 1585588379886491, phone_number_id 1270050959528964.
- **Inbound path:** Dualhook's "Webhook Override" sends every message to `https://yavaya.lat/api/whatsapp/webhook/<WHATSAPP_WEBHOOK_KEY>`.
  - The verify token is `WHATSAPP_VERIFY_TOKEN`. Both values are on Railway (`yavaya-web`).
  - Messages are stored sealed (`WHATSAPP_KEY`).
- **Team inbox:** yavaya.lat/admin/whatsapp.
  - Needs the `whatsapp.inbox` permission: support role and admin.
  - Shows both directions, including replies sent from the phone.
  - Lets you reply from the inbox and delete a conversation.
- **Sending:** through Dualhook's Runtime API.
  - `WHATSAPP_API_BASE=https://api.dualhook.com/v25.0`
  - `WHATSAPP_ACCESS_TOKEN` is the `dh_live_…` key. It was pasted in chat on 11 Nov, so the owner may rotate it.
  - `WHATSAPP_PHONE_NUMBER_ID=1270050959528964`
- **Roxi on WhatsApp is ON** (`WHATSAPP_ROXI_DEFAULT=on`).
  - Separate text-only ElevenLabs agent "Roxi · WhatsApp", `agent_8501m7446b15fcp98e8jwnbqwyv0` (`WHATSAPP_ROXI_AGENT_ID`). It accepts signed conversations only and keeps transcripts 30 days.
  - She answers about 6 seconds after a message, only about Yavaya, and introduces herself as an AI assistant.
  - She hands payments, refunds, complaints, account questions, danger and requests for a person to the team: the marker `[[EQUIPO]]` is stripped and the chat is marked "Para el equipo".
  - She is quiet for 12 hours after the team writes in a chat. Each chat has pause and resume buttons, and the inbox has a switch for everyone.
  - She never writes first, never answers after 24 hours, and gives at most 6 answers per chat per hour.
  - Code: `platform/src/server/domains/whatsapp/{service,roxi}.ts`.
- **Replies went out on 11 Nov** (Railway logs: five inbound messages, each followed by a send through Dualhook and Meta's receipts). Nobody has yet confirmed the reply text in the inbox.
- **Roxi can look things up on WhatsApp** (11 Nov, commit 4992a5f).
  - The agent has a client tool `search_yavaya_public` (ElevenLabs tool `tool_5701m74b6zh3f0dbdk12nx77tm7w`); the server answers it in `platform/src/server/domains/whatsapp/lookup.ts`.
  - She sees only what a signed-out visitor sees: Mercadito, YavayaGo, Trabajo, Animales, Santuario. The Servicios board is refused.
  - Her instructions gained a section "Looking up what is published".
- **Meta health on 11 Nov:**
  - Display name not yet approved and business not verified, so sending is "LIMITED".
  - This affects only conversations Yavaya starts; replies are fine.
- **Older tool, `whatsapp-bridge`** (Oct 16): an MCP connector for sending templates and outreach (`tools/whatsapp-bridge`).
  - Dualhook's single webhook now points at yavaya-web, so the bridge **no longer receives** inbound messages. Its reading tools are stale.
  - Read conversations in the inbox instead. Its sending may still work with its own `DUALHOOK_API_KEY`.

## Six new districts (built 11 November, owner's request)
- **Hogar, Movilidad, Salud y Bienestar, Aprender, Negocios, Campo**, each with 7 or 8 subdistricts, at `/hogar`, `/movilidad`, `/salud`, `/aprender`, `/negocios`, `/campo`.
  - One shared engine: `platform/src/server/domains/boards`, pages `platform/src/ui/boards`, table `board_posts` (migration 0042).
  - A member publishes "Ofrezco" or "Busco" for free; anyone reads; members see the author's WhatsApp; reports go to `/admin/distritos`.
  - The owner said empty districts are fine: members will fill them.
- **Added the same day:** optional photos (up to 4), filtering by place, and Roxi's search on the site and on WhatsApp (both ElevenLabs tools updated; not yet seen in a live conversation).
- **Home cards** (11 Nov): the six are on the home page (both designs) with a mark, a colour and a generated illustrative photograph each, also used in their page headers.
- **Not built:** a full colour world and plaque per district, photo screening. The full list is in `platform/docs/CONFIGURATION.md`, "Board districts".
- **The card** (11 Nov): every member has `/members/<YAY ID>/tarjeta` with their Trust Shield, a QR code to their profile, a WhatsApp share button and a print view. It shows only what any visitor may see. Linked from the profile page.
- **Phone verification by WhatsApp** (11 Nov): a button on `/account/phone` opens WhatsApp with a one-time code; the number that sends it to Yavaya becomes the member's verified phone and the chat is tied to their account. Not yet tried with a real phone.
- **"Avísame"** in the six new districts (11 Nov): a saved search that notifies when a matching post is published.
- **Mi negocio** (11 Nov): `/mi-negocio` joins a member's store and its link with QR, today's accounts from Roxi's ledger, their open posts per district and their card. It adds no new data.
- **The phone page is reachable again:** its shortcut on `/account` was hidden while SMS is unconfigured; it now shows when WhatsApp verification is available.
- **Still not built from the owner's directive:** requests by WhatsApp routed to providers, orders sent into a store's WhatsApp, the Living World.

## Distritos en 3D (built 12 November, owner's request)

The owner asked to start the Living World small: the home page's district
cards in 3D, with the classic look one switch away. Built as a fifth look,
**Admin → Diseño del sitio → Distritos en 3D**, on by default; off, the classic
cards with nothing added. Full account in `platform/docs/DISTRICTS-3D.md`.

- Photographs with real depth (depth maps + one small WebGL shader),
  Blender-rendered gold medallions of each district's own mark, cards that
  turn toward the mouse, respond to a leaning phone and rise in as you scroll.
- Loaded after the page has painted and only on capable devices: 6 KB of
  engine, about 100 KB of pictures fetched card by card. Cheap phones, Data
  Saver and reduced motion get the classic cards and download nothing. It
  steps itself down, to classic if need be, when frames are slow.
- Code: `platform/src/ui/depth/`. Pictures: `platform/public/art/depth/`.
  Tools to remake them: `tools/depth/`. Browser test:
  `platform/tests/e2e/depth.cjs` (21 checks, passing in headless Chromium).
- **Not verified on a real phone**: smoothness, battery and the direction of
  the tilt. The owner should look at it on their phone; the switch is the way
  back. Blender 4.5 LTS has to be reinstalled in a new session to re-render.

## Roxi on the site
- **Agent:** ElevenLabs `agent_6601m5ddjn5deqwr34g8zrx41ap4` ("Roxi · Yavaya"), with plans Free, Pro and Max and credits metered from ElevenLabs costs.
- **Yavaya's own account has Max with no payment and no credit limit.**
  - This is the account at PRIMARY_ADMIN_EMAIL (yavayago@gmail.com) that also holds the admin role. Code: `isHouseAccount`.
  - No other account gets it, other administrators included.
  - Max's caps on goals, reminders and connections still apply to it. The owner may ask to lift them for this one account.
- **Time zones:** reminders and every time shown use the member's own zone (`src/server/time/`).

## Other work this period
- **Sentry:**
  - Server and scheduler errors are reported, plus browser errors through `/api/client-errors`.
  - Everything is scrubbed (`src/server/observability/scrub.ts`).
- **Error-report fixes** (7 Nov, commit e3b2a7b): reminder hours, labels, plurals, redirects, store form, pricing rows.
- **Facebook page "YavaYa":** about text, profile, cover, and 16 videos uploaded oldest first.
  - The category must be changed by the owner in the Facebook UI.
- **Earlier:** places (6,531 cities and towns, Central America plus Mexico), YavayaGo, First Light homepage, Identity Studio.
  - See `platform/docs/` and the git log.

## Open items
- **Owner:**
  - Send a WhatsApp test and confirm Roxi's reply.
  - Rotate the Dualhook key.
  - Get the WhatsApp display name approved and the business verified in Meta.
- **WhatsApp retention:** how long conversations are kept is an owner decision. Today: until the team deletes them.
- **YouTube** (@yavayaroxi): uploads are blocked by Composio's shared quota. The owner must upload in Studio or use their own Google OAuth app.
- **Reddit:** u/YavayaGo is too new to post (429). The intro post text was given to the owner.
- **Search Console:** quick fixes offered, with no answer yet:
  - the video `uploadDate` time zone;
  - Roxi in the sitemap;
  - keeping the login page out of search.
- **Roxi's voice in Chrome on Android** (11 Nov, investigated and fixed in code; not yet confirmed on the owner's phone):
  - Evidence: ElevenLabs recorded `total_audio_input_seconds: 0` for the failing Chrome sessions (greeting sent, no microphone audio ever arrived); Firefox sessions were heard.
  - Cause found in a browser reproduction: when Chrome never lets the client's 16 kHz audio graph start, the client's start hangs (no error, greeting never connected to the speaker, nothing captured).
  - Fix (`platform/src/ui/roxi/voice-health.ts`): a stuck start is given up after 3 s, its socket, microphone and audio closed and reported to Sentry ("Roxi voice: …"), and the call reopened on Firefox's audio path (the phone's own rate, resampled in JavaScript); the browser remembers it. A call open but sending no frames for 4 s does the same. One start at a time; no extra microphone pre-check once allowed; a tap resumes held audio; "No me llega tu voz" when nothing works.
  - Verify: after the owner tries Chrome, read the new conversation in ElevenLabs (`asr_usage.total_audio_input_seconds` above 0) and look for "Roxi voice" issues in Sentry.
- Place labels (#19) need screenshots from the owner.
- **Still open from October:**
  - The brand tagline with Mexico open.
  - Mexican legal text (LFPDPPP).
  - Rotating keys exposed in earlier chats (dLocal, Stripe, Spaceship, Resend).
- **Restaurant outreach (Oct):** the Pechugón commercial team was answered on Oct 23 and was awaiting a reply.
  - The full table is in git history: `git show dc25665:HANDOFF.md`.

## Business model (decided Oct 17, owner delegated)
- **No commission on orders, ever.** Flat restaurant plan instead: 30 delivered orders a month free, then Plan Negocio at US$19 a month. Billing is not built.
- **Founding restaurants:** free for 12 months.
- **Launch city:** Managua.
- **Payments:** cash on delivery. Tokens are bought only through Stripe.
