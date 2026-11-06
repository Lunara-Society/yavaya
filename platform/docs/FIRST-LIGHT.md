# First Light

The home page: the Guardian of the First Light over a dawn horizon, the seven
districts as seven doors, Roxi as a living presence, and sound that is off
until the visitor turns it on. Behind each door, the district opens with the
world the door showed.

**Status: the home page since 6 November 2026, on the owner's word — with a
way back.** Each look is a switch in Admin → Diseño del sitio (only
administrators, who hold `flags.manage`; every change is audited):

| Switch | On | Off |
| --- | --- | --- |
| Portada: La Primera Luz | `/` is the First Light; `/first-light` leads to `/` | `/` is the home page of 31 October 2026; the First Light waits at `/first-light` as a `noindex` preview |
| Mundos de los distritos | each district's front page opens with its world | the district pages as they were |
| El Guardián de la portada | the owner's new Guardian (6 November 2026, wings spread) | the first Guardian, with its light maps |
| Logo | the owner's new logo: header mark, favicon, phone icons, share card | the seal and its icons and share card |

A switch takes effect within a minute (the flag cache is 30 s per process),
without a deploy. Until someone touches one, all are on
(`SITE_LOOK_RULES` in `config/business-rules.ts`; the switches themselves are
`server/domains/platform/looks.ts`). The previous home page stays in the tree
(`src/ui/site/home.tsx`, `src/app/home.css`) for exactly this.

## Where things live

| Piece | File |
| --- | --- |
| Home page (switch between the two) | `src/app/page.tsx` |
| Preview while the switch is off | `src/app/first-light/page.tsx` |
| The switches | `src/server/domains/platform/looks.ts`, Admin (`src/app/admin/page.tsx`, `actions.ts`) |
| Page body (server component) | `src/ui/first-light/first-light.tsx` |
| The worlds behind the doors | `src/ui/first-light/district-world.tsx`, `district-world.css` |
| Styles, motion, tiers | `src/app/first-light/first-light.css` |
| The engine (tier, light, doors, pausing) | `src/ui/first-light/engine.tsx` |
| Device tiers | `src/ui/first-light/tier.ts` |
| Sound | `src/ui/first-light/sound.ts`, `sound-toggle.tsx` |
| Roxi on the page | `src/ui/first-light/roxi-presence.tsx`, `src/ui/roxi/state-bus.ts` |
| Picture sizes and the list of files | `src/ui/first-light/assets.ts` |
| Pictures | `public/first-light/` |
| Tests | `tests/unit/first-light.test.ts`, `tests/integration/site-looks.test.ts`, `tests/e2e/first-light.cjs` |

The previous home page's header (the transparent bar that lies over the
picture) is in `src/app/home-header.css`, shared by both bodies, so turning
the switch off brings it back exactly as it was (the e2e test checks its hero
and its transparent header).

## The layers

The page is built the way a film plate is, back to front, and every layer is
HTML, CSS and SVG. There is no video and no canvas: nothing here needs one,
and both would cost the phone more than the scene is worth.

1. **Atmosphere** — the night sky (a gradient), the horizon plate, a veil of
   night that thins as the page opens, two strips of mist.
2. **Light** — the sun behind the horizon (a screen-blended radial glow), the
   aura behind the Guardian, the light that follows the pointer.
3. **Identity** — the Guardian, in four layers with two light maps.
4. **Architecture** — the seven doors, each an arch with a line of light that
   travels round it.
