# Chapter index

> **From 27 Nov 2026:** Chapters from AX-00 onward live in [docs/aether/CHAPTER_STATUS.md](../aether/CHAPTER_STATUS.md) (Aether × Roxi Anima). This file is kept as the record of Synapse Chapters 00–09.

| Chapter | Title | Authorised | Status | Checkpoint |
| --- | --- | --- | --- | --- |
| 00 | Master directive and persistent project memory; Android app connected to EAS | 26 Nov 2026 | Done, with open items in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | see the commit that adds this file |
| P-01 | Pre-audit prototype: Roxi materialises, the first native Synapse layer (built as "Chapter 01" before the audit was asked for; relabelled, D-020) | 26 Nov 2026 ("Let's get started", with Roxi's image) | Built and tested off the phone; on-phone test pending | the commits "Synapse Chapter 01: …" up to `c468e5b` |
| 01 | Existing architecture audit: verified technical baseline, preservation matrix, risks, Android/iOS architecture recommendation | 26 Nov 2026 | **Done** (documents only; no production change) | the commit "Synapse Chapter 01: the existing architecture audit" |
| 02 | Mobile application foundation: architecture, layers, environments, flags, rollback, builds | 26 Nov 2026 ("Yes to everything and continue building") | Built; verified by tests, Skia's compiler, a browser run and EAS builds; phone test pending | "Synapse Chapters 02–08 foundation…" |
| 03 | Visual identity: tokens, typography, colour, district accents, components, demo | 26 Nov 2026 | Built and tested off the phone | same |
| 04 | Holographic rendering engine | 26 Nov 2026 | Built; shaders compiled by Skia; phone frame rate pending | same |
| 05 | Digital reconstruction engine: seven techniques, controller, signature | 26 Nov 2026 | Built; phone frame rate pending | same |
| 06 | Cinematic motion engine | 26 Nov 2026 | Built; durations measured in the browser; phone pending | same |
| 07 | Cinematic audio and haptics: twelve original sounds, engine, patterns | 26 Nov 2026 | Built; speaker, headphone and silent-mode test pending | same |
| 08 | Application awakening | 26 Nov 2026 | Built; browser start-up measured; phone cold/warm start pending | same |
| 09 | The app knows the person: sign-in in the phone's browser, bearer sessions, Roxi's voice and hologram, stronger visuals, native district lists (app 0.4.0) | 26 Nov 2026 ("Make the ultimate and best version… push hard on everything") | Built; tests, a local end-to-end sign-in, live endpoints, Skia, a browser run and EAS builds; phone test pending | [CHAPTER_09.md](CHAPTER_09.md); commits `4c6894a`, `a889c1f`, `c3fbcd7` |

A chapter is marked done only when its end-of-chapter record exists in these
files and its claims are backed by tests or measurements in
[TEST_REPORTS.md](TEST_REPORTS.md) and [PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md).

## Chapter 00: what was delivered

- `docs/synapse/`, the twelve memory files, with the master directive stored
  word for word.
- `mobile/`, the first mobile codebase: an Expo app that opens yavaya.lat in a
  native Android frame, linked to the existing EAS project (no duplicate
  created), with development, preview and production build profiles.
- `.easignore` at the repository root, so EAS uploads only `mobile/`.
- The Android upload keystore, generated and stored by EAS on the first build.
- The first preview APK (see [TEST_REPORTS.md](TEST_REPORTS.md) for the build
  and its link).
- Not done in Chapter 00, by the directive: no redesign, no replacement of the
  production website, nothing published to Google Play.

## Pre-audit prototype (P-01): what was delivered

- Roxi's assets from the owner's image (AI-generated, Yavaya's own, confirmed
  26 Nov 2026): the figure, a depth map estimated on this machine, a matte and
  her face (`mobile/assets/roxi/`, `mobile/tools/roxi/make-roxi.py`).
- The reconstruction (`mobile/src/synapse/reconstruct.ts`, `Reconstruction.tsx`,
  `timeline.ts`): she forms from light while the website loads beneath, in step
  with its real progress, and leaves as it appears.
- Roxi's Presence (`PresenceDock.tsx`, `bridge.ts`): her face in place of her web
  button, lit by her real state, opening her real panel. No change to the website.
- The Classic switch (`settings.ts`).
- A film of her materialising, rendered in Blender (`mobile/tools/roxi/film.py`)
  and cut in HyperFrames with an end card.
- Tried and blocked: a 3D model with Meshy (free plan refused).

## Chapter 01 (the audit): what was delivered

- [BASELINE_AUDIT.md](BASELINE_AUDIT.md): the verified inventory, the
  functionality preservation matrix (every website system classified REAL /
  DEMO / MOCK / BLOCKED / NOT IMPLEMENTED, with reuse / adapt / new-native for
  the app), the security baseline, phone measurements of twelve live pages, the
  production risks and technical debt, and the recommended Android/iOS
  architecture.
- Evidence gathered: platform typecheck clean; platform suite 94 files, 851
  tests, all pass; live `/status` 56 REAL, 8 requiring configuration, 1 DEMO,
  0 MOCK; Railway and Sentry healthy (one scanner-made issue); `npm audit`
  findings recorded.
- Memory updated: decisions D-020 to D-024, known issues 17 to 24, the
  measurements, the status table, the architecture direction, and the handoff.
- Not done, by the directive: no production code, configuration, data or
  deployment changed; no dependency upgraded; nothing published.

## Chapters 02–08: what was delivered

The full record (architecture evaluation, layers, environments, rollback,
platform limitations, design system, engines, sounds, awakening, every
measurement and what is still unverified) is
[CHAPTERS_02_08.md](CHAPTERS_02_08.md). In short:

- `mobile/` is now a native Synapse app with independent layers; the website is
  only its fallback screen, and Classic restores the Chapter 00 bridge.
- Development, preview and production variants; a separate staging project on
  Railway; remote feature flags (`GET /api/mobile/v1/config`); EAS Update
  channels for rollback.
- The design system, the holographic engine, seven reconstruction techniques
  with a chosen signature, the spatial motion engine, twelve original sounds
  with an audio engine and haptic patterns, and the optional awakening, all
  demonstrated in the Laboratory (development builds).
- Platform: security upgrades deployed (production npm audit: 0).
