# active-memory handoff: Yavaya app 0.4.0 (Synapse Chapter 09)

**Handoff #1** · 2026-11-27 · Lineage: #1 (2026-11-27): Chapter 09 built and shipped to staging and production (sign-in that returns to the app, Roxi's voice and hologram, stronger visuals, native district lists); preview APK build `258b7ac1` was still compiling when this was written.

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: None active. If the user types /amcodeword, start every reply with the phrase they choose (default "Yes Boss!").
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** Yavaya's native Android app (Expo, `mobile/`) working for real on the owner's phone: Google sign-in that comes back to the app, Roxi talking in the app with a visible hologram, strong visuals, native district screens with real data. The website (`platform/`, https://yavaya.lat) keeps working throughout.
- **Done looks like:** the owner installs the new preview APK on the Samsung, signs in with Google and lands back in the app, talks to Roxi aloud, sees a lit holographic space, and districts show real items (or an honest empty state).
- **Why it matters / context:** owner's words: "Time to forget about prototype now. We need to do the real thing. […] It's the only way we succeed completely. Make the ultimate and best version you can use and push hard on everything."

## 2. About the user (as relevant to this work)
- Owner of Yavaya.lat (Lunara Society). Works from a phone (Samsung, Android).
- Not a developer in this work: tests on the phone and answers yes/no with screenshots.
- Has approved upgrades, staging and the chapters ("yes to everything") and asked to "push hard on everything".

## 3. Style & communication
- **Language:** English replies. App and website text is Spanish first, English beside it (i18n dictionaries; no hard-coded user-facing strings in the platform).
- **Tone:** direct, plain, honest; say what is unverified.
- **Reply length:** short and phone-friendly; links that open on a phone.
- **Formatting:** short sections and bullets; tables only where useful.
- **Working style:** do the work, verify it, ship it; ask only before irreversible actions, production deploys or paid changes not already approved.
- **Avoid:** claiming something works when it is untested; model names in repo artifacts (only the commit trailer below); repeating private details (the owner's email or phone number) from tool output.

## 4. Hard rules (word for word)
1. "Do not publish anything publicly without my approval."
2. "Never expose credentials or commit secrets to the repository."
3. "If Expo authentication is required, tell me exactly what I need to do."
4. "Do not redesign or modify production functionality."
5. "Preserve all existing Yavaya functionality, backend integrations, cinematic holographic design architecture and Roxi systems."
6. Never claim something works when it doesn't. Label capabilities REAL / DEMO / MOCK / BLOCKED / NOT IMPLEMENTED.
7. Work on branch `claude/yavaya-lat-migration-uzwusm` and push every change to it and to `main`. Railway deploys production from `main` only when `platform/**` changes; staging deploys from the work branch.
8. Every commit ends with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   `Claude-Session: https://claude.ai/code/session_01St1KEs8WV9Kiu8UFwoma2x`
   No model names anywhere else in repo artifacts.
9. Never print secrets; they live in Railway variables and on Expo's servers. Exposed keys awaiting the owner's rotation must not be printed or reused. Never ask the owner to paste a secret into chat.
10. The owner's email and phone number are private: never repeat them from Expo, HeyGen, Railway or other output. Test data uses phone `50500000000`.
11. No pull requests unless asked.
12. Do not work in `Lunara-Society/YavayaGo` or `/home/user/Lunara-Society.github.io`.
13. Don't buy assets or add paid services without approval.
14. Visible redesigns ship behind a **Classic** switch. Roxi's visual system is called **Presence**. Roxi never publishes, pays or sends for a member; she prepares, the member confirms.
15. Session tokens never appear in URLs (sealed values are signed, not encrypted).

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | 0.3.0 ran the website's sign-in inside the app's WebView; Google sent the person to the browser and the session stayed there | "Login with the app alone doesn't work, when trying with Google, it goes to the website I stead of the app/APK": sign-in must come back to the app |
| 2 | 0.3.0 had no way to talk to Roxi in the app | "Can test Roxi yet" (meaning: cannot test Roxi yet): Roxi's voice working in the app |
| 3 | 0.3.0 visuals tuned too faint for a phone | "all visual stuff seems to be almost non existing": strong, visible visuals |
| 4 | Treated the app as a prototype stage | "Time to forget about prototype now. We need to do the real thing." |

## 6. Decisions
| Decision | Why |
|---|---|
| Sign-in in the phone's browser tab (RFC 8252) with PKCE S256, returning to `yavaya://auth` (D-032) | Google refuses sign-in inside WebViews; a code is useless without the verifier |
| `/api/mobile/v1/auth/finish` answers 303 to `yavaya://auth?code&state` | Android's tab follows a server redirect into an app; a self-refreshing page can be refused without a tap |
| App sessions are ordinary sessions sent as `Authorization: Bearer` (D-033); `currentSession()` reads the bearer first; `sameOrigin()` accepts bearer requests | every API route serves the app unchanged |
| Roxi's voice over WebRTC with the ElevenLabs React Native SDK, opened and metered by the server (D-034) | same agent/tools as the website; phone echo cancellation |
| WebRTC pinned at 144.1.2 via npm override (D-035) | 144.2.0 is LiveKit's `livekit.org.webrtc` prefixed build; Kotlin compile fails |
| "Lite" glass panels (views only) for grids and lists (D-036) | one Skia canvas per panel exceeded the 16 WebGL contexts; panels went white |
| Android builds only `armeabi-v7a,arm64-v8a` (D-037) | four ABIs ran the EAS build server out of memory once WebRTC came in |
| Deploy the additive server endpoints to production after staging | Claude's stated assumption from "push hard on everything"; done, no existing route changed behaviour |

## 7. Changed / rejected
- `finish` as an HTML page with meta refresh + "Abrir Yavaya" link → 303 redirect (27 Nov, before any phone ran it); strings `mobile.auth.returning` and `mobile.auth.open_app` removed
- WebRTC 144.2.0 → 144.1.2 (Kotlin type mismatch)
- Four Android ABIs → two phone ABIs (out of memory)
- One Skia canvas per panel everywhere → lite glass in grids/lists
- ❌ Expo "build from repository" (`build_run` MCP tool): the Expo project has no GitHub repository connected
- ❌ App Links for the return address (deferred to Chapter 10; custom scheme + PKCE for now)

## 8. Data & facts (exact)
| What | Value |
| --- | --- |
| Repo | Lunara-Society/yavaya, checked out at `/home/user/yavaya` (`platform/`, `mobile/`, `docs/synapse/`) |
| Latest commit on branch and `main` | `18cef41` "Chapter 09 record; app sign-in returns by redirect" |
| Earlier commits this chapter | `4c6894a` platform endpoints · `0ac7b5f` voice deps · `6c78bab` WebRTC pin · `a889c1f` mobile 0.4.0 · `c3fbcd7` phone ABIs only |
| App version | 0.4.0 (`mobile/package.json`, `app.json`) |
| Expo project | `@yavaya/yavaya`, ID `9e779c70-bbec-48c5-ac71-ca8a45debf66`, Android package `yavaya.lat` |
| Preview build in progress | `258b7ac1-f6b7-44de-9267-80f940e2c4d0` (from `c3fbcd7`, runtime `516bf964a363efb291cd51b46670588fe1a456d8`, channel `preview`), artifact expires 2026-12-11T01:29:49Z; logs https://expo.dev/accounts/yavaya/projects/yavaya/builds/258b7ac1-f6b7-44de-9267-80f940e2c4d0 |
| Failed builds | `61e55061` (WebRTC prefix) · `91a52595` ("Gradle build daemon disappeared", out of memory) · `61a280db` canceled · `d2a5bee8` dev 0.3.0 canceled |
| Last good APK (0.3.0) | build `6d7af8c1` |
| Production | https://yavaya.lat · Railway project `yavaya` `682b2a31-cad5-4e80-a863-51a4dd23f012`; deploys of `18cef41` SUCCESS (services `d49a2cfb…` ams, `6fbb30af…` iad; `e907c02f…` skipped) |
| Staging | https://yavaya-web-staging.up.railway.app · Railway project `yavaya-staging` `c9521f3e-2be0-4a82-8787-dd17f9287cce`; deploy of `18cef41` SUCCESS |
| Tests | platform 96 files / 863 tests pass · mobile 41 pass · shaders 6/6 · local sign-in 18/18 |
| Live checks (27 Nov) | config, auth/session, feeds 200 on both; `auth/start` bad params 400, valid 303 → `/auth/google?next=/api/mobile/v1/auth/finish`; production feeds 0 items (website pages also empty: "Todavía no hay publicaciones") |
| Sign-in code | AES-256-GCM, key = HMAC(SESSION_SECRET, 'yavaya mobile sign-in code v1'), 120 s, bound to PKCE; hand-off cookie `yav_mobile_auth`, path `/api/mobile/v1/auth`, 15 min |
| App session storage | SecureStore key `yavaya.session.v1`; WebView cookie `yav_session` |
| Stack | Expo SDK 58, RN 0.88.1, `@elevenlabs/react-native` 1.3.0, `@livekit/react-native` 2.12.0, `@livekit/react-native-webrtc` 144.1.2, `livekit-client` 2.25.0, `@livekit/react-native-expo-plugin` 1.0.3, `@config-plugins/react-native-webrtc` 15.0.2, `expo-crypto` ~58.0.9 |
| Docs placeholders still to fill | `APK_LINK` in `docs/synapse/NEXT_CHAPTER.md`; `BUILD_RESULT` in `docs/synapse/TEST_REPORTS.md` |

Commands that work in this environment:
```bash
cd /home/user/yavaya/mobile
EXPO_TOKEN=placeholder-replaced-by-proxy npx eas-cli build:view <id> --json   # the environment's network secret for api.expo.dev supplies the real login
EXPO_TOKEN=placeholder-replaced-by-proxy npx eas-cli build --platform android --profile preview --non-interactive --no-wait --json
curl -s --compressed -o build.txt '<logFileUrls[0] from build:view>'   # build logs are brotli-encoded
npm test; npx tsc --noEmit -p .; npm run check:shaders
cd ../platform && npx vitest run    # full suite, local Postgres (service postgresql start)
```
- `npx expo prebuild` rewrites `package.json` scripts (changes the fingerprint): revert with `git checkout mobile/package.json` and delete `android/`.
- The local end-to-end sign-in check needs a production build (`next build && next start -p 3100`); its env sets `NODE_ENV=production`, so `next dev` fails with an EvalError. The script and env were in the old session's scratchpad and may be gone.

## 9. People, terms & names
- **People:** the owner (Yavaya / Lunara Society), phone tester.
- **Terms & nicknames:** Synapse = the native app programme; Presence = Roxi's visual system; Classic = switch back to the previous look; "lite" glass = canvas-free `HoloPanel lite`; Laboratorio = in-app lab screens (preview builds).
- **Names in use:** routes `platform/src/app/api/mobile/v1/auth/{start,finish,exchange,session,web}`, `…/roxi/start`, `…/feed/[district]` (mercadito, work, animals, community); `platform/src/server/auth/{mobile,bearer,context}.ts`; mobile `src/business/{api,auth.tsx,feed}.ts`, `src/roxi/{RoxiVoiceProvider.tsx,tools.ts,RoxiIsland.tsx}`, `src/render/{shaders.ts,RoxiHologram.tsx,HoloPanel.tsx}`, `src/screens/{Home,District,RoxiScreen,WebScreen,Account,Settings}.tsx`; `app.config.ts` `withPhoneArchitectures`.

## 10. Work state
| Item | Status | Version / location | Notes |
|---|---|---|---|
| Server endpoints (sign-in, bearer, Roxi start, feeds) | live | `18cef41` on yavaya.lat and staging | not exercised from a phone yet |
| Mobile 0.4.0 code | done, pushed | `c3fbcd7` | typecheck + 41 tests |
| Preview APK 0.4.0 | building | EAS `258b7ac1` | when finished: link to owner |
| Chapter 09 record | written, pushed | `docs/synapse/CHAPTER_09.md` + index, tests, decisions D-032–D-037, known issues 31–35, status, memory | two placeholders above |
| Owner phone test of 0.4.0 | not started | steps in `docs/synapse/NEXT_CHAPTER.md` | waits for the APK |
| Development build | none current | — | owner doesn't need it |
| Task list | #92–#95 completed; #96 "Ship" in progress; #57 (HeyGen) pending on HEYGEN_API_KEY | — | — |

## 11. Next steps
1. **Next action:** check EAS build `258b7ac1` (`build:view`). If FINISHED, take `artifacts.applicationArchiveUrl`. If ERRORED, download its log with `curl --compressed`, fix, rebuild.
2. Replace `APK_LINK` (NEXT_CHAPTER.md) and `BUILD_RESULT` (TEST_REPORTS.md: e.g. "finished; [APK](…) (link valid until 11 Dec 2026)"). Commit and push to the branch and `main`.
3. Send the owner a short, phone-friendly report: APK link; steps (install over 0.3.0; Ajustes → "Continuar con Google" and come back; talk to Roxi; look at home; open Mercadito); what changed; what is unverified (browser tab return, WebRTC voice, frame rate, signed-in WebView); production districts are empty because the website has no content yet.
4. Wait for the owner's phone results; fix what they show (proposed Chapter 10 in NEXT_CHAPTER.md is not authorised).

## 12. Open questions ⚠️
None.

## 13. Re-attach checklist
- [ ] This file (`docs/synapse/handoff-yavaya.md`, also in the repo).
- [ ] The repository Lunara-Society/yavaya must be attached to the new session (the code, docs and this file live there).

---
<sub>Audit: 13/13 sections · 15 rules · 4 corrections · 32 data points · secrets removed: none found · generated by active-memory</sub>
