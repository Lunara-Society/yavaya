# Handoff: state of Yavaya work (updated November 13, 2026)

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

## Roxi's voices (owner's setup, 14 November)
- **Spanish: Cristina** ("Roxi Spanish", ElevenLabs voice `1CeqBeXMOqCleeQjfYfO`). **English: Lara** (`vChnJZ1Cu89g2XXumPfT`).
- Set the same on both agents: the website's "Roxi · Yavaya" (`agent_6601m5ddjn5deqwr34g8zrx41ap4`) and "Roxi · WhatsApp" (`agent_8501m7446b15fcp98e8jwnbqwyv0`). Each has Cristina as its voice (default language Spanish) and Lara in its English language preset.
- The website starts each conversation in the visitor's language (`ui/roxi/roxi-panel.tsx`), so English visitors hear Lara.
- WhatsApp voice notes use the same pair by the note's language (`WHATSAPP_RULES.roxiVoices`).
- Roxi's private welcome notes (`platform/src/server/assets/roxi-welcome/`, for the community manager and the owner) were re-recorded in these voices (14 Nov); the old voice, Sarah, is no longer used anywhere.
- **Sounding human (15 Nov, owner: "extremely robotic"):** the website agent speaks with `eleven_v3_conversational`, expressive mode on, stability 0.35, and suggested delivery cues (warmly, excited, curious, laughs softly, reassuring, thoughtful, short pause). Her prompt ("Sound like a person, not a recording", in `docs/roxi/prompt.md`) asks for varied rhythm, pauses, feeling, emphasis and questions that really ask. Cues in brackets are for the voice only: the site's chat hides them (`withoutCues`, `ui/roxi/tidy.ts`) and WhatsApp strips them from written replies. Voice notes use `eleven_v4` with a cue at the start.
- **Spanish a little slower (15 Nov, owner's request):** Spanish conversations on the website run at 90% of the member's chosen speed (`SPANISH_PACE` in `ui/roxi/prefs.ts`, sent as the agent's speed override); English keeps the member's speed. Her prompt also asks for thinking beats ("Mmm…", "A ver…", [thoughtful]) before answers that need a moment.
- **WhatsApp voice notes, owner-approved style (15 Nov, "absolutely perfect"):** each note starts `[warmly] [slowly]`, then the greeting with "…", a `[short pause]`, the message with thinking beats ("Mira…", "…más o menos"), and a `[cheerful]` close. The model has no speed setting, so the pace comes from these cues and pauses. The rule and an example are in the WhatsApp agent's prompt ("Your boss" → "Voice messages").
- If a voice is changed in ElevenLabs, change it in all four places (the two agents, `WHATSAPP_RULES.roxiVoices`, and re-record the welcome notes).

## Yavaya Genesis: the new character (19 November, owner's brief)
- **Diagnosis** (published report): today's character can't be repaired. The head is a sphere with a picture, and beards, paint and hair are separate shapes placed by numbers, so hair crossed the mouth and beards sat on painted teeth. An interim fix is live (long hair's side locks behind the ears).
- **Owner's decisions (19 Nov):**
  1. Rebuild on Genesis, using MakeHuman's CC0 anatomical body.
  2. Stylised realism.
  3. Paid and earned items get Genesis equivalents of the same standing.
  4. Fitted clothing made in-house first; no spending without approval.
- **Built (phase B), behind the switch `play.genesis`, off:**
  - The owner sees it at `yavaya.lat/play?genesis=1` while signed in; Admin → Diseño del sitio → "Yavaya Genesis" turns it on for everyone.
  - The character has:
    - an anatomical body with 30 shape controls;
    - a 45-bone skeleton that follows the shape;
    - seven hairstyles, four garments and three shoes;
    - every move of today's character (`character/pose.ts`, shared).
  - Every game uses it through `ui/play/character/make.ts`. The Play e2e passes with it on and off.
  - Pipeline, provenance and runtime notes are in `platform/docs/GENESIS.md`. Files are in `public/play/genesis/v1/` (about 6.9 MB in all, 1.8 MB core); the CC0 sources are fetched by `scripts/genesis/source.ts`.
- **Next (phases C–G):**
  - facial hair, scalp shading, blink and smile close-ups;
  - the Genesis Studio (presets, sliders, face blending) with its own saved record;
  - more hair and clothing, glasses, accessories, face paint as skin designs;
  - a light gameplay body;
  - the inspector, and the validation suite.

## Roxi's listing flagship, slice 1: website (19 November, Roxi Sovereign phases I + II)
- **Owner's decisions (19 Nov):** "Website first, then WhatsApp"; Roxi's visual system is called **Presence** (Genesis stays the Play character). The brief is a consolidation directive, not a replacement: the audit is at https://claude.ai/artifact/BtWJbPDhd8KVNxbdwbuu1z.
- **Built:**
  - Roxi's listing drafts are kept on the server with their photos (private until published, deleted after 7 days).
  - They show as a review card in her panel, editable, waiting on every device.
  - "Revisar y publicar" opens the filled-in form; the listing gets the draft's id, so it publishes once.
  - Afterwards, a receipt (free or token cost, how to edit or withdraw), read from the publish record and told to Roxi.
  - A four-step funnel on Admin → Visitas.
  - Everything is in `platform/docs/roxi/FLAGSHIP.md`.
- **Switch:** Admin → Diseño del sitio → "Roxi: borradores, revisión y recibo" (`roxi.review`), **off**. While off, only the owner has it; everyone else keeps Roxi as she was (the form opens directly). Turning it on is the owner's call after trying it.
- **Verified:** 14 integration tests, the browser flow (24 checks, stand-in agent and bucket), and the old flow (31 checks, unchanged). Not verified with the real agent: ElevenLabs is blocked (below). The website agent's prompt and the `prepare_listing` description now say what to do with the card and the receipt (repo and agent identical; agent version `agtvrsn_2901m7tp1wsef70rzefnzxd15mg2`, previous `agtvrsn_7601m7emkkwmf8ebnxw4wzre69qc` for rollback). The changes only apply when the tool answers `shown: review_card`.
- **Next:** slice 2, WhatsApp. A verified member sends photos, price and place; Roxi drafts in the chat and sends a one-tap link to the same card/form; she confirms after publishing. It needs Dualhook media download checked first.

## ElevenLabs blocked by a failed payment (18–19 November, resolved)
- **Resolved 19 Nov evening:** the owner paid; the agents answer again (checked on both WhatsApp branches). Kept below for the record.
- From 18 Nov about 16:58 UTC, every conversation with Roxi on WhatsApp fails before she says a word: ElevenLabs closes it with "The AI agent you are trying to reach is not available" (code 3000), and the server logs `whatsapp.roxi outcome=no_answer`. People who wrote in got no answer.
- Cause, from ElevenLabs itself (19 Nov): "Your subscription has a failed or incomplete payment. Complete the latest invoice to continue usage." It blocks everything ElevenLabs does for Yavaya: WhatsApp Roxi, voice notes, the website's voice.
- Fix (owner only): pay the outstanding invoice in ElevenLabs (subscription / billing). Nothing in Yavaya needs to change. To confirm afterwards: the logs show `whatsapp.roxi outcome=answered` again.

## Roxi's voice and words on WhatsApp, upgraded (19 November, owner's brief)
The owner's brief: keep her Spain accent and identity; make her words feel familiar across Central America and Mexico; natural rhythm, feeling and occasional thinking beats; facts fixed but sentences her own; control of a note's length; honest that she is an AI. Built in four layers, kept apart so a new country never needs a new voice:
1. **Voice (unchanged):** Cristina from Spain / Lara, `WHATSAPP_RULES.roxiVoices`, model `eleven_v4`. That model has no speed or style setting, and no `voice_settings` are sent, so the voice's own saved settings stay what the owner approved. Pace comes from the words and cues.
2. **Language adaptation:** `locations.speech` on each country row (whether vos is common; a few local expressions). The country comes from the number's dialing prefix (`platform/src/server/domains/whatsapp/region.ts`). Every conversation now gets `customer_country` and `customer_speech`, and voice notes get the recipient's via the owner tool `get_recipient`.
3. **What she says:** her WhatsApp instructions, now kept in the repo as `platform/docs/roxi/whatsapp-prompt.md`. They cover:
   - Latin American wording (no vosotros; celular, carro…);
   - tú by default, mirroring usted or vos and keeping it;
   - for a voice note: look up the person, plan silently (goal, fixed facts, how to address them, feeling, length), then say it in her own words;
   - feeling that follows the moment;
   - one or two thinking expressions at most;
   - "asistente virtual" in the greeting.
4. **Delivery:** `platform/src/server/domains/whatsapp/voice-delivery.ts`.
   - No pause or cue at the very start or end, so no dead air.
   - Length estimated from her measured pace (2.6 words/s on the approved note) and measured from the Ogg file itself.
   - `send_voice_message` takes `seconds` and `address_as`. A note far off the asked length comes back as `length` with the words to aim for: before any audio if the estimate is off, after if the recording is.
   - Notes up to 60 s. Log: `whatsapp.voice words= estimated= seconds= asked=`.
- **ElevenLabs:**
  - New client tool `get_recipient` (`tool_7801m7szqp20ex6a1tktcy9pdjfq`).
  - `send_voice_message` and `save_contact` gained optional `seconds` / `address_as`. The tools are shared by all branches; the code before this one ignores them.
  - Defaults for the two new variables are on the agent.
  - The new instructions were made on branch `voz-latam-2026-11-19` (`agtbrch_8301m7szqng2ez79tvhanvnr7hcr`), tried there on 19 Nov (seven conversations: vos for Nicaragua, tú for Mexico, usted for a restaurant, English, a stranger claiming to be the owner refused, the 24-hour window, Suhey's 40 s; no Spain-only words, AI said every time), then **merged into main** the same evening (main version `agtvrsn_1201m7tq91d0enytmgv4dyb64n5y`; the branch is kept for the next change).
  - Suhey's 40 s note, written by the live agent and spoken by Cristina (eleven_v4): 94 words, measured 39.8 s. Sent to the owner to hear; to send it for real, the owner asks Roxi on WhatsApp (Suhey must have written to the number in the last 24 hours).
- **Rollback:**
  - Agent: main's version before the new instructions is `agtvrsn_8801m7szk433f5d8kben4hp06bvw`, the 15 Nov prompt plus the variable defaults.
  - Code: it works with that prompt too; the new tool is just never called.
- **Not done, needs people:** listening tests with native speakers from Spain (accent kept?) and Central America (words natural?).

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
- **Roxi for the owner** (14 Nov): a message from one of the owner's own numbers (`WHATSAPP_OWNER_WA_IDS` on Railway, not in the code) gets her as the owner's assistant (`platform/src/server/domains/whatsapp/owner.ts`).
  - She can send a **voice note** on the owner's behalf, in Roxi's voice (ElevenLabs), Spanish or English: "manda un audio a Suhey: llego en 20 minutos". It goes from Yavaya's number and says it is Roxi speaking for the owner.
  - WhatsApp's rule: only to someone who wrote to Yavaya's number in the last 24 hours (a voice note cannot be a template). Otherwise she says so.
  - Recipients are found by the name the owner gave them ("guarda a Suhey: +505 …", tool `save_contact`) or their WhatsApp profile name, or a number. Two matches: she asks which.
  - The tools (`send_voice_message`, `save_contact`) are refused by the server for any other number, whatever the model is told. The owner's chat is never handed to the team.
  - Needs the ElevenLabs API key on Railway to have **Text to Speech** allowed (the owner enabled it on 14 Nov; until then every voice note failed with the reason in the log as `elevenlabs.tts …`). First voice note delivered 14 Nov 03:58 UTC. Each costs about one ElevenLabs credit per character (model `eleven_multilingual_v2`).
  - Logs: `whatsapp.roxi outcome=…` for every message, `elevenlabs.tts …` and `whatsapp.audio …` with the reason when a voice note fails.
  - The audio is Ogg Opus (shown as a voice note) when ElevenLabs returns Ogg, else MP3 (an audio message); WhatsApp fetches it from `/api/whatsapp/voice/<id>?k=…`, kept 48 h. In the inbox it shows as "(nota de voz)" with what she said.
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

## Built 13 November (owner: "do all that you can now")

From the owner's list of ideas, the ones that could be built without outside
approvals:

- **Two new board districts: Barrio** (neighbourhood notices, water and power
  cuts, events, fairs, lost and found, giveaways, neighbours helping) and
  **Diáspora** (family abroad finding help at home: repairs, errands, elder
  care, medical visits, paperwork). Same engine as Hogar etc.; photos made
  with ElevenLabs, medallions in Blender, depth maps; both live Roxi search
  tools (site and WhatsApp) now include them. Fifteen districts in all.
- **Cerca de mí** (`/cerca`): open posts of every board district around the
  visitor, nearest first, at 5, 15 or 50 km (`NEARBY_RULES`). Location is
  asked only on a tap, rounded to ~1 km and never stored; otherwise the town
  chosen for the site. Distance is to the town's centre, and the page says so.
- **Voice dictation** on the description of board posts and Mercadito
  listings (`ui/components/dictate.tsx`): the browser's own speech
  recognition; hidden where the browser has none (Firefox). Chrome sends the
  audio to Google, which the hint says.
- **Founders**: the first 100 accounts (`FOUNDER_RULES`, Yavaya's default)
  show "Fundador nº N" on their member card and a founder medal on their
  profile, worked out from registration order each time, never stored.

Not built, and why: in-site payments with held money (needs the owner's
business rules and a payment partner), WhatsApp posting by chat (needs Meta
template approval), the weekly automated video (needs a scheduled session
with credits; ask), the Living World map (owner asked to wait), and seeding
real listings (owner: later). Reputation after deals, the member card and
invite links already existed.

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
- Added the same day at the owner's word: the hero picture in depth, a tap
  that opens the card's picture into the screen, sound on by default with a
  switch to turn it off, wider spacing, and the medallion in the six board
  districts' headers. A scroll flicker the owner reported was fixed (the
  light no longer follows the scroll; pictures ease after it). Still open:
  a 3D Guardian (needs the owner's decision on how), and the owner's
  confirmation that the flicker is gone.
- After the owner's second look (12 November): the card-opening transition
  twitched, so it now animates only transform and opacity (the first version
  used clip-path); the card sound is a new, sharper and much louder cue
  (`portal`); and Roxi's voice is raised 2.6x with a limiter (`boostVoice`,
  `ui/roxi/voice-health.ts`) because Android plays a page's sound at call
  level while the microphone is open. None of the three is confirmed on the
  phone yet. Sentry YAVAYA-WEB-9 (11 Nov, one event) shows a Chrome voice
  start with both audio contexts suspended and no microphone frames: the
  Chrome voice problem is still open.
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

## Yavaya Play (`/play`)

Behind Admin → Diseño del sitio → Yavaya Play (off: only the owner sees it).
State, plan and how it is built: `platform/docs/PLAY.md`. Done: the shared
engine; the character and studio; the Pruebas de Maestría; and (14 November
2026) verified runs (the server replays every run's input), progress on the
account (XP, levels, achievements, Play Coins), La Ruta del Día, the Barrio
and Diáspora routes, leaderboards (world, country, city), ghosts and
WhatsApp challenge links, the shop, the Fundador hat, the Plaza menu, and
anonymous play counts in Admin → Visitas. Not yet: Obsidian Ascent, Dash,
players' own courses (needs moderation first). All numbers are ours,
provisional (`docs/CONFIGURATION.md`). Since then: 59 looks from the owner's
artwork (painted faces, beards, face paint, glasses, chest prints, patterned
tops), proezas (no fall, no checkpoint, at the reference time) and gems
(Stripe packs, looks only). Hair, hats and garments from the artwork wait
for image-to-3D credits. The exposed Stripe key must be rotated before gems
are sold for real. The Vault (docs/PLAY.md): 68 premium
pieces in six collections, numbered editions, honest status badges, the
owner's disclosure, an inventory with returns, and `/admin/vault`. Only two
outfits are usable now; selling the rest waits on the owner approving the
draft return terms (switch off).
