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

## Chapter 01 · 26 November 2026

| Check | How | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | pass |
| Unit tests | `npm test` (18) | 18 of 18 pass: the 4 link tests, and 14 for Synapse — she never looks complete before the page has loaded; she follows real progress and never goes backwards; a fast page still gets a formation, a hold and a departure; a tap goes straight in; a failed or endless load still shows the page; a stalled frame does not jump her ahead; the veil lifts smoothly; her picture fits phones from 360 × 640 to tablets; Roxi's state reduced with the site's own precedence; page messages checked (bad JSON, unknown types, absurd rectangles refused); only https Yavaya pages may speak to the app; the injected script reports the button and state and opens her by her own button; the web button is hidden only when the app says so, never in Classic; the script does nothing on other sites |
| The shader, by eye | `node tools/synapse/render-frames.mjs` (Skia's compiler via CanvasKit) | compiles; nine stages rendered (see `frames/ch01-reconstruction-stages.jpg`). Found and fixed: a reserved word (`flat`) and the picture's black box showing around her |
| JavaScript bundle | `npx expo export --platform android` | builds; the worklet transform applied; Roxi's three assets packed (46 KB) |
| Dependency health | `npx expo-doctor` | 20 of 20 |
| Install-time behaviour of new packages | Kenwea notary on Skia 2.14.0, Reanimated 4.7.1, Worklets 0.13.0, AsyncStorage 2.2.0, Haptics 58.0.8, meshy-cli 0.4.0 | nothing runs at install for any of them |
| Preview build | EAS | CH01_BUILD |
| The film | Blender 4.5 Cycles (CPU), 144 frames, 720 × 1280 (about 15 s a frame, 36 min), then HyperFrames | "Roxi se materializa", 9.0 s, 1080 × 1920, H.264, 8.9 MB; HyperFrames check passed; six frames pulled back out of the final file and looked at. Delivered to the owner; not published |

Not tested in Chapter 01: anything on a phone (frame rate, battery, touch,
tilt, the Presence over the real website, Classic switching). That is the
owner's first step with the new build.
