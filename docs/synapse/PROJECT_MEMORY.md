# Project memory: Yavaya Synapse

The facts a new chapter needs before it touches anything. Keep this current;
an entry that is no longer true is worse than no entry.

## What exists today (26 November 2026)

- **The product** is the website at https://yavaya.lat: a Next.js platform in
  `platform/` (one identity, many districts, Roxi, tokens, payments), deployed
  by Railway from the `main` branch. Its own rules are in
  [`platform/CLAUDE.md`](../../platform/CLAUDE.md) and its documentation in
  [`platform/docs/`](../../platform/docs/). Everything Synapse builds must keep
  that platform working: it is the source of truth for accounts, data and money.
- **The mobile app** is `mobile/`, created in Chapter 00. It is a *bridge*: the
  live website inside a native Android frame (back button, outside links,
  microphone, camera, location, offline screen). It is the starting point, not
  the Synapse experience. The directive rules out "a website wrapped inside a
  mobile container" as the result, so later chapters replace it screen by
  screen with native Synapse screens.
- **Synapse itself**, the Living Interface Engine in the master directive, is
  **not implemented**. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Identifiers (not secrets)

| What | Value |
| --- | --- |
| Expo account (owner) | `yavaya` |
| EAS project | `@yavaya/yavaya`, ID `9e779c70-bbec-48c5-ac71-ca8a45debf66` |
| Android package | `yavaya.lat` (permanent once uploaded to Google Play) |
| Google service account for Play submissions | `yavaya-expo@yavaya.iam.gserviceaccount.com` (its key is stored at Expo, never in this repo) |
| Google Play developer account | personal account, verified November 2026 |
| Web URL the app opens | `https://yavaya.lat`, set in `mobile/app.json` → `extra.webUrl` |

Secrets live in Railway variables (web) and on Expo's servers (Android
keystore, Play key). None are in the repository, and none may be.

## The owner's standing rules (apply to every chapter)

- Never claim something works when it does not. Every capability is labelled
  REAL, DEMO, MOCK, BLOCKED or NOT IMPLEMENTED, here and in the product
  (`platform/src/config/capabilities.ts` uses REAL / DEMO / MOCK /
  REQUIRES_CONFIGURATION for the website).
- Nothing is published publicly without the owner's approval: no store
  release, no public listing, no production rollout of an unapproved redesign.
- Ask before irreversible actions, production deploys and paid changes.
- A visible redesign ships behind a **Classic** switch, so the previous look
  stays one tap away.
- Spanish first; English beside it. No hard-coded user-facing strings in the
  platform (i18n dictionaries).
- Roxi's visual system is called **Presence**. Roxi never publishes, pays or
  sends on a member's behalf: she prepares drafts and the member confirms.
  Do not claim she is conscious or feels.
- "Free for people. Paid by those who earn." Free use stays free; tokens and
  Roxi plans (Stripe subscriptions in `platform/src/server/domains/roxi/billing.ts`)
  are how earners pay.
- The owner works from a phone: keep reports short and give links that open
  on a phone.
- Never ask the owner to paste a secret into chat; credentials go through a
  secure form or the provider's own settings.

## How a chapter runs

Start: read [MASTER_DIRECTIVE.md](MASTER_DIRECTIVE.md), this file,
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), the relevant parts of
[ARCHITECTURE.md](ARCHITECTURE.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md), and
[NEXT_CHAPTER.md](NEXT_CHAPTER.md); confirm dependencies; do only the
authorised chapter.

End: record what was actually built, the files changed, the decisions
([DECISION_LOG.md](DECISION_LOG.md)), the tests ([TEST_REPORTS.md](TEST_REPORTS.md)),
the measurements ([PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md)), the open
problems; update this file and [CHAPTER_INDEX.md](CHAPTER_INDEX.md); commit;
write the next handoff. A chapter is not complete because code exists.

## Working commands

```bash
cd mobile
npm run check            # TypeScript, unit tests, expo-doctor
npx expo start           # local development (needs a dev client build)
eas build -p android --profile preview      # installable APK (internal)
eas build -p android --profile production   # app bundle for Google Play
eas submit -p android --profile production  # only with the owner's approval
```

EAS commands need an Expo access token in `EXPO_TOKEN`; in the cloud
environment it is injected by the network proxy and never stored in files.
