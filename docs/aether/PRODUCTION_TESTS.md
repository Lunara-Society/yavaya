# Production tests

How the programme proves its claims: the suites that exist, the acceptance
tests every Aether × Anima capability must pass, and the record of what was
run in each chapter. Earlier runs (Chapters 00–09) are in
[../synapse/TEST_REPORTS.md](../synapse/TEST_REPORTS.md).

## 1. Suites that exist

| Suite | Command | Last result | When |
| --- | --- | --- | --- |
| Platform typecheck, tests (Vitest, real Postgres), build, release step | `cd platform && npm run typecheck && npm test && npm run build` (CI runs all of it on every push) | 96 files, 863 tests pass | Chapter 09 |
| Mobile typecheck and unit tests | `cd mobile && npx tsc --noEmit -p . && npm test` | 41 pass | Chapter 09 |
| Shaders compiled and rendered by Skia | `cd mobile && npm run check:shaders` | 6 of 6 | Chapter 09 |
| Local end-to-end sign-in | production build on port 3100 (script was in the old session's scratchpad) | 18 of 18 | Chapter 09 |
| Reference measurements | `python3 -I design/references/aether/tools/analyse_refs.py <out> <files>` | reproduces `design/references/aether/metrics.json` | AX-02 |
| Face identity check | `python3 design/references/aether/tools/identity_check.py <models> <source> <out> <files>` (OpenCV, with the YuNet and SFace models from huggingface.co/opencv) | `design/references/aether/identity-2026-11-27.json`, `identity-batch3.json`, `identity-batch4.json`, `identity-small-controls.json` | AX-02, second to fourth sends |

## 2. Acceptance tests for the programme

A capability is REAL only when its tests below pass where it must work (for
the app: on a phone).

| ID | Test | Passes when |
| --- | --- | --- |
| T-ID-01 | Roxi identity | front and three-quarter renders of any Roxi (3D, 2.5D or video) score at least 0.80 SFace cosine against her source with `design/references/aether/tools/identity_check.py` (her own images score 0.95–0.99, and 0.88–0.90 shrunk to a GIF-size face of 68–87 px; other generated women 0.07–0.48; the closest reference 0.62), and the owner recognises her without prompting |
| T-ID-02 | Guardian identity | any new Guardian rendering matches the approved artwork in pose, silhouette and palette; the owner approves |
| T-ID-03 | Roxi's proportions | front renders: the five YuNet landmark ratios each within ±6 % of her source (IDENTITY_SPEC §5); NOT IMPLEMENTED |
| T-ID-04 | Roxi's colours | ΔE2000 against her measured colours: skin and hair ≤ 5, clothing and boots ≤ 8; NOT IMPLEMENTED |
| T-ID-05 | Roxi's silhouette | front render's matte against `roxi-matte.png`, IoU ≥ 0.95; NOT IMPLEMENTED |
| T-ID-06 | Nothing that is not hers | the IDENTITY_SPEC §3 list ticked for every view (manual) |
| T-ID-07 | The owner recognises her | a sheet of renders shown without prompting; the owner says it is Roxi |
| T-LAYER-01 | Function without rendering | with every visual flag off and no 3D pack on the phone, every flow completes (PRODUCTION_ARCHITECTURE §2) |
| T-DEGRADE-01 | Degradation | an engine that throws or draws nothing for 1.5 s is replaced by the next level down; the screen stays usable |
| T-TRANS-01 | Interruptible transformations | a touch at any progress stops a transformation; back at any progress reverses it; the destination takes touches from the first frame |
| T-STATE-01 | Continuity | scroll, filters, search, tab and drafts come back after back, after a deep link and after the screen was unmounted; nothing kept after sign-out |
| T-IDLE-01 | Calm when idle | an untouched screen draws no new frames after its last transition (frame counter) |
| T-COLOUR-01 | Permanent palette | the contrast values of VISUAL_LANGUAGE §2 hold as assertions in a test like `design.test.ts` |
| T-RX-01 | Roxi's channels | each channel changes alone; a stronger layer overrides only its body regions (unit tests) |
| T-RX-02 | Roxi does several things at once | she speaks while moving, listens while her material changes, gestures while her scale changes and keeps talking across five route changes, at full frame rate on the Samsung |
| T-GESTURE-01 | No accidental gestures | no custom gesture starts in the system gesture zones; every gesture has a button; phone motion triggers nothing |
| T-CONTENT-01 | Unseen content (the piano test) | a test database (never production) gets listings Roxi has never seen (an antique piano, a tractor, a wedding dress, a farm machine); she presents each with no code change |
| T-CONTENT-02 | Incomplete content | listings without photo, price or place: she adapts, invents nothing, the page still opens |
| T-FACTS-01 | Never invents | every number, price, place, rating, availability and credential in her transcript appears in the descriptor or a tool answer (automatic transcript check) |
| T-RULES-01 | Business rules unchanged | the platform suite passes; no diff to token prices, `config/business-rules.ts` or district rules without an owner decision |
| T-ROXI-01 | Dismiss and interrupt | a tap, swipe or speech stops her motion within 200 ms; every flow completes with Roxi switched off |
| T-BLOCK-01 | Effects never block | every transition can be skipped; the primary action is usable before any effect ends |
| T-CLASSIC-01 | Classic | one switch restores the previous look; remembered across launches |
| T-PHOTO-01 | Flashes | every cinematic render, checked with the analysis script: at most 3 general flashes per second, no full-frame white flash |
| T-A11Y-01 | Access | reduce motion honoured; TalkBack labels on every control; words at least 4.5:1 |
| T-PERF-01 | Phone budgets | frame time and memory within the budget on the owner's Samsung and a 120 USD-class Android; a tier drops when it is not |
| T-PRIV-01 | Privacy | Espacio Violeta never in a native preview, screenshot or Roxi context; Roxi never publishes, pays or sends |
| T-DATA-01 | No illustrative data | a check fails the build if text or numbers from the references (for example "C$ 28,000", "Restaurante El Patio", "Tania G.") appear in app strings or fixtures outside tests |

## 3. Record

### AX-00 to AX-03 (27 Nov 2026)

| What | How | Result |
| --- | --- | --- |
| References read | every frame of all 18 GIFs and both PNGs extracted and viewed (contact sheets) | done; findings in REFERENCE_MATRIX.md |
| Reference measurements | analysis script over the 20 files | metrics.json written; 0 flash failures (max 0.5 per second) |
| R09 against Roxi's source | pixel comparison | identical pixels (different metadata) |
| GIF Guardian against the approved Guardian | side-by-side render of `guardian2` layers, logo and R06's last frame | same pose, palette and shape |
| Live capability register | `/status` on yavaya.lat | 56 real, 8 needing configuration, 1 demo, 0 mock (same as 26 Nov) |
| Repository visibility | GitHub, through the session's tools | public |
| Platform, mobile, shader suites | not re-run | this chapter changed no app or platform code (only `docs/` and `design/references/`) |

### AX-02, second send (27 Nov 2026)

| What | How | Result |
| --- | --- | --- |
| Duplicates | SHA-256 and frame correlation against both sends | 1 duplicate dropped (the same file as R20); the Diáspora pair kept (different animations) |
| Frames read | contact sheets of all 19 new GIFs | done (REFERENCE_MATRIX §6) |
| Measurements | analysis script | `metrics-batch2.json`; 0 flash failures |
| Identity | `identity_check.py` on 13 Roxi-like GIFs, with 2 positive and 6 negative controls | closest 0.59; close-ups 0.21–0.37; her own images 0.95–0.99 (REFERENCE_MATRIX §7) |
| Suites | not re-run | no app or platform code changed |

### AX-02, third send (27 Nov 2026)

| What | How | Result |
| --- | --- | --- |
| Duplicates | SHA-256 and frame correlation against R01–R39 and within the send | 3 dropped (the same files as R37, R38, R39); 17 new (best frame-by-frame match 0.57; no frame pair reaches 0.8) |
| Frames read | contact sheets of all 17 new GIFs | done (REFERENCE_MATRIX §8) |
| Measurements | analysis script | `metrics-batch3.json`; 0 flash failures |
| Identity | `identity_check.py` on the 17, with the 2 positive controls | R40 0.37 (0.30–0.46); R56 one face 0.18; the rest under 60 px |
| Suites | not re-run | no app or platform code changed |

### AX-02, fourth send (27 Nov 2026)

| What | How | Result |
| --- | --- | --- |
| Duplicates | SHA-256 and frame correlation against R01–R56 and within the send | none (best frame-by-frame match 0.28); R61 kept as a variant of R59 |
| Frames read | contact sheets of all 15 GIFs | done (REFERENCE_MATRIX §9) |
| Measurements | analysis script | `metrics-batch4.json`; 0 flash failures (at most 0.5 per second) |
| Identity | `identity_check.py` on the 15, with the 2 positive controls | one woman (0.6–0.9 to each other); 0.18–0.38 against Roxi; R65, R66, R68 too small |
| Size control | Roxi's source and film grade shrunk to faces of 65–87 px, saved with 256 colours | 0.88–0.90 (`identity-small-controls.json`) |
| Suites | not re-run | no app or platform code changed |

### The logo and the typography (27 Nov 2026)

| What | How | Result |
| --- | --- | --- |
| Same eagle as the brand files? | side by side with `platform/public/brand/logo-1080.webp` and `logo-mark-384.webp` | the same eagle, here alone with the sun and mountains |
| Gold | analysis script (`metrics-brand.json`) | logo `#F0920C` / `#973D05`; lettering `#F89511` / `#923C03` |
| Free font for the lettering | "YAVAYA" set in Cinzel beside the owner's lettering | close match at the bold weight; Cinzel's licence checked in its `OFL.txt` (SIL OFL 1.1) |

### AX-04 design (27 Nov 2026)

| What | How | Result |
| --- | --- | --- |
| Code paths named in the four documents | each checked to exist in the repository | all exist (`mobile/tools/synapse/check-shaders.mjs` corrected) |
| Permanent palette contrast | WCAG relative luminance, on `#000000` and `#18181B` | champagne 4.67 (deep, edges only) to 16.96; silver 13.28 and 18.24; titanium 3.42 (lines only) to 10.65 |
| 3D candidates | npm registry, 27 Nov | versions, peers and New Architecture support as in PRODUCTION_ARCHITECTURE §4.2; nothing installed |
| Builds and suites | none run: this chapter changes documents only | — |
