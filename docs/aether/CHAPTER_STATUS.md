# Chapter status

The Aether × Roxi Anima chapters, in the owner's order, with their state and
their end-of-chapter record. Synapse Chapters 00–09 are in
[../synapse/CHAPTER_INDEX.md](../synapse/CHAPTER_INDEX.md).

| Chapter | Title | Received | State |
| --- | --- | --- | --- |
| AX-00 | The Master Constitution | 27 Nov 2026 | **Done**: stored word for word ([CONSTITUTION.md](CONSTITUTION.md)) |
| AX-01 | Persistent project memory and capability classification | 27 Nov 2026 | **Done** (documents; no product change) |
| AX-02 | Reference analysis and reference-to-capability matrix | 27 Nov 2026 | **Done** for all 71 references (analysis; references kept private); the owner's logo and typography recorded (AX-D018) |
| AX-03 | Roxi digital human pipeline | 27 Nov 2026 | **Evaluation done; master character not made**: needs the inputs and decisions in [ROXI_PIPELINE.md](ROXI_PIPELINE.md) §9 |
| AX-04 onward | not received yet | — | proposal in §3 until the owner's texts arrive |

Still open from Synapse: the owner's phone test of app 0.4.0
([../synapse/NEXT_CHAPTER.md](../synapse/NEXT_CHAPTER.md)); its results come
before any new app build.

## 1. Dependencies

From [MASTER_ARCHITECTURE.md](MASTER_ARCHITECTURE.md) §8: AX-01 feeds every
chapter; AX-02 feeds the look (AETHER, TRANSCENDENCE), the flows (INFINITY)
and the cinematic moments (GENESIS); AX-03 feeds AX-04, then CORPUS → VITALIS
→ VOX lip sync → SENTIENCE expression, IMPOSSIBILIS and OMNIPRAESENTIA,
then SYMBIOSIS → ABSOLUTA → GENESIS in real time. INFINITY needs only the
mobile API to grow, not 3D Roxi.

## 2. End-of-chapter records

### AX-00 · The Master Constitution

- Done: the owner's text stored word for word, with the 20 references logged.
- Tested: nothing to test.
- Incomplete: none.
- Needs: the owner's texts for the chapters after AX-03.

### AX-01 · Persistent project memory

- Done: `docs/aether/` with MASTER_ARCHITECTURE, CHAPTER_STATUS,
  ASSET_REGISTRY, ROXI_CAPABILITIES, VISUAL_CONSTITUTION,
  TECHNICAL_DECISIONS, PRODUCTION_TESTS (plus CONSTITUTION, REFERENCE_MATRIX,
  ROXI_PIPELINE and README). Every existing capability classified with the
  constitution's labels (MASTER_ARCHITECTURE §4); the thirteen systems mapped
  onto the code (§5); Roxi's behaviour architecture designed (§6);
  dependencies documented (§8). Pointers added at the top of the Synapse
  files whose role moved here.
- Tested: the classification was checked against the code (mobile API
  routes, database tables, district and board registries, capability
  register) and the live `/status` page (56 real, 8 needing configuration,
  1 demo, 0 mock).
- Incomplete: website rows rely on the 26 Nov baseline plus spot checks; no
  signed-in checks of the live site (by rule).
- Needs: nothing external.

### AX-02 · Reference analysis

- Done: every frame of all 20 references extracted, measured and read;
  52 capabilities identified (C01–C52) with technique, data source, missing
  assets and state; business-rule conflicts listed; identity checks (R09 is
  Roxi's source; the women in R03, R08, R10 are not Roxi; the GIF Guardian
  matches the approved one); palette measured; photosensitivity checked.
- Tested: measurements reproducible with the committed script; flash check
  passes on all references (maximum 0.5 per second).
- Incomplete: motion between keyframes is inferred, and must be designed and
  approved per capability when it is built.
- Needs: the missing assets in ASSET_REGISTRY §5; the owner's decisions on
  the features in REFERENCE_MATRIX §4.
- Second send (27 Nov): 20 files; 1 duplicate of R20 dropped; 19 kept
  (R21–R39); every frame read; 13 capabilities added (C53–C65); the platform
  differences listed (REFERENCE_MATRIX §6). Faces measured against Roxi's
  source (§7): none is hers (closest 0.59; her own images 0.95–0.99), so
  these GIFs set her movement only (AX-D016). Her glow is gold (AX-D013).
- Third send (27 Nov): 20 files; 3 duplicates of R37–R39 dropped; 17 kept
  (R40–R56); every frame read; 8 capabilities added (C66–C73): her
  transformations, entrances, exits, and how she lives on the interface.
  Faces: R40 0.37, R56 0.18, the rest too small; the outfit drifts further
  (tactical items). The GIFs' logo marks and "Mi Yavaya" tab are not
  Yavaya's (AX-D017).
- Fourth send (27 Nov): 15 files, all new (R57–R71); every frame read; 8
  capabilities added (C74–C81). One consistent woman across the send, but
  not Roxi (0.18–0.38; Roxi's own images at GIF size 0.88–0.90). Gold glow,
  a gold "V" mark (AX-D017), and flows for features the platform doesn't
  have (REFERENCE_MATRIX §9).
- All references are in (the owner, 27 Nov: "All has been sent."), with the
  logo and the typography last (REFERENCE_MATRIX §10, AX-D018). The seven
  questions, updated with what the four sends showed, were sent on 27 Nov
  (chat and the private page); answers awaited.

### AX-03 · Roxi digital human pipeline

- Done: the assets evaluated (one front image; face about 250 px wide);
  every technique the constitution lists assessed; six pipelines compared;
  pipeline chosen (AX-D008); stages S0–S9 with checks; phone budgets; the
  runtime candidates checked on npm (AX-D009).
- Tested: nothing executable (no master exists yet).
- **Not done: the master character and its mobile variants.** One front
  image cannot give an exact 3D Roxi, and a generic body would fail the
  identity rule. Blender is not installed in this container (reachable for
  download).
- Needs: the owner's decisions in ROXI_PIPELINE §9 (new reference views;
  sending her image outside; paid tools; her outfit; private storage for
  masters).

## 3. Proposed next chapters (until the owner's texts arrive)

| Proposed | What | Gate |
| --- | --- | --- |
| AX-04 | Roxi reference sheet (S0) and the 3D runtime spike: Blender + MPFB base fitted to her front image; the same test GLB in both renderers on two phones; the identity test (T-ID-01) on every render | the owner's decisions 1, 2 and 5 in ROXI_PIPELINE §9 |
| AX-05 | Aether tokens and the black-and-gold look behind Classic (tokens, glass, ribbons, icons) | the owner confirms the gold (AX-D011) |
| AX-06 | Mobile API v1 expansion: content descriptors for every district, search, filters, item pages | none (reuses the website's domain functions) |
| AX-07 | INFINITY flows on real data: home, search, district hero → list → page → action, per the reference patterns | AX-05, AX-06 |
| AX-08+ | CORPUS, VITALIS, VOX, SENTIENCE, IMPOSSIBILIS, OMNIPRAESENTIA, SYMBIOSIS, ABSOLUTA, GENESIS | AX-04 result |
