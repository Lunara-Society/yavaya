# Test reports

## Chapter 00 · 26 November 2026

Run in the cloud development environment, from `mobile/`.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` (`tsc --noEmit`, strict) | pass, no errors |
| Unit tests: link policy | `npm test` (Node test runner, `src/links.test.ts`) | 4 of 4 pass: Yavaya and Stripe stay in the app; other sites, WhatsApp, tel and mailto open outside, including look-alike hosts (`yavaya.lat.evil.example`, `user@evil.example`); frames load in their page; `javascript:` and `file:` refused; `intent:` links use their browser fallback |
| Dependency and config health | `npx expo-doctor` | 20 of 20 checks pass |
| Native config | `npx expo prebuild` in a scratch copy | `applicationId 'yavaya.lat'`; the five declared permissions present; `SYSTEM_ALERT_WINDOW` removed |
| Resolved app config | `npx expo config` | slug `yavaya`, owner `yavaya`, package `yavaya.lat`, EAS project ID matches |
| EAS link | `eas project:info` | `@yavaya/yavaya`, ID `9e779c70-bbec-48c5-ac71-ca8a45debf66`; no duplicate project |
| EAS build profile | `eas config --platform android --profile preview` | distribution `internal`, build type `apk` |
| Keystore | first `eas build`, non-interactive | "Created keystore" on EAS; JKS, created 26 Nov 2026 |
| Play service account | EAS GraphQL after assignment | `yavaya.lat` → `yavaya-expo@yavaya.iam.gserviceaccount.com` |
| Preview APK build | `eas build -p android --profile preview` | BUILD_RESULT |

Not tested in Chapter 00: anything on a phone. The website itself was not
changed in this chapter, so its own test suite was not re-run.
