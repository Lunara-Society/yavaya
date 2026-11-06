# First Light

The proposed new home page: the Guardian of the First Light over a dawn
horizon, the seven districts as seven doors, Roxi as a living presence, and
sound that is off until the visitor turns it on.

**Status: preview.** It is served at `/first-light`, marked `noindex`, and
linked from nowhere but its own "Ver la portada actual" pill. The home page at
`/` is untouched (`src/app/page.tsx`, `src/ui/site/home.tsx`, `src/app/home.css`).
Promoting it means rendering `FirstLightBody` from `src/app/page.tsx`; the
current page stays in the tree, so rolling back is the reverse one-line change.
Nothing here is promoted without the owner's word.

## Where things live

| Piece | File |
| --- | --- |
| Page (route, metadata) | `src/app/first-light/page.tsx` |
| Page body (server component) | `src/ui/first-light/first-light.tsx` |
| Styles, motion, tiers | `src/app/first-light/first-light.css` |
| The engine (tier, light, doors, pausing) | `src/ui/first-light/engine.tsx` |
| Device tiers | `src/ui/first-light/tier.ts` |
| Sound | `src/ui/first-light/sound.ts`, `sound-toggle.tsx` |
| Roxi on the page | `src/ui/first-light/roxi-presence.tsx`, `src/ui/roxi/state-bus.ts` |
| Picture sizes and the list of files | `src/ui/first-light/assets.ts` |
| Pictures | `public/first-light/` |
| Tests | `tests/unit/first-light.test.ts`, `tests/e2e/first-light.cjs` |

The home page's header (the transparent bar that lies over the picture) moved
from `home.css` to `src/app/home-header.css` so both pages share it; the
current home page imports it too and renders exactly as before (the e2e test
checks its hero and its transparent header).

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
(640 ms) while the district loads, then dissolves once the district is the
page. On the still tier the click simply navigates.

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
npm run build && npx next start -p 3100            # or any local server
BASE=http://localhost:3100 node tests/e2e/first-light.cjs
```

The e2e script (Playwright) checks the page on a phone and at seven widths,
sound off by default with no audio context, the choice kept and reversible,
layout shift, the doors (pointer and keyboard), reduced motion, no console
errors, and that the current home page is unchanged. Given a member (see
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

- the district worlds behind each door;
- Roxi's states across the whole site, not only on this page;
- a living activity feed — of real events only, never invented ones;
- the map, geographically accurate;
- the Guardian's moments tied to real events.
