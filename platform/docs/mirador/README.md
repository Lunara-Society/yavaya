# Mirador — Yavaya's short videos

> *Desde aquí se ve todo.* A *mirador* is the lookout over a town — the one
> at Catarina over Laguna de Apoyo is the one everyone in Nicaragua knows.
> Mirador is where Yavaya's people, shops and neighbourhoods show themselves
> in short videos, and where whatever a viewer sees can be opened, ordered,
> bought or contacted without leaving Yavaya.

Named by the owner's delegation on 20 November 2026 (the brief called it
"Pulse"; that word is used by several companies and already names the home
page's activity line here). A web search on that day found no video, social
or video-commerce product called Mirador — the software of that name is an
old Windows messenger and a museum image viewer. That is a search, not a
trademark clearance: a registered-mark search is the owner's step before
spending on the brand.

## Where it lives: a window, not a sixteenth district

A video is about something that already belongs to a district — a Mercadito
listing, a YavayaGo restaurant, a mechanic in Servicios, a fair on the Barrio
board. So Mirador is not a district of its own: each video takes the district
of what it links to (`mirador_videos.district`), and Mirador is the view
across all of them. Its door is in the site's header and in the phone's
bottom bar (where Confianza was; Confianza stays in the header and footer),
for everyone once it is open and for the owner before that.

## What is built (20 November 2026)

