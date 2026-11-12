# Distritos en 3D

The classic home page's thirteen district cards, given near and far. Asked for
by the owner on 12 November 2026 as a first, small step toward the Living
World, with the classic cards kept one switch away.

## The switch

Admin → Diseño del sitio → **Distritos en 3D** (`look.district_depth`,
`SITE_LOOK_RULES.depth`, on by default). Off, the home page is the classic one
with nothing added. It applies to the classic home page only; La Primera Luz
has its own doors.

## What a visitor gets

- **Photographs with depth.** Each card's picture has a small greyscale depth
  map; a WebGL shader shifts near parts against far ones as the eye moves.
- **Medallions.** Each district's own mark, raised in gold on obsidian and
  rendered in Blender, floats above its card. Santuario keeps its photograph
  inside a gold rim.
- **Movement from three things**: scrolling, leaning the phone (Android; iOS
  would need a permission question, which is never asked), and the mouse or a
  press, which turns the card itself.
- **Rising into place** as cards scroll in, where the browser has
  scroll-driven animations (Chrome, new Safari).

## Who gets it

Decided on the device (`ui/depth/gate.tsx`, with the First Light's
`chooseTier`). Reduced motion, Data Saver, a 2G/3G connection, 2 GB of memory
or less, or two processor cores or fewer: the classic cards, and nothing is
downloaded. Everyone else gets the engine once the page has loaded and the
browser is idle, so the first paint is the classic page's.

The engine then steps down by itself when frames are slow (two runs of 45
frames averaging over 30 ms): level 2 (everything) → level 1 (no WebGL, the
photograph slides whole) → the classic cards. The step is remembered for the
visit (`sessionStorage`, `yavaya.depth`). A lost graphics context steps down
too. Software-drawn WebGL is refused where the browser admits to it.

## Weight

| What | Size |
| --- | --- |
| Home page JavaScript on arrival | +0.26 KB (the gate) |
| Home page styles on arrival | none |
| Engine, with its styles, on demand | 6.1 KB |
| Depth maps, 13, each fetched as its card comes near | 10 KB in all |
| Medallions, 13, likewise | 89 KB in all |

`scripts/check-budget.mjs` holds the engine to 8 KB. Its styles travel inside
it as a string (`ui/depth/styles.ts`): a stylesheet loaded on demand made the
build add its loader to every page of the site.

## Remaking the pictures

`tools/depth/` at the repository root (see its README): `make-depth.py` for the
depth maps (Depth Anything V2 Small, Apache-2.0, run locally),
`glyphs.cjs` → `medallions.py` (Blender 4.5) → `finish-medallions.py` for the
medallions. A test (`tests/unit/image-files.test.ts`) fails if a card has no
depth map or medallion.

## What has and has not been verified

Verified in headless Chromium, emulating a phone and a computer
(`tests/e2e/depth.cjs`, 21 checks): it starts, draws, responds to scroll, lean
and pointer, leaves the links untouched, steps aside for every device it
should, and produces no console errors.

**Not verified: a real phone.** Smoothness, battery use and the direction of
the lean were not measured on a device; the test browser draws in software and
its frame times say nothing about a phone. The depth maps are estimates by a
model, so a picture can have a wrong edge. If it disappoints on real phones,
the switch above is the way back.
