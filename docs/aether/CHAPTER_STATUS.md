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
| AX-04 | Production architecture, the permanent visual language and Roxi's identity (the owner's text, answer 7c) | 27 Nov 2026 | **Design done** ([PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md), [VISUAL_LANGUAGE.md](VISUAL_LANGUAGE.md), [ROXI_ENGINE.md](ROXI_ENGINE.md), [IDENTITY_SPEC.md](IDENTITY_SPEC.md); AX-D026 to AX-D037). **Build next**: stages AX-04a to AX-04e behind Classic; the first build waits for the 0.4.0 phone test (AX-D025) |
| AX-05 onward | — | — | proposal in §3 |

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

### AX-04 · Production architecture and the permanent visual language (design)

- Done: the owner's text stored word for word (CONSTITUTION); the nine
  layers mapped on today's code, with contracts between them; approaches and
  candidates evaluated against React Native 0.88 (New Architecture), Expo
  SDK 58 and Reanimated 4, then chosen (Skia as the only 2D engine; one 3D
  engine by spike S9 with pass marks; no game engines); the degradation
  ladder L4 to L0; asset delivery and size budgets; the permanent palette
  with its contrast computed; the material, optical and transformation
  engines; the district plane; continuity; touch, gestures and device
  motion; Roxi's twelve-channel engine; her identity specification.
  Decisions AX-D026 to AX-D037; tests T-ID-03 to T-ID-07, T-LAYER-01,
  T-DEGRADE-01, T-TRANS-01, T-STATE-01, T-IDLE-01, T-COLOUR-01, T-RX-01,
  T-RX-02 and T-GESTURE-01.
- Tested: every code path the documents name exists; the palette's contrast
  is computed. Nothing is built yet, so nothing has run on a phone.
- Incomplete: everything designed is NOT IMPLEMENTED until its stage is
  built, including the tools for T-ID-03 to T-ID-05 and the asset manifest
  endpoint.
- Needs the owner: champagne for the interface, or the logo's gold
  everywhere (AX-D026); the district arrangement (AX-D036); the 0.4.0 phone
  test before the first AX-04 build; Roxi's views for AX-05 (AX-D021); an
  Apple developer account before any iPhone build.

## 3. Proposed next chapters (until the owner's texts arrive)

| Proposed | What | Gate |
| --- | --- | --- |
| AX-04a to AX-04e | Build the AX-04 design in five stages: look and materials; transformations and continuity; district plane; touch and gestures; Roxi's channels on the 2.5D renderer (PRODUCTION_ARCHITECTURE §10) | the 0.4.0 phone test; the owner's approval after each stage (AX-D037) |
| AX-05 | Roxi reference sheet (S0) and the 3D runtime spike: Blender + MPFB base fitted to her views; the same test GLB in both renderers on two phones; the identity test (T-ID-01) on every render | the owner's views (AX-D021), each face 0.80 or more; spike S9's pass marks (AX-D029) |
| AX-06 | Mobile API v1 expansion: content descriptors for every district, search, filters, item pages | none (reuses the website's domain functions) |
| AX-07 | INFINITY flows on real data: home, search, district hero → list → page → action, per the reference patterns | AX-04, AX-06 |
| AX-08+ | CORPUS, VITALIS, VOX, SENTIENCE, IMPOSSIBILIS, OMNIPRAESENTIA, SYMBIOSIS, ABSOLUTA, GENESIS | AX-05 result |
