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
| Preview APK build | `eas build -p android --profile preview` | finished on EAS, 26 Nov 2026, 13:59 → 14:16 UTC (build `3fcf9a8a-38fa-4b10-904f-160f1583b3b0`, version 0.1.0, version code 1, SDK 58); [build page](https://expo.dev/accounts/yavaya/projects/yavaya/builds/3fcf9a8a-38fa-4b10-904f-160f1583b3b0) (Expo sign-in) |
| The APK itself | downloaded and opened | 71 MB universal APK (arm64-v8a, armeabi-v7a, x86, x86_64); package `yavaya.lat`; manifest holds INTERNET, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, CAMERA, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION; SYSTEM_ALERT_WINDOW absent. READ/WRITE_EXTERNAL_STORAGE come in from libraries (see KNOWN_ISSUES 10) |

Not tested in Chapter 00: anything on a phone. The website itself was not
changed in this chapter, so its own test suite was not re-run.
