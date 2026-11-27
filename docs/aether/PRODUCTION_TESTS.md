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
| Face identity check | `python3 design/references/aether/tools/identity_check.py <models> <source> <out> <files>` (OpenCV, with the YuNet and SFace models from huggingface.co/opencv) | `design/references/aether/identity-2026-11-27.json` | AX-02, second send |

## 2. Acceptance tests for the programme

A capability is REAL only when its tests below pass where it must work (for
the app: on a phone).

| ID | Test | Passes when |
| --- | --- | --- |
| T-ID-01 | Roxi identity | front and three-quarter renders of any Roxi (3D, 2.5D or video) score at least 0.80 SFace cosine against her source with `design/references/aether/tools/identity_check.py` (her own images score 0.95–0.99, other generated women 0.07–0.48, the closest reference 0.62), and the owner recognises her without prompting |
| T-ID-02 | Guardian identity | any new Guardian rendering matches the approved artwork in pose, silhouette and palette; the owner approves |
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
