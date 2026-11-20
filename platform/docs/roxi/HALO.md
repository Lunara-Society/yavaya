# Roxi's Halo

Roxi's face since 20 November 2026: three arcs of obsidian around a violet
light with a golden heart. The owner chose it from the Phase III prototypes
(Halo, Blades, Gate) and asked for obsidian black, violet and gold, with no
grey and no white. It is part of Presence, Roxi's visual system
(FLAGSHIP.md, "Names").

## Where it shows

- **Her panel's header** (`RoxiHalo` in `ui/roxi/halo.tsx`), 68 px, and up to
  220 px while a voice conversation is on.
- **Her launcher**: the same arcs as a still image, `public/roxi/halo-mark.svg`,
  made by `haloMarkSvg()` in `ui/roxi/halo-shape.ts` (a test checks they still
  match), so it adds no script to any page; its light breathes slowly, not at
  all with reduced motion.

## What moves it

Only what Roxi is really doing, read from the state bus (`state-bus.ts`) by
`haloPose`:

| Roxi | Halo |
|---|---|
| Nothing happening | Resting: the arcs breathe |
| The member speaks | Listening: the arcs part, further with the real loudness of their voice |
| Roxi speaks | Speaking: the light and the arcs follow the real loudness of her voice |
| An answer or a look-up is pending | Processing: the arcs turn like a gyroscope; a scan line passes |
| She writes a draft or fills a form | Creating: the arcs form a cage |
| Something is saved or opened | Executing: the ring clicks round one step at a time |
| A confirmation waits for the member | Awaiting: the arcs close around one point; a beam of light |
| A step finished | Completed: a glint of gold crosses the arcs |
| The microphone failed, or a message went unanswered | Error: one arc slips; the light turns amber |

The loudness is the one the panel already measures for the orb
(`getInputVolume`/`getOutputVolume`), never a made-up envelope. Tests:
`tests/unit/roxi-halo.test.ts`.

## Two levels, one Roxi

WebGL, hand-written, no library (about 600 triangles, one draw call per arc),
where the device affords it; a drawing of the same arcs in SVG, moved by the
same springs, on phones with little memory or two cores, when saving data,
with reduced motion (then in still frames), or without WebGL. Only the
drawing changes: Roxi does the same things on every phone.

It draws only while her panel is open and stops while the tab is hidden.

## Colours

Obsidian black stone whose reflections are violet, never silver; the key
light's glints and the cut edges champagne gold; a violet seam along each
arc's inner edge; and the hottest point of the light gold, capped so a loud
voice widens the violet instead of bleaching it toward white. An error turns
the light amber.

## Switch

Admin → Diseño del sitio → "Roxi: el Halo" (`roxi.halo`), **on** by default
(`SITE_LOOK_RULES.roxi_halo`). Off, the gold orb (`orb.tsx`) is back in the
panel and on the launcher, exactly as it was.
