# Aether × Roxi Anima

The programme that turns the Yavaya app into the owner's production
ecosystem for Android and iPhone: AETHER (the look and rendering) and ANIMA
(Roxi as an interactive digital human), on the existing platform. Started
27 November 2026.

**Start here, in this order:**

1. [CONSTITUTION.md](CONSTITUTION.md): the owner's words, unchanged.
2. [CHAPTER_STATUS.md](CHAPTER_STATUS.md): where the programme is and what comes next.
3. [MASTER_ARCHITECTURE.md](MASTER_ARCHITECTURE.md): the rules, the capability register, the thirteen systems on the code.
4. Then what the chapter needs:
   - [REFERENCE_MATRIX.md](REFERENCE_MATRIX.md): the 56 references (three sends), what each asks for and how to build it
   - [ROXI_CAPABILITIES.md](ROXI_CAPABILITIES.md) and [ROXI_PIPELINE.md](ROXI_PIPELINE.md): Roxi today, her primitives, how her 3D self gets made
   - [VISUAL_CONSTITUTION.md](VISUAL_CONSTITUTION.md): colour, materials, motion, safety
   - [ASSET_REGISTRY.md](ASSET_REGISTRY.md): every asset and where it is kept
   - [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md) (AX-D…) and [PRODUCTION_TESTS.md](PRODUCTION_TESTS.md)

The Synapse records (`docs/synapse/`) remain the history of app Chapters
00–09 and the source of the handoff (`handoff-yavaya.md`). The website's own
documentation is in `platform/docs/`.

Three things to know before touching anything:

- **The repository is public.** Unreleased design and masters stay private
  (ASSET_REGISTRY §1).
- **References are behaviour, never data.** Nothing from them becomes a
  product, price, person, place or count.
- **Every capability has a state** (REAL, DEMO, MOCK, INCOMPLETE, NEEDS
  CONFIGURATION, NOT IMPLEMENTED), and nothing is called done until its test
  passes where it must work.
