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

## Pre-audit prototype (P-01) · 26 November 2026

| Check | How | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | pass |
| Unit tests | `npm test` (18) | 18 of 18 pass: the 4 link tests, and 14 for Synapse — she never looks complete before the page has loaded; she follows real progress and never goes backwards; a fast page still gets a formation, a hold and a departure; a tap goes straight in; a failed or endless load still shows the page; a stalled frame does not jump her ahead; the veil lifts smoothly; her picture fits phones from 360 × 640 to tablets; Roxi's state reduced with the site's own precedence; page messages checked (bad JSON, unknown types, absurd rectangles refused); only https Yavaya pages may speak to the app; the injected script reports the button and state and opens her by her own button; the web button is hidden only when the app says so, never in Classic; the script does nothing on other sites |
| The shader, by eye | `node tools/synapse/render-frames.mjs` (Skia's compiler via CanvasKit) | compiles; nine stages rendered (see `frames/ch01-reconstruction-stages.jpg`). Found and fixed: a reserved word (`flat`) and the picture's black box showing around her |
| JavaScript bundle | `npx expo export --platform android` | builds; the worklet transform applied; Roxi's three assets packed (46 KB) |
| Dependency health | `npx expo-doctor` | 20 of 20 |
| Install-time behaviour of new packages | Kenwea notary on Skia 2.14.0, Reanimated 4.7.1, Worklets 0.13.0, AsyncStorage 2.2.0, Haptics 58.0.8, meshy-cli 0.4.0 | nothing runs at install for any of them |
| Preview builds | EAS | `61ed3bd9` (code at fad77cc) finished 15:49 UTC: native Skia, Reanimated and Worklets compiled; Roxi's three images found in the APK byte for byte. `0cda7886` (code at 871b834, with the cover safeguard) finished 16:22 UTC, version 0.2.0: 132 MB; the bundle inside carries the bridge's `cover` safeguard and the Spanish hint, checked in the downloaded APK. [Build page](https://expo.dev/accounts/yavaya/projects/yavaya/builds/0cda7886-cff2-4496-93b2-a766ea0b820c) (Expo sign-in); install link valid until 10 Dec 2026 |
| The film | Blender 4.5 Cycles (CPU), 144 frames, 720 × 1280 (about 15 s a frame, 36 min), then HyperFrames | "Roxi se materializa", 9.0 s, 1080 × 1920, H.264, 8.9 MB; HyperFrames check passed; six frames pulled back out of the final file and looked at. Delivered to the owner; not published |

Not tested in the prototype: anything on a phone (frame rate, battery, touch,
tilt, the Presence over the real website, Classic switching). That is the
owner's first step with the new build.

## Chapter 01: the existing architecture audit · 26 November 2026

Nothing in production was changed; these checks describe the website as it is.

| Check | How | Result |
| --- | --- | --- |
| Platform types | `npm run typecheck` in `platform/` | pass, 0 errors |
| Platform test suite | `npm test` (Vitest) in `platform/`, local Postgres 16 | 94 files, 851 tests, all pass (524 s) |
| Live capability register | `/status` on yavaya.lat | 65 rows: 56 REAL, 8 requiring configuration, 1 DEMO, 0 MOCK |
| Phones, rendering and speed | Playwright, Chromium, 360 × 780, 12 public pages, mid and low tiers | every page renders; no sideways scrolling; low-tier largest paint 0.99–3.44 s; cold data 282–618 KB (BASELINE_AUDIT §5) |
| Security headers | response headers of the home page | strict nonce CSP, HSTS preload, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(self), payment=(), geolocation=(self)` |
| Production deploys | Railway | last web deploy succeeded 21 Nov (`a4117771`); later commits skipped by the `platform/**` watch, as designed |
| Production errors | Railway HTTP log since 25 Nov; Sentry, 14 days | 2 HTTP 500s, both scanner requests; 1 unresolved Sentry issue, the same |
| Dependencies | `npm audit` | platform production: 8 (6 moderate, 2 high); full tree 18 (2 critical, test tooling only); mobile production: 3 moderate |

Not tested: anything signed in on the live site, real payments or deliveries,
and the app on a phone.

## Chapters 02–08: the native app · 26 November 2026

Detail and the measured numbers: [CHAPTERS_02_08.md](CHAPTERS_02_08.md).

| Check | How | Result |
| --- | --- | --- |
| Platform security upgrades | typecheck; Vitest with local Postgres; `next build` and the size budget; production deploy | 0 errors; 94 files, 851 tests pass; build and budget pass; `38eab99` live |
| Production dependencies after the upgrades | `npm audit --omit=dev` in `platform/` | 0 (was 8) |
| App configuration endpoint | 4 unit tests; `GET /api/mobile/v1/config` on both servers | pass; production `{"flags":{},"minBuild":0,"message":null}`; staging `{"flags":{"lab":true},"minBuild":0,"message":"Staging: datos de prueba"}` |
| Staging | Railway project `yavaya-staging` | up at `yavaya-web-staging.up.railway.app`; own database; no payment, email, WhatsApp or media credentials |
| Mobile types and logic | `npm run typecheck`, `npm test` in `mobile/` | 0 errors; 39 tests pass |
| Expo project health | `npm run doctor` | 20/20 |
| Shaders | `npm run check:shaders` (Skia's own compiler, CanvasKit) | 5/5 compile and render; the seven reconstruction techniques render visibly different |
| The app at phone size | Expo web build in Chromium, 360 × 780, Playwright through 10 scenes, real server data | 10/10 steps pass; start-up and transition durations recorded; frame rates are software-rendered and not representative |
| Android preview build | EAS `6d7af8c1`, from `c932565` | finished; [APK](https://expo.dev/artifacts/eas/ArVKb_rVZ0bhsYQtpjx7TFCs7GyVgoBTJE9pk9sqR6Q.apk) (link valid until 10 Dec 2026) |
| iOS simulator build | EAS `1b695433` | finished: the native code compiles for iOS |
| Android development build | EAS `69d48d21` | canceled after 53 minutes, no reason recorded; rerun as `d2a5bee8` |
| Over-the-air update | `eas update --channel preview` (group `f1c7eb2f`, laboratory in preview builds) | published on runtime `d5cccf65…`, the preview build's own fingerprint; arrival on the phone NOT TESTED |

Not tested: anything on a phone, which means frame rate, memory, vibration,
sound through the speaker, headphones and silent mode, native cold and warm
start, and the update arriving.
