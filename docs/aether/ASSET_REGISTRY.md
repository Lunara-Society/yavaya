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
  holds the originals as `refs/R01-1000192794.gif` … `refs/R56-1000192856.gif`
  and the frame sheets as `sheets/R01.jpg` … (a later session reads them with
  the Artifact tool's `read` action and the file's path). Every file is
  identified below by its SHA-256, so a copy can always be checked; after
  the second send the page held 81 files (the page, 39 originals, 41
  sheets), listed back and matched on 27 Nov; the third send added 35
  (17 originals, 17 sheets and one faces sheet; page version 4).

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

### 3b. Second send, 27 November 2026 (private)

Received with the owner's words: "I'm just giving you the direction of her
movement and Roxi should have a glow in gold instead of purple." Analysed in
[REFERENCE_MATRIX.md](REFERENCE_MATRIX.md) §6 and §7; measurements in
`design/references/aether/metrics-batch2.json` (full hashes there); face
scores in `design/references/aether/identity-2026-11-27.json`. AI-generated
design material, Yavaya's own. **Illustrative content only: none of it is
data.** The women in R26–R39 are not Roxi: they give movement, gesture and
expression, never her face, hair or clothes (AX-D016).

| Ref | Owner file | SHA-256 (first 16) | Bytes | Pixels | Frames | Loop (s) | Shows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R21 | `1000192820.gif` | `e8a304ab86e64957` | 563,284 | 504 × 508 | 6 | 7.8 | Diáspora: globe to country communities |
| R22 | `1000192819.gif` | `4d4fbe3f3e22dafd` | 554,496 | 337 × 764 | 6 | 7.8 | Movilidad: route, directions, arrival (tall) |
| R23 | `1000192818.gif` | `46437871cdd5157f` | 562,537 | 506 × 508 | 6 | 7.8 | Barrio: places on a 3D neighbourhood map |
| R24 | `1000192817.gif` | `a330e9fc8ed185b2` | 543,072 | 335 × 764 | 6 | 7.8 | Campo: crystal sprout to land listings (tall, gold) |
| R25 | `1000192821.gif` | `4cb4ef4f43d7de0c` | 588,630 | 505 × 495 | 6 | 10.8 | Diáspora: tap the globe, map of Nicaragua |
| R26 | `1000192822.gif` | `c0b56ea8cd573544` | 631,592 | 501 × 508 | 6 | 10.8 | the app with Roxi at its centre (montage) |
| R27 | `1000192826.gif` | `797004c34a02fd5a` | 605,902 | 358 × 358 | 12 | 7.8 | Roxi-like: presents a listing from a glass card |
| R28 | `1000192827.gif` | `d358efec2802e62e` | 509,642 | 358 × 357 | 12 | 2.88 | Roxi-like: materialises from particles |
| R29 | `1000192831.gif` | `f015914bfa9fe4eb` | 222,162 | 357 × 358 | 12 | 2.64 | Roxi-like: turns and walks away (back view) |
| R30 | `1000192830.gif` | `73b0ea25b908edfe` | 193,450 | 358 × 358 | 12 | 2.64 | Roxi-like: welcome gesture |
| R31 | `1000192829.gif` | `d5b9c26984b704b9` | 196,010 | 358 × 358 | 12 | 2.64 | Roxi-like: walks in, turns to face |
| R32 | `1000192828.gif` | `cb3c42fde8fcbcb2` | 189,682 | 358 × 358 | 12 | 2.64 | Roxi-like: walks away into depth |
| R33 | `1000192834.gif` | `fa4d14924cf319b6` | 218,186 | 358 × 358 | 12 | 2.64 | Roxi-like: explaining gestures |
| R34 | `1000192833.gif` | `fc1b4978081dc0b6` | 210,872 | 357 × 358 | 12 | 2.64 | Roxi-like: listening, nod, explain |
| R35 | `1000192832.gif` | `9c81e587c5698007` | 240,596 | 357 × 358 | 12 | 2.64 | Roxi-like: looks and points off-screen |
| R36 | `1000192835.gif` | `a80e803c5691dc7d` | 216,150 | 357 × 358 | 12 | 2.64 | Roxi-like: thinking pose |
| R37 | `1000192839.gif` | `b44f023a3da20b75` | 557,518 | 358 × 356 | 12 | 2.76 | Roxi-like close-up: joy |
| R38 | `1000192838.gif` | `d8fedfdf79eb5f46` | 435,651 | 358 × 356 | 12 | 2.76 | Roxi-like close-up: concern |
| R39 | `1000192837.gif` | `4bc62858e8c1790e` | 439,032 | 358 × 357 | 12 | 2.76 | Roxi-like close-up: surprise |

Duplicate dropped (AX-D014): the send's first file, `1000192811.gif`
(SHA-256 `f418352a44b5f5ab…`), is byte-identical to R20, so only R20 is kept.
The two Diáspora GIFs (R21, R25) are different animations and both stay.

Kept on the private page: `refs/R21-1000192820.gif` …
`refs/R39-1000192837.gif`, sheets `sheets/R21.jpg` … `sheets/R39.jpg`, and
`sheets/faces-b2.jpg` (Roxi's source, two more images of her, and the closest
frame of R28, R37, R38 and R39, each with its score).

