# Next chapter: handoff

## Before Chapter 01 (owner)

1. Install the preview APK from the link in [TEST_REPORTS.md](TEST_REPORTS.md)
   on the Samsung (allow "install unknown apps" for the browser when Android
   asks), and report what works and what does not: signing in, Roxi's voice,
   a photo upload, a payment screen, Play.
2. Decide whether the package name stays `yavaya.lat` (it cannot change after
   the first Play upload; see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) 4).
3. When ready for Google Play: approve a production build and an `eas submit`
   to the internal track as a draft, then set up the closed test with 12+
   testers for 14 days.
4. Authorise Chapter 01 and say what it should cover. The directive does not
   define it.

## Proposed Chapter 01: Synapse foundation (not authorised)

A proposal only, for the owner to accept, change or replace.

1. **Baseline.** Measure the bridge on the owner's Samsung and a low-end
   Android phone: cold start, memory, frame rate, APK size. Record it in
   [PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md).
2. **Session between web and native.** Decide how a native screen uses the
   member's session (shared cookie or a token issued by the platform) with
   server-side authorisation unchanged; fix Google sign-in in the app the same
   way.
3. **Rendering spike.** One reconstruction transition (content materialising
   from light as it loads, driven by real loading state) built with two
   candidate stacks, measured against the budget on the low-end phone, with
   reduced and static fallbacks. Adopt one, record the decision.
4. **Native tokens.** Colour, type and spacing from
   [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) as one shared module.
5. **A first native surface behind a Classic switch:** for example the opening
   of the app and a persistent Presence dock for Roxi over the web pages,
   reaching the same agent and tools she has today.

Out of scope until authorised: replacing district screens, any store release,
paid services.

## Files to read first in Chapter 01

[MASTER_DIRECTIVE.md](MASTER_DIRECTIVE.md), [PROJECT_MEMORY.md](PROJECT_MEMORY.md),
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [ARCHITECTURE.md](ARCHITECTURE.md),
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), `mobile/src/YavayaWeb.tsx`, `mobile/src/links.ts`,
and the platform's [`platform/docs/roxi/README.md`](../../platform/docs/roxi/README.md).
