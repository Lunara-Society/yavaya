# Asset registry

Every visual, sound and 3D asset the programme uses or needs: what it is,
where it came from, who owns it, where it is kept. From 27 Nov 2026 this file
is the registry for new entries; the Synapse registry
([../synapse/ASSET_REGISTRY.md](../synapse/ASSET_REGISTRY.md)) stays as the
record of what Chapters 00–09 added.

## 1. Storage rule (AX-D004)

The repository `Lunara-Society/yavaya` is **public**. So:

- **In the repository:** code, documents, measurements, hashes, and assets
  already public or shipped inside the app.
- **Private, until the owner decides otherwise:** unreleased design material
  (the 27 Nov references), masters of brand-critical assets (a 3D Roxi or a
  3D Guardian), anything with private content (R10 shows the owner's photo
  gallery).
- **Where private files live today:** the owner's private claude.ai page for
  this programme, https://claude.ai/artifact/SDQpvaaspuA2gMJeyDEKoe, which
  holds the originals as `refs/R01-1000192794.gif` … `refs/R20-1000192811.gif`
  and the frame sheets as `sheets/R01.jpg` … (a later session reads them with
  the Artifact tool's `read` action and the file's path). Every file is
  identified below by its SHA-256, so a copy can always be checked; the 42
  stored files were listed back and matched on 27 Nov.

No asset from a third-party game, film or brand is allowed; AI-generated
assets are declared as such.

## 2. Identity assets

