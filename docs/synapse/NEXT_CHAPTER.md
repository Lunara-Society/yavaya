# Next chapter: handoff

## Before Chapter 02 (owner)

1. **Install the prototype preview APK** (0.2.0, build `0cda7886`; install link
   valid until 10 Dec 2026) on the Samsung, and while it is open check the
   three things the audit could not check off the phone:
   - posting form: tap the microphone to dictate (does text appear?);
   - posting form: add a photo with the camera (does the camera open?);
   - Roxi: talk to her through the Presence (bottom right).
   Report what worked. A few words are enough.
2. **Decide store billing** (KNOWN_ISSUES 17): for the store builds, either
   sell tokens, gems, Vault items and Roxi plans through Google Play and Apple
   billing, or leave their purchase out of the store builds (members buy on the
   website). Nothing ships to a store until this is decided.
3. **Say yes or no to a Railway staging environment** (it uses Railway
   resources, so it is a paid change).
4. **Say yes or no to the dependency upgrades** (Next.js, Zod, Sentry plugins;
   production change, full test suite before and after).
5. Authorise Chapter 02.

## Proposed Chapter 02: the bridge between web and native (not authorised)

Taken from the audit's recommendation (BASELINE_AUDIT §7), smallest first:

1. **App Links**: `/.well-known/assetlinks.json` on the website and intent
   filters in the app, so Yavaya links (invites, shares, the candle) open the
   app. This is the only website change in the chapter, and it is additive.
2. **Google sign-in in the app** through the system browser, returning by App
   Link.
3. **Mobile sessions**: a token issued from the existing sessions table, kept
   in secure storage; the WebView and native code share one sign-in.
4. **The first endpoints of the mobile API** (`/api/mobile/v1`): read-only
   (me, notifications), each wrapping an existing domain function.
5. **Push notifications** for the bell's categories and Roxi's reminders:
   device registry, sending from the scheduler, the same preferences.
6. Fixes for whatever the owner's phone test in step 1 above shows (dictation,
   camera hand-off), and the prototype's frame rate and memory on the phone.

Out of scope until authorised: native district screens, any store release,
dependency upgrades, staging, paid services.

## Files to read first in Chapter 02

[MASTER_DIRECTIVE.md](MASTER_DIRECTIVE.md), [PROJECT_MEMORY.md](PROJECT_MEMORY.md),
[BASELINE_AUDIT.md](BASELINE_AUDIT.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md),
`platform/src/server/auth/`, `platform/src/app/api/go/upload.ts` (the
`sameOrigin` guard), `mobile/src/YavayaWeb.tsx`, and the platform's
[`platform/docs/SECURITY.md`](../../platform/docs/SECURITY.md).