| Phase of the brief | State |
| --- | --- |
| 1. Audit of the infrastructure and of HeyGen | Done — below |
| 2. Upload, storage, processing, playback | **Built and tested** |
| 3. Feed and creator interactions | **Built and tested** |
| 4. Links to Mercadito, YavayaGo, Servicios and the boards | **Built and tested** |
| 5. Roxi creates videos (HeyGen) | Not built yet — needs a HeyGen API key (below) |
| 6. Paid narration (ElevenLabs) | **Built and tested** — "Voiceover", priced by the owner's delegation (below) |
| Offers: sell, give, pay what you like, for food kitchens, for animals, calls for help | **Built and tested** — "Offers" (owner's requests, 20 November) |
| Photos instead of a video | **Built and tested** — "Photos" |
| 7. Discovery, recommendations, creator analytics | **Built** (six tabs, transparent ranking, studio numbers); achievements not built |
| 8. Monetisation, moderation, performance | Moderation and performance built; paid features (featured videos, business tools) not built |

Everything is behind the switch `mirador.open` (Admin → Diseño del sitio,
"Mirador: los videos cortos"), **off**: until the owner opens it, only someone
who may change switches can see Mirador at all — its pages, its routes and its
files answer 404 to everyone else.

### Upload

`/mirador/subir`. The upload starts the moment the member picks the file, in
8 MB parts straight into the bucket's multipart upload
(`domains/mirador/upload.ts`), while they write the caption: on a slow
connection the minutes pass while they type. A failed part is sent again
three times; a part is checked for its exact size; "Cancelar" aborts the
multipart upload. Parts go through the application because the bucket does
not take uploads from browsers — signed direct uploads need the bucket's CORS
rules, the next step when traffic calls for it. No request ever holds more
than one part.

Limits (Yavaya's defaults, `MIRADOR_RULES`, CONFIGURATION.md "Mirador"):
90 seconds, 250 MB, 10 uploads a day per member. The phone refuses a video
that is too long before sending a byte; the server checks everything again.

A member can link the video to **their own** live Mercadito listing, approved
YavayaGo store, active Servicios profile or open board post
(`domains/mirador/links.ts`). Ownership is checked when the link is set and
again every time the video is shown: a listing sold, a store no longer
approved or a post closed just stops showing its button.

### Processing

`domains/mirador/process.ts`, after the upload's answer (`after()`), with the
scheduler's `mirador-upkeep` as the safety net (restarts, crashes; three
tries, then failed):

1. **ffprobe** reads the file. Refused, with a reason the member reads:
   anything that is not a phone container (mov/mp4/3gp/matroska/webm — so a
   playlist naming network addresses or files never reaches ffmpeg), no
   picture, under 2 s, over 90 s.
2. **ffmpeg** writes two encodings — **720p** (H.264 CRF 26, ≤2.5 Mb/s, AAC
   96k) and **360p** for slow connections (CRF 30, ≤700 kb/s, AAC 64k) —
   at most 30 fps, keyframes every 2 s, index at the front (`+faststart`),
   **never upscaled**, upright (the phone's rotation applied).
3. A **poster** from the first second, as WebP.
4. **`-map_metadata -1`**: the place it was filmed, the phone and the date are
   removed — members do not mean to publish them (checked by the test).
5. The original is deleted; the encodings and the poster stay.

`-protocol_whitelist file,pipe`, a time limit on every run, one video at a
time per server on two threads. ffmpeg is in the production image
(`apk add ffmpeg` in the Dockerfile).

A video still processing when its creator taps Publicar goes up the moment it
is ready, at the top of the newest.

### The feed

`/mirador` (and `/mirador/v/<id>` for a shared video, with its own poster and
words as the WhatsApp preview). Full screen, no site header. One video per
screen, swiped vertically (scroll snap, keyboard arrows on a computer).

Built for a mid-range Android on a slow connection first
(`ui/mirador/feed.tsx`):

- only the video in view and its neighbours have a `<video>`; the rest are a
  poster — the phone never fetches what nobody watches;
- the one in view preloads, the next only its first bytes;
- on 2G/3G or with data saver on, the 360p encoding plays ("Ahorro de datos"
  is shown);
- with reduced motion, nothing plays until tapped;
- sound starts off (browsers refuse autoplay with sound); once turned on it
  stays on for the visit;
- the first videos are rendered on the server, so the first poster paints
  before any script; the page's script is 109 KB, lighter than the site's
  other pages.

Files are served by `/mirador/media/<id>/<file>` with byte ranges, from the
bucket through the application (as the guide videos are); a CDN in front of
the bucket is the step for when traffic asks for it.

### Interactions — counts are real rows

`domains/mirador/social.ts`. Like, save, share, comment (one level of
replies), follow, block, report, and the views that rank. Every counter moves
in the same transaction as the row behind it; doing a thing twice is doing it
once; **a creator's own likes, saves, views and shares never count**. A view
is one per viewer per day (a signed-out visitor is a daily hash of network
and browser, never an identity); watched to 90% is a completion, once a day;
a share counts only from someone who watched it that day.

Notifications (category "Mirador", switchable in Ajustes): a new follower, a
comment on your video, a reply to your comment. Never to the person who acted.

### Discovery — how Para ti ranks

`domains/mirador/feed.ts`. Six tabs, each a rule a member could check:

- **Para ti** — what each video earned per view:
  `(3·likes + 4·saves + 5·shares + 2·comments + 2·completions) / (views + 20)`,
  fresher first (`÷ (1 + age in hours / 72)`), ×1.5 near the viewer's place,
  ×2 from creators they follow, ×1.3 on hashtags they chose, ×1.2 in their
  language. Videos they saw in the last 7 days come after the ones they did
  not. No hidden boosts and no paid placement (there is none to buy). "¿Por
  qué veo esto?" says which of these applied. In the studio a member
  chooses their hashtags or **starts Para ti over** (signals before that
  moment stop counting).
- **Cerca** — from the viewer's place, newest first.
- **Siguiendo** — from creators they follow.
- **Negocios** — videos that open a YavayaGo store or a provider's services.
- **Mercadito** — videos that open a listing still for sale.
- **Tendencias** — engagement in the last 48 h, from videos at least 5 people
  watched.

With no data, Para ti is the newest videos, nearest first — which is the
truth. No machine learning before there is behaviour to learn from.

### Video commerce

The button on a video opens the real page of what it links to — "Ver
anuncio · C$ 65,000" opens the listing (its contact, WhatsApp and save),
"Pedir" opens the store's own order form, "Ver servicios" the provider's
page, "Ver publicación" the post. Mirador adds no second way to contact, pay
or order, so nothing here can pretend to. A tap is counted for the creator
("clics a tu anuncio o tienda").

### Photos

Not everyone can film well; anyone can take a photo. Up to
`MIRADOR_RULES.maxPhotos` (4) photos become a short portrait video for free
(`process.ts`, `slideshow`): each photo is turned upright, kept under 2160
pixels and re-encoded by sharp as a plain JPEG (which drops the GPS position
and the phone's details), then cropped from the centre to fill a 720×1280
portrait frame (a landscape photo loses its sides), shown for 3 seconds with
a slow push-in and a half-second crossfade, and closed by Mirador's end card. A silent sound track is added so
the voiceover has something to mix into. The originals are deleted after
encoding, as a video's are.

**The end card** (`public/mirador/endcard.mp4`, 2.6 s) was made once with the
owner's tools — Blender for the gold lookout emblem, HyperFrames to set it
with the name and tagline in the site's own faces, ffmpeg to size it — and is
reused for every photo video at no cost. How to remake it:
`tools/mirador-endcard/README.md`.

### Offers

The owner's idea (20 November): anyone who cooks, bakes or makes something
films it or photographs it and offers it, and whoever sees it can ask for it
at once — including leftovers given away and food for people who have
nothing. Made valid like this:

- **Four kinds**, chosen on the upload form or later in the studio: *Lo
  vendo* (a price in the currency of the video's place), *Lo regalo*, *Lo que
  quieran dar*, and *Para comedores*. Six categories: food, bread and
  desserts, hand-made, clothes, plants, other.
- **"Lo quiero"** is a request, not a purchase: how many and a short note.
  The creator is told at once (notification, category Mirador) and accepts
  or declines in the studio (`/mirador/estudio#pedidos`). Accepting takes the
  quantity out of what is left, in the same transaction, and is refused if
  there is no longer enough; the member who asked can cancel, and an
  accepted quantity goes back.
- **Payment is in person**, at pickup, straight to the creator. Yavaya takes
  no money and says so on the offer — the same model as Mercadito.
- **Privacy.** The video's place is only the pickup *area*. The exact spot
  and time ("frente a la pulpería, de 5 a 7") is shown only to members whose
  request was accepted. The creator sees who asked by name, never their phone.
  The creator's WhatsApp appears only if they already share it on their
  listings, and only to signed-in members — as in Mercadito.
- **Food rules.** For food and baking: every ingredient written (allergies),
  the cook confirms it was made today, kept properly hot or cold and nothing
  is past its date (`food_rules_at` keeps when), and it can be offered for
  `foodMaxHours` (24) at most. Viewers see a plain notice that it is home
  food from a neighbour, not an inspected business.
- **For food kitchens** is the "food for the homeless" idea made safe: only
  a church approved in Santuario, or a food bank, soup kitchen or shelter
  approved by a Yavaya reviewer, can ask for it, so donated food goes to
  someone who will share it, not to whoever is fastest.
- **For animals in need** (owner, 20 November: "give food for animals and
  collect food for them and help in general with animals in need"): food for
  animals (what exactly it is — brand, sealed, for which animal — is
  required), animal care (medicine, blankets, beds) or helping hands
  (transport, volunteering, a temporary home). Only a rescuer approved in
  Animales can ask for it.
- **Pido ayuda** — collecting, the other way round: an approved church,
  organisation or rescuer says what it needs and how many ("croquetas para 12
  perros: 5 bolsas"). Neighbours tap **Yo ayudo** with how many they bring;
  accepting one counts it against what is still needed; where and when to
  bring it is shown only to the one accepted. The video shows who Yavaya
  checked is asking ("Refugio Patitas · verificado por Yavaya"). Goods and
  time only: Yavaya collects no money for anyone. A new **Ayudar** tab lists
  calls for help, soonest-ending first.
- **What each kind may offer** is held on both sides (`src/config/offers.ts`):
  helping hands are never sold (that is Servicios); animals' things go to
  rescuers; soup kitchens get what feeds or clothes people.
- **Organisations** apply at `/mirador/organizacion` (kind, name, whom they
  serve, an optional registration number, place, WhatsApp for the reviewer)
  and are approved, rejected or suspended at `/admin/organizaciones`
  (`causes.review`); the queue shows on the Admin panel. Changing the name,
  description or place sends one back to review.
- **Limits.** At most `openOffersPerMember` (5) open at once, so the feed is
  not one person's shop; offers close themselves when their time ends
  (`mirador-upkeep`), and the creator can close one early — accepted
  requests stand.
- **Where they show.** On the video (price or kind, how many are left, until
  when, and the button), in *Mercadito* (items for sale or for a
  contribution), in *Regalos* (free, for food kitchens and for animals,
  soonest-ending first) and in *Ayudar* (calls for help).

### Voiceover

"Ponerle la voz de Roxi", in the studio, on any ready video of one's own:
the member writes what Roxi should say (or starts from their own caption and
offer with one tap — no AI writes it, so nothing pretends to), chooses
Spanish or English and how loud the video's own sound stays, sees the price
against their balance, and confirms. Then:

1. The tokens are charged in the same transaction that records the job; the
   job's id is the charge's idempotency key.
2. ElevenLabs makes the speech in Roxi's own voices (the WhatsApp ones,
   `eleven_v4`, falling back to `eleven_multilingual_v2`) with the time of
   every character.
3. ffmpeg lays it over both encodings — the picture copied untouched, only
   the sound mixed — and captions are cut from the voice's own timing
   (WebVTT, lines of 42 characters at most). The files get a new version, so
   no phone keeps playing the old one from its cache.
4. If it cannot be made (ElevenLabs refuses, two tries fail), the tokens come
   back once, by their own idempotency key, and the member is told.

The script is limited to what the video's length can carry (17 characters a
second, at most 1,350). One narration per video: a second would be laid over
the first one's voice. Without an ElevenLabs key or the media bucket, the
button is absent — `/status` shows `mirador_voice` as needing configuration.
Admin → Moderación de Mirador shows, to whoever may read the token economy,
narrations made, refunded and in progress, tokens earned and the estimated
ElevenLabs cost.

### Pricing (decided by the owner's delegation, 20 November)

The owner asked for prices that cover ElevenLabs, stay cheap for Central
America and leave a small margin ("I'll let you figure what is actually the
best"). ElevenLabs charges $0.08 per 1,000 characters.

| | Script | ElevenLabs cost at most | Price | Member pays |
| --- | --- | --- | --- | --- |
| `mirador.voiceover` | up to 450 characters (~30 s) | $0.036 | **1 token** | $0.30–$0.50 |
| `mirador.voiceover_long` | up to 1,350 characters (~90 s) | $0.108 | **2 tokens** | $0.60–$1.00 |
| Photos to video, offers, "Lo quiero" | — | $0 (our own server) | **free** | — |

The margin is above 80% at the cheapest token price, which also absorbs
refunds and retries; in córdobas a short voiceover is about C$ 11–18. The
"packages of $10–$30" the owner mentioned already exist as token packs
(25 tokens for $9.99, 50 for $18.99 — 25 to 50 voiceovers), and a new
member's starter tokens (2 a day over their first week, 14 in all) cover
a first try. Both prices are rows in
`billable_actions`, retunable in Admin without a deploy.

### Creators

`/mirador/creador/<YAY ID>`: name, followers, following, likes, videos.
`/mirador/estudio`: every video with its status and real numbers (views,
watched to the end, likes, comments, shares, link taps), publish or keep to
oneself, take down, put an offer on it or close it, give it Roxi's voice;
requests received and made ("Pedidos"); saved videos; blocked people; Para
ti's topics and reset. Totals and new followers this week. Achievements are
not built.

### Safety

- Report (scam, harassment, inappropriate, impersonation, copyright, other):
  a ticket in the shared moderation queue; after 3 different reporters the
  video is hidden until a moderator looks. `/admin/mirador` lists reported
  videos to watch and take down or restore.
- Block: each disappears from the other's Mirador and any follow ends.
  Scoped to Mirador on purpose — Yavaya has no platform-wide block yet.
- Comments: the author or the video's creator can take one down.
- Upload rights notice on the form; metadata stripped; only members' own
  things can be linked.
- AI videos carry "Hecho con IA" wherever they appear (`source = 'ai'`), ready
  for phase 5.
- Rate limits: uploads per day, comments per hour, taps per hour.

## The audit (20 November 2026)

**Infrastructure.** The media bucket is S3-compatible with multipart writes
and ranged reads (already used by the guide videos) — enough for Mirador
without new services. ffmpeg was not in the image; it is now. The scheduler
runs every 15 minutes (`mirador-upkeep`). Tokens move only through
`chargeForAction` / `refundAction`, both idempotent — the path phases 5 and 6
will use.

**HeyGen.** My access to HeyGen in this session is the *owner's* account
through a tool connection; it gives the *application* nothing. The app has
**no HeyGen key** (`HEYGEN_API_KEY` does not exist in its configuration).
Verified from HeyGen's documentation on 20 November 2026:

- API: `POST https://api.heygen.com/v3/models/videos`, header `x-api-key`,
  model `heygen-video-1`, modes `text_to_video`, `image_to_video` (a photo
  as the first frame) and `reference_to_video` (up to 9 photos, 3 videos, 3
  audio clips of the member's products or place). Status by polling
  `GET /v3/models/videos/{id}` or a callback. Idempotency-Key supported.
- 5–30 s clips; 9:16 vertical supported; 480p, 768p, 1080p, 2K; MP4 H.264,
  24 fps; **audio generated with the picture** (dialogue, ambience, effects;
  "no music" must be asked for or a music bed may appear). 10 jobs at once.
- **Price (pay-as-you-go, no subscription, $5 minimum, credits valid 12
  months):** per second of output — 768p **$0.018/s**, 1080p $0.04/s for
  clips up to 15 s; over 15 s, 768p $0.075/s, 1080p $0.105/s. So a 15-second
  vertical ad costs **$0.27 at 768p, $0.60 at 1080p**; a 30-second one $2.25
  at 768p. (help.heygen.com, "HeyGen API Pricing & Credits Explained",
  updated 9 November 2026.)
- HyperFrames (HeyGen's HTML video framework) renders at $0.15/min at 1080p
  through the API, but its authoring tools are for HeyGen's own apps and
  agents; it is not what Roxi needs to make a member's ad.
- Commercial use: to be confirmed in HeyGen's terms by the owner before
  launch; not verified here.

**ElevenLabs.** The app's key already makes speech (Roxi's WhatsApp voice
notes, `eleven_v4`). API price on 20 November 2026: **$0.08 per 1,000
characters** for v4 (about $0.08 per minute of speech); a 15-second
narration (~40 words, ~250 characters) costs about **$0.02**. Music
generation is $0.15/minute (commercial licence on Starter and above).

## What phase 5 (Roxi-made videos) needs from the owner

Narration (phase 6) is built — "Voiceover" above. Videos that Roxi
*generates* are not, because the application has no way to reach HeyGen: the
owner's HeyGen account is connected to this assistant, not to Yavaya. With
the verified costs above, the price would follow the voiceover's logic:

| What | Provider cost | Price that fits the same margin |
| --- | --- | --- |
| Roxi makes a 15 s vertical ad, 768p | $0.27 | 3 tokens ($0.90–$1.50) |
| Same, 1080p | $0.60 | not offered at first |

Needed: a HeyGen API key with `videos:write`, `videos:read` and
`assets:write` scopes, saved as `HEYGEN_API_KEY` in Railway, and API credits
on that HeyGen account. It will follow the voiceover's path: a provider
interface, the price shown first, the charge with the job's id as its
idempotency key, a refund if HeyGen fails, cost per job in Admin, and
"Hecho con IA" on the video.

## Files

| | |
| --- | --- |
| Schema | `src/server/db/schema/mirador.ts`, `aid.ts`; migrations `drizzle/0054_mirador.sql`, `0055_mirador_offers.sql`, `0056_aid_organisations.sql` |
| Domain | `src/server/domains/mirador/` — `upload`, `process`, `feed`, `social`, `videos`, `links`, `text`, `access`, `offers`, `voice`; `src/server/domains/aid/service.ts` (organisations, who is a checked helper); `src/config/offers.ts` |
| Routes | `src/app/api/mirador/**` (also `photos`, `requests/[id]`, `videos/[id]/offer`, `/want`, `/voice`), `src/app/mirador/media/[id]/[file]` |
| Pages | `src/app/mirador/` (feed, `v/[id]`, `subir`, `creador/[yayId]`, `estudio`, `organizacion`), `src/app/admin/mirador`, `src/app/admin/organizaciones` |
| Client | `src/ui/mirador/` — `feed.tsx`, `upload.tsx`, `studio-actions.tsx`, `studio-offers.tsx`, `labels.ts` |
| Rules | `MIRADOR_RULES` in `src/config/business-rules.ts`; `mirador.voiceover` and `mirador.voiceover_long` in `src/config/billable-actions.ts`; switch `mirador.open` |
| End card | `public/mirador/endcard.mp4`; sources in `tools/mirador-endcard/` |
| Tests | `tests/integration/mirador.test.ts` (14, real ffmpeg files); `tests/integration/mirador-offers.test.ts` (12: photos, prices, food rules, requests, donations, animals, organisations, calls for help, limits, voiceover charge/refund, captions); `tests/e2e/mirador.cjs` (16 checks on a phone); `tests/e2e/mirador-offers.cjs` (21 checks on a phone) |