| Asset | Where | Facts | Owner and licence |
| --- | --- | --- | --- |
| Roxi, source image | `mobile/art/roxi/roxi-source.png` (public in the repository since 26 Nov) | 1440 × 3088, front, full length; SHA-256 `83b37f266d542799…` (the owner's 27 Nov upload R09 has other metadata, `6969c5e65a573073…`, and identical pixels) | Yavaya; AI-generated, not a real person (owner, 26 Nov) |
| Roxi, derived | `mobile/art/roxi/roxi-matte.png`; `mobile/assets/roxi/{roxi,roxi-depth,roxi-face}.webp`; `design/films/oro/assets/roxi*.{png,js}` | figure 720 × 1544, depth 240 × 515 (estimated), face 320 × 320, film grade and points | Yavaya |
| The Guardian (wings spread, 6 Nov 2026) | `platform/public/first-light/guardian2-{body,wing-l,wing-r,tail}-{560,840,1240}.*` | four layers at up to 1240 px, RGBA | Yavaya, the owner's approved artwork |
| The first Guardian | `platform/public/first-light/guardian-*` with gold and violet light maps | 560–1240 px layers | Yavaya |
| Logo, seal, sun | `platform/public/brand/` (`logo-1080.webp`, `logo-mark-*`, `seal-*`, `sun-*`); app icon from `logo-icon-maskable-512.png` | raster only; no vector wordmark in the repository | Yavaya |
| Guardian point cloud | `design/films/oro/assets/eagle_points.js`, `eagle.png` | particle targets for assembly (C02) | Yavaya |

## 3. The owner's references of 27 November 2026 (private)

Received with the [constitution](CONSTITUTION.md); analysed in
[REFERENCE_MATRIX.md](REFERENCE_MATRIX.md); measurements in
`design/references/aether/metrics.json` (full hashes there). AI-generated
design material, Yavaya's own. **Illustrative content only: none of it is
data.**

| Ref | Owner file | SHA-256 (first 16) | Bytes | Pixels | Frames | Loop (s) | Shows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | `1000192794.gif` | `4cfdc6cdfca06bc2` | 714,496 | 413 × 414 | 9 | 7.65 | Guardian head, a feather, a hall of floating cards |
| R02 | `1000192793.gif` | `bf283bf232d04c5c` | 601,326 | 414 × 412 | 9 | 7.65 | holographic rotunda dissolving into the Guardian |
| R03 | `1000192798.gif` | `c121d10e5532be5f` | 845,961 | 389 × 432 | 9 | 7.65 | a figure (not Roxi) lifts a feather; Guardian behind |
| R04 | `1000192796.gif` | `610352d9548bcfa0` | 661,222 | 414 × 414 | 9 | 7.65 | vortex, Guardian, district crystals in orbit |
| R05 | `1000192797.gif` | `2584acea0f957b5a` | 572,142 | 414 × 414 | 9 | 7.65 | Guardian head revealed by a light sweep |
| R06 | `1000192799.gif` | `dccd5f9cd1417701` | 516,403 | 508 × 508 | 6 | 10.8 | ribbons and shards assemble into the Guardian |
| R07 | `1000192802.gif` | `1fed0f1cb3d2a602` | 406,108 | 508 × 507 | 6 | 9.0 | home, search, suggestions, results, filters |
| R08 | `1000192801.gif` | `b83b2a024b48ac55` | 648,040 | 508 × 508 | 6 | 9.0 | phone in hand: prisms, Mercadito, presenter, help card |
| R09 | `1000192803.png` | `6969c5e65a573073` | 1,238,381 | 1440 × 3088 | 1 | — | Roxi, full length (identical pixels to roxi-source.png) |
| R10 | `1000192805.png` | `dc0834c35fcd1ac8` | 1,624,786 | 1440 × 3088 | 1 | — | phone screenshot: gallery with a Mercadito concept |
| R11 | `1000192807.gif` | `ad848b9d917eb382` | 457,120 | 508 × 507 | 6 | 9.0 | Santuario |
| R12 | `1000192810.gif` | `8aa892f54e2a0f97` | 393,054 | 508 × 506 | 6 | 9.0 | YavayaGo trip |
| R13 | `1000192809.gif` | `a9f30c523d4ab2fb` | 453,691 | 506 × 508 | 6 | 9.0 | Trabajo |
| R14 | `1000192808.gif` | `5677441a816dcd1e` | 471,267 | 508 × 508 | 6 | 9.0 | Hogar |
| R15 | `1000192816.gif` | `28c03ede70427ab7` | 560,632 | 505 × 508 | 6 | 9.0 | Aprender |
| R16 | `1000192815.gif` | `f85a1a0fcf7ac088` | 432,826 | 506 × 506 | 6 | 9.0 | Negocios |
| R17 | `1000192814.gif` | `cbb4256a4ba66c20` | 600,072 | 508 × 506 | 6 | 9.0 | Animales |
| R18 | `1000192813.gif` | `18870992b63f5c2a` | 336,284 | 508 × 507 | 6 | 9.0 | Comunidad |
| R19 | `1000192812.gif` | `4006b7cfe59e329d` | 351,465 | 507 × 507 | 6 | 9.0 | Salud y Bienestar |
| R20 | `1000192811.gif` | `f418352a44b5f5ab` | 426,530 | 505 × 507 | 6 | 9.0 | Servicios |

Also kept with them: one contact sheet per reference (every frame, with its
number and time) made by `design/references/aether/tools/analyse_refs.py`.

Seen but not received: the owner's gallery (R10) shows more Guardian emblems,
a circular emblem animation and the logo on a pedestal; send them if they
should be references.

## 4. App assets carried from Synapse (unchanged)

Icons and splash (from the Guardian icon), Roxi's figure, depth and face,
twelve interface sounds synthesised by `mobile/tools/audio/make-sounds.py`,
Geist and Geist Mono (SIL OFL 1.1), country outlines (Natural Earth, public
domain), shaders in `mobile/src/render/shaders.ts`. Details:
[../synapse/ASSET_REGISTRY.md](../synapse/ASSET_REGISTRY.md). Concept film
"Presencia Oro": `design/films/oro/` (renders and HeyGen catalog audio kept
out of git; the audio licence for public use is unverified).

## 5. Missing assets

| Needed | For | Who can provide | State |
| --- | --- | --- | --- |
| Roxi reference sheet: three-quarter, profile, back, face close-ups, hands, hair back, jacket details (same outfit and light) | 3D master (S0), identity tests | the owner, or generated with approval | NEEDS CONFIGURATION (owner decision) |
| Guardian head close-up master, at least 2048 px | C01, C06 (R01, R05) | the owner's artwork, or rendered from a 3D Guardian | missing |
| 3D Guardian | real-time C02, C04, C05 | Blender, from the approved artwork | missing; optional (video tier first) |
| District hero art for all 15 districts in black and gold | C23 | generated or drawn, approved by the owner | 7 older "worlds" exist on the website; board districts have none |
| Gold line icon set (districts, actions) | C05, C20, C21 | drawn for Yavaya | the app has icons in the older palette |
| Official wordmark, vector | headers | the owner | raster logos only |
| Map style for the light-map, and its tile source | C32, C51 | made for Yavaya on the platform's map data | missing |
| Sounds for the new motions | GENESIS, TRANSCENDENCE | `mobile/tools/audio/make-sounds.py` (synthesised) | to make |
| Motion clips for Roxi (walk, gesture, present) | CORPUS | licensed library or the owner's phone motion capture | owner decision on sources |

## 6. Adding an asset

Record, in the same change: the file and where it is kept, its source, its
owner and licence, whether it is AI-generated, its SHA-256 for anything
private, and the capability (C-number) it serves. An asset without a licence
we can state is not used.