Face models for the identity check: a measuring tool, never shipped, not in
the repository (download from https://huggingface.co/opencv when needed).

| File | SHA-256 | Bytes | Licence (OpenCV model zoo) |
| --- | --- | --- | --- |
| `face_detection_yunet_2023mar.onnx` | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` | 232,589 | MIT |
| `face_recognition_sface_2021dec.onnx` | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` | 38,696,353 | Apache-2.0 |

### 3c. Third send, 27 November 2026 (private)

Received with the owner's words "Sending more gifs now". Analysed in
[REFERENCE_MATRIX.md](REFERENCE_MATRIX.md) §8; measurements in
`design/references/aether/metrics-batch3.json` (full hashes there); face
scores in `design/references/aether/identity-batch3.json`. AI-generated design
material, Yavaya's own. **Illustrative content only: none of it is data.** The
woman in R40–R56 is not Roxi, and the "YAVAYA" marks on the panels are not
Yavaya's logo (AX-D016, AX-D017).

| Ref | Owner file | SHA-256 (first 16) | Bytes | Pixels | Frames | Loop (s) | Shows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R40 | `1000192836.gif` | `107df2ca6c981c36` | 490,596 | 358 × 358 | 12 | 2.76 | close-up: thinking |
| R41 | `1000192840.gif` | `90841f8058c3f029` | 271,857 | 357 × 357 | 12 | 2.64 | crystal arm while reaching out |
| R42 | `1000192842.gif` | `2e546ee536533f25` | 287,045 | 357 × 358 | 12 | 2.64 | rises in light, lands |
| R43 | `1000192841.gif` | `ff80bf103e86b3bd` | 364,261 | 358 × 358 | 12 | 2.64 | breaks into shards, re-forms walking |
| R44 | `1000192847.gif` | `69e4c8cb46a36ca1` | 440,596 | 355 × 357 | 12 | 3 | glass echoes merge back |
| R45 | `1000192846.gif` | `7cd9ca21a39e9cc5` | 415,952 | 355 × 356 | 12 | 3 | liquid glass while offering a hand |
| R46 | `1000192845.gif` | `1c989c10215cb9e3` | 240,823 | 355 × 356 | 12 | 3 | walks away in glass |
| R47 | `1000192844.gif` | `914d9e4f7628c278` | 292,201 | 358 × 358 | 12 | 3 | turns into a line of light and back |
| R48 | `1000192843.gif` | `355e57d5a62c44a6` | 242,946 | 356 × 356 | 12 | 3 | fades while offering a hand |
| R49 | `1000192852.gif` | `629b99c5504eef4f` | 626,734 | 358 × 357 | 12 | 2.64 | touches a glass menu panel |
| R50 | `1000192851.gif` | `4113fa34a5a12b0f` | 590,774 | 354 × 358 | 12 | 2.64 | small figure opens Mercadito on the app |
| R51 | `1000192850.gif` | `f2655478f3aecef3` | 595,964 | 357 × 356 | 12 | 2.64 | climbs out of the screen |
| R52 | `1000192849.gif` | `6fe93b5c532dbd4e` | 476,659 | 357 × 355 | 12 | 2.64 | sits on the district bar, talks |
| R53 | `1000192848.gif` | `208d61b7ecab2c63` | 394,902 | 357 × 357 | 12 | 2.64 | steps out of a line of light |
| R54 | `1000192853.gif` | `78eb770074e2d213` | 594,721 | 353 × 358 | 12 | 4.2 | taps a tile with the member's finger |
| R55 | `1000192857.gif` | `b82634021cde9c57` | 772,456 | 355 × 354 | 12 | 4.2 | touches a glass wall menu |
| R56 | `1000192856.gif` | `9a3a5f86afa37db9` | 738,550 | 353 × 355 | 12 | 4.2 | walks in, shrinks, points at Santuario |

Duplicates dropped (AX-D014): `1000192839.gif`, `1000192838.gif` and
`1000192837.gif` are byte-identical to R37, R38 and R39 (SHA-256
`b44f023a3da20b75…`, `d8fedfdf79eb5f46…`, `4bc62858e8c1790e…`); the earlier
copies are kept.

Kept on the private page: `refs/R40-1000192836.gif` …
`refs/R56-1000192856.gif`, sheets `sheets/R40.jpg` … `sheets/R56.jpg`, and
`sheets/faces-b3.jpg` (Roxi's source, two more images of her, R40 and R56,
each with its score).

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
| Roxi reference sheet: three-quarter, profile, back, face close-ups, hands, hair back, jacket details (same outfit and light) | 3D master (S0), identity tests | the owner, or generated with approval | NEEDS CONFIGURATION (owner decision); the second send does not fill it (other faces) |
| Guardian head close-up master, at least 2048 px | C01, C06 (R01, R05) | the owner's artwork, or rendered from a 3D Guardian | missing |
| 3D Guardian | real-time C02, C04, C05 | Blender, from the approved artwork | missing; optional (video tier first) |
| District hero art for all 15 districts in black and gold | C23 | generated or drawn, approved by the owner | 7 older "worlds" exist on the website; board districts have none |
| Gold line icon set (districts, actions) | C05, C20, C21 | drawn for Yavaya | the app has icons in the older palette |
| Official wordmark, vector | headers | the owner | raster logos only |
| Map style for the light-map, and its tile source | C32, C51 | made for Yavaya on the platform's map data | missing |
| Sounds for the new motions | GENESIS, TRANSCENDENCE | `mobile/tools/audio/make-sounds.py` (synthesised) | to make |
| Motion clips for Roxi (walk, gesture, present) | CORPUS (direction: R27–R39) | licensed library or the owner's phone motion capture | owner decision on sources |

## 6. Adding an asset

Record, in the same change: the file and where it is kept, its source, its
owner and licence, whether it is AI-generated, its SHA-256 for anything
private, and the capability (C-number) it serves. An asset without a licence
we can state is not used.