5. **Interaction** — the search (Mercadito's), Roxi, the doors, the sound switch.
6. **Sound** — synthesised cues, off by default.

## The Guardian

The Guardian is the owner's approved artwork (uploaded 6 November 2026). It
was cut out (BiRefNet) and separated into four layers — left wing, right
wing, tail and body — along lines that exist in the drawing, with **no
retouching and no redrawing**: put back together, the layers are the
original picture. Two light maps come from the artwork's own brightness: a
gold one (where the feathers already shine) and a violet one (the violet
feathers). They only ever add light to what is drawn; they never add a shape.

The pivots the wings and tail turn about (`transform-origin` in the CSS) were
measured on the artwork at the shoulders and the root of the tail, so the
movement stays anatomical: the wings breathe ±1.3° over 7.5 s, the tail
sways ±0.7°. Nothing else about the creature moves.

Its rare moment: a tap or click on it lifts the wings ±3.2° and flares the
eye for 1.6 s (with a soft cue if sound is on). It waits 8 s before it can
happen again, blocks nothing, and never happens on the still tier.

The artwork's square frame cuts the wingtips and the crest; a mask lets them
fade into the night instead of ending on a straight edge, and lets the tail's
last feathers dissolve into the dawn, so the words under it stay readable
without being pushed below the fold. Those are masks over the drawing, not
changes to it.

## The second Guardian and the logo (6 November 2026)

The owner sent two pictures with one instruction: **not the slightest detail
may change.** So:

- **The Guardian** (wings spread) was cut from its sky with BiRefNet and split
  into the same four parts by `tools/cinematic/guardian2_layers.py`. Every
  pixel belongs to exactly one layer, unchanged; a wing or the tail also
  carries, under the layer above it, the fully opaque pixels at its edge, so
  turning a degree never opens a gap. The script asserts that the layers,
  stacked, are the cut-out **exactly** (difference 0) at all three sizes, on
  black, white and the page's night. The page paints nothing on it: no light
  maps, no passing band, no glow on the eye. It moves (the wings breathe, the
  tail sways, a tap lifts the wings) and that is all. Its square frame cuts
  the outermost wingtips, so the sides fade over 4% instead of 9%, and the
  tail is not faded. Files: `public/first-light/guardian2-*`, AVIF at full
  colour resolution (4:4:4, ~41 dB against the cut-out; the usual 4:2:0
  visibly softened the gold against the black) with lossless WebP behind it.
- **The logo** is used only as crops and scaling
  (`tools/cinematic/logo2_assets.py`): the mark is the square of it around the
  Guardian's head, the orb and the arch, shown as a tile with rounded corners
  (`src/ui/site/brand-mark.tsx`); the icons are the same square; the share
  card is the whole logo on the page's obsidian. Files:
  `public/brand/logo-mark-*`, `public/logo-*`, `public/og-logo.jpg`,
  `public/brand/logo-1080.webp` (the whole logo, for press). The seal's files
  are untouched, for the switch.
- The originals (3840 px, about 30 MB) are not in git; the scripts read them
  from `OWNER_ART`.
- Not switched yet: a page about one thing without its own photo still
  shares with the seal's card (`src/ui/site/share-meta.ts`), and the 24-second
  film still shows the first Guardian.

## Pictures

| Picture | Sizes (px wide) | Note |
| --- | --- | --- |
| Guardian layers and light maps | 560, 840, 1240 | the owner's artwork, separated |
| Horizon, wide | 960, 1600, 2560 | dawn over the volcanoes |
| Horizon, tall (phones) | 640, 960, 1215 | the same scene, for portrait screens |
| Seven doors | 480, 720, 960 | one per district, 2:3 |

Every picture is AVIF with a WebP fallback, with `srcset` and `sizes`, so the
browser downloads only the size it shows. The light maps load as CSS
`image-set()` backgrounds, and only on the full tier. A phone's first view
costs about 270 KB of pictures (the four Guardian layers and the tall
horizon, AVIF), plus 70 KB of light maps on the full tier; the doors load
lazily below the fold.

The horizon and the seven doors were made for this page with an image model
through the owner's ElevenLabs account (6 November 2026), from briefs that
ask for Central American colonial architecture at first light, seen through
an open door. **Inspected 6 November 2026** at full size: no lettering, no
logos (the YavayaGo motorbike's box is plain), no malformed people. Two doors
have people in them — Mercadito (vendors in the arcade) and Comunidad (people
in the plaza) — and carry the "Ilustración" note like every other
illustration with people on the site; the other five are places.

## Device tiers

The server always sends the **lite** tier: the full picture with gentle CSS
motion, nothing that depends on JavaScript. Once the page is interactive the
engine reads what the device says about itself (`tier.ts`) and may upgrade:

| Tier | Who | What moves |
| --- | --- | --- |
| `still` | anyone who asked for less motion, on any device, at any time | nothing: no animation, no transition, doors open without the expanding transition |
| `lite` | Data Saver, 2G/3G, ≤ 2 GB of memory, ≤ 2 cores | the dawn as the page opens (once), the light round a hovered or focused door, Roxi's orb, the door transition |
| `full` | everyone else | adds the Guardian's breathing and light maps, the drifting mist, the light that follows the pointer, the parallax, magnetic buttons |

A browser that reports nothing (Safari and Firefox report none of these) is
not assumed to be weak. A change to the reduced-motion setting while the page
is open is followed at once.

Motion pauses when it cannot be seen: in a hidden tab, and in the hero once
it has scrolled out of view. Only compositor-friendly properties are animated
(transform, opacity, clip-path, masks driven by registered custom properties),
so the main thread stays free for input.

## The doors

Each door is a plain link: it works with JavaScript off, opens in a new tab
with a modifier key, and is reached with the keyboard. With JavaScript, a
door that comes near the screen has its district prefetched; a click opens
it in place — the door's own picture grows from the arch to the whole screen
(640 ms) while the district loads and its world picture is fetched; then it
settles onto the district's world (below) and gives way to it. Without a
world (the switch off) it dissolves instead. On the still tier the click
simply navigates.

## The worlds behind the doors

Each district's front page opens with its world (`ui/first-light/district-world.tsx`):
the door's own picture, widened into a strip, in the First Light's dawn and
the district's own light, with a light that runs once along its threshold.
Below it the district's page is its own, unchanged — its layout, colours and
tools. The strip is short enough (34% of the screen's height, at most 360 px;
on phones 30%, at most 250 px) that the district's search and tools stay in
the first screen, and it is not shown over search results or filtered views.

It is the same picture as the door, so the passage is continuous: the strip's
image carries where it lies in the door's picture (`data-dw-crop`), and the
open door is moved and clipped to show exactly those pixels in exactly that
place before it gives way (`landOnWorld` in `engine.tsx`).

The strips are crops of the door pictures' originals (1360 × 2048), each
1360 × 640 around the door's subject, enlarged four times with Real-ESRGAN
(`tools/cinematic/sr.py`) and saved at 2720, 1920, 1280 and 800 px wide
(`world-<district>-<width>`); the largest AVIF is about 160 KB. As with the
doors, Mercadito's and Comunidad's show people and say "Ilustración".

## Roxi on the page

The orb and its line say what Roxi is really doing, never something animated
for show. Her panel publishes its real state on a small bus
(`src/ui/roxi/state-bus.ts`); the page only reads it. In order of precedence:

| Shown | When |
| --- | --- |
| No está disponible ahora | she is not configured, or stays quiet on this page (a visitor sees who she is and the way in instead) |
| No pudo terminar | the microphone failed, or the last message was left unanswered (a cut, a time-out) |
| Espera tu permiso | a confirmation card is open in her panel |
| Buscando en Yavaya | a search tool is running |
| Preparándolo | another tool is running (a listing, a form) |
| Te está respondiendo | she is speaking |
| Entendiendo lo que pediste | a message waits for her answer, or the conversation is connecting |
| Te escucha | the microphone is open |
| Listo | for 2.4 s after a tool really finished or a confirmation was allowed |
| Lista cuando la necesites | anything else: idle |

A visitor sees who she is and the way in (`/login?next=/first-light`). A
member's "Hablar con Roxi" opens her panel; it is not offered while the panel
is open, and when the panel is tucked away it brings it back.

## Sound

- **Off by default.** Nothing plays, and no audio context is even created,
  until the visitor turns sound on with the switch on the page.
- **Kept per device** in `localStorage` (`yavaya.sound`); in a private
  window without storage the choice lasts the page view.
- **Synthesised** with Web Audio: tones and filtered noise through one
  compressor and a short room reverb. Nothing is downloaded.
- **One engine, no pile-ups**: every cue has a cooldown (a door 160 ms, the
  Guardian's moment 8 s) and at most three voices sound at once; a cue that
  would exceed either is dropped, not queued.
- **Silent when the tab is hidden.**
- **Only here.** The engine is used by this page alone. It is never used in
  sensitive places: sign-in, payments, Espacio Violeta, reports, or anything
  a member would not want overheard.

Cues: sound turned on, a door (each district a note of a pentatonic scale), the
transition through a door, Roxi called, Roxi finished something, the
Guardian's moment.

## Performance

The targets are the field ones: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at the
75th percentile, which only real visits can show. The site already records
them: every page reports its vitals from real browsers to `/api/metrics`,
and Admin → Visitas shows each page's share of good and poor results, by
device. Read `/first-light` there before it replaces the home page.

What the lab shows (5.9 kB of page JavaScript, 122 kB first load with the
shared framework; the budget check passes):

| Lighthouse 12, mobile, yavaya.lat, 6 November 2026, median of 3 | First Light | current home page |
| --- | --- | --- |
| Performance | 91 | 96 |
| Largest paint (simulated slow 4G) | 3.2 s | 2.6 s |
| Largest paint (as observed) | 0.58 s | 0.60 s |
| Total blocking time | 126 ms | 128 ms |
| Layout shift | 0 | 0 |
| Accessibility | 100 | 100 |

(Accessibility was 98 on both pages until the footer's column titles became
`h2`: as `h4` they skipped two heading levels after each page's `h2`s.)

The largest paint is the horizon (the biggest picture on screen), which
loads with high priority and is painted at first paint. The simulated figure
counts every file the page asks for before then over a slow 4G line, and
here that includes the four Guardian layers (about 145 KB on a phone) beside
the horizon: that is why it is over 2.5 s while the home page, with one
photograph, is at it. As observed, both paint in about 0.6 s. The layout
reserves every picture's box, so nothing shifts when it arrives.

Three choices keep the scene cheap once it runs, each measured: the full
tier switches on only after the page has loaded (switching it on earlier
cost 300 ms of blocking time and pushed back the largest paint); the light
that passes through the feathers is a band the compositor moves under a
fixed mask, not a moving mask (that repainted the Guardian every frame); and
the pointer's position is set only on the three layers that drift with it.
With the full scene running and no input, the main thread does about 9 ms
of work in 3 s, with no repaints.

## Tests

```bash
npx vitest run tests/unit/first-light.test.ts     # pictures exist, tiers, Roxi's states, sound limits
npx vitest run tests/integration/site-looks.test.ts  # the switches: defaults, administrators only, audited
npm run build && npx next start -p 3100            # or any local server
BASE=http://localhost:3100 node tests/e2e/first-light.cjs
```

The e2e script (Playwright) checks the home page on a phone and at seven
widths, that it is indexed and keeps its structured data, sound off by
default with no audio context, the choice kept and reversible, layout shift,
the doors (pointer and keyboard) and the door settling onto the district's
world, every district's world at two widths (and none over search results),
reduced motion and no console errors. Given an administrator (`LOOKS_ADMIN`,
see the script's header) it turns each switch off in Admin, checks that the
previous design is back — the old home page with its header, the preview at
`/first-light`, the districts as they were — and turns it on again. Given a member (see
`tests/e2e/README.md`, with the site run as `ROXI_AGENT_ID=agent_localtest`)
it also checks Roxi's states against a stand-in for her agent: idle,
understanding while a question waits, a problem when the connection drops,
called back from the page when tucked away, idle again when closed.

## The master film

`tools/first-light-film/` (at the repository root) is the page as a
24-second film, made from the same pictures, words, timings and sounds — the
reference for the page's motion. Its README has the beats and how to render
it.

## Not yet built

The next milestones, each to be shown before it replaces anything:

- Roxi's states across the whole site, not only on this page;
- a living activity feed — of real events only, never invented ones;
- the map, geographically accurate;
- the Guardian's moments tied to real events.
