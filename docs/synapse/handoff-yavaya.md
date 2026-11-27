# active-memory handoff: Yavaya app 0.4.0 and the black-and-gold look

**Handoff #4** · 2026-11-27 · Lineage: #1 (2026-11-27): Chapter 09 built and shipped to staging and production (sign-in that returns to the app, Roxi's voice and hologram, stronger visuals, native district lists); build `258b7ac1` canceled at the 45-minute limit (memory); build `27cc5ff7` with memory limits FINISHED 27 Nov 02:32 UTC; APK sent to the owner.; #2 (2026-11-27): ten epic directions proposed, the owner's reference video analysed, palette set to obsidian black and gold, concept film "Presencia Oro" made and sent as a private page; owner moving to a new chat.; #3 (2026-11-27): the owner sent the Aether × Roxi Anima constitution and 20 references; AX-00 to AX-03 done as documents and analysis in `docs/aether/` (capability register, reference matrix, Roxi 3D pipeline chosen, no 3D master made); references kept on a private page because the repo is public; no product change.; #4 (2026-11-27): the owner sent 20 more GIFs to set Roxi's movement (1 duplicate of R20 dropped, R21–R39 kept); faces measured against her source: none is hers, so her identity stays with her source image; Roxi's glow changed to gold (owner); then a third send of 20 (3 duplicates of R37–R39 dropped, R40–R56 kept): faces still not hers, a tactical outfit, invented logo marks; then a fourth send of 15 (all new, R57–R71): one consistent woman who is not Roxi (0.18–0.38; Roxi's own images at GIF size score 0.88–0.90), a gold glow, a gold "V" mark, and purchase, token and message flows; more GIFs coming, then the seven questions.

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
- **Second track (design, not built):** the next look in obsidian black and gold, from the owner's reference video; see `docs/synapse/VISUAL_DIRECTION.md` and the concept film in `design/films/oro/`.
- **Third track (27 Nov, the owner's constitution):** Aether × Roxi Anima, the production app with Roxi as an interactive digital human. Read `docs/aether/README.md` first; it holds the capability register, the reference matrix, Roxi's pipeline, decisions (AX-D…) and tests.
- **Why it matters / context:** owner's words: "Time to forget about prototype now. We need to do the real thing. […] It's the only way we succeed completely. Make the ultimate and best version you can use and push hard on everything."

## 2. About the user (as relevant to this work)
- Owner of Yavaya.lat (Lunara Society). Works from a phone (Samsung, Android).
- Not a developer in this work: tests on the phone and answers yes/no with screenshots.
- Can't open file cards sent in chat on the phone: deliver everything as links that open with one tap (Artifact pages, GitHub links, expo.dev links).
- Has approved upgrades, staging and the chapters ("yes to everything") and asked to "push hard on everything".

## 3. Style & communication
- **Language:** English replies. App and website text is Spanish first, English beside it (i18n dictionaries; no hard-coded user-facing strings in the platform).
- **Tone:** direct, plain, honest; say what is unverified.
- **Reply length:** short and phone-friendly; links that open on a phone, never file attachments.
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
   `Claude-Session: https://claude.ai/code/session_01St1KEr4mUsXaSM8kp251i1` (the link of the session making the commit; the harness gives it)
   No model names anywhere else in repo artifacts.
9. Never print secrets; they live in Railway variables and on Expo's servers. Exposed keys awaiting the owner's rotation must not be printed or reused. Never ask the owner to paste a secret into chat.
10. The owner's email and phone number are private: never repeat them from Expo, HeyGen, Railway or other output. Test data uses phone `50500000000`.
11. No pull requests unless asked.
12. Do not work in `Lunara-Society/YavayaGo` or `/home/user/Lunara-Society.github.io`.
13. Don't buy assets or add paid services without approval.
14. Visible redesigns ship behind a **Classic** switch. Roxi's visual system is called **Presence**. Roxi never publishes, pays or sends for a member; she prepares, the member confirms.
15. Session tokens never appear in URLs (sealed values are signed, not encrypted).
16. Palette for the new look: "Color Black, obsidian black Gold That's our theme If we can avoid purple, it would be great, just maybe just a tiny bit of purple glow on Roxi, that's pretty much it And disassemble stuff should be ultra smooth and realistic. Any color or glow that fits will be good."
17. The owner's reference video is "a major direction of how the app can look", "not to do exactly the design the video shows": take its language, never its world, logo, helix, cyan, glitch or white flash.
18. Roxi's glow (27 Nov, updates rule 16): "Roxi should have a glow in in gold instead of purple."
19. The owner's GIFs (27 Nov): "What I give is close to what we shall have, but it's your job to make sure what we will have will be Roxi. I'm just giving you the direction of her movement" · "If you receive a duplicate of a gif. Make sure you keep only one" · "After all has been sent. Then we will go over the 7 questions."

## 5. Corrections log
| # | Claude did | The user wanted |
|---|---|---|
| 1 | 0.3.0 ran the website's sign-in inside the app's WebView; Google sent the person to the browser and the session stayed there | "Login with the app alone doesn't work, when trying with Google, it goes to the website I stead of the app/APK": sign-in must come back to the app |
| 2 | 0.3.0 had no way to talk to Roxi in the app | "Can test Roxi yet" (meaning: cannot test Roxi yet): Roxi's voice working in the app |
| 3 | 0.3.0 visuals tuned too faint for a phone | "all visual stuff seems to be almost non existing": strong, visible visuals |
| 4 | Treated the app as a prototype stage | "Time to forget about prototype now. We need to do the real thing." |
| 5 | Sent files as file cards in chat | "I couldn't download what you sent, it's kot possible to click on": send tappable links instead |
| 6 | Recommended violet as the main light for the new look | obsidian black and gold; violet only as a tiny glow on Roxi (rule 16) |
| 7 | (Owner's belief, 27 Nov) the default new-session repo `Lunara-Society.github.io` "is Yavaya" | Checked: it is the Lunara Society website; Yavaya is `Lunara-Society/yavaya`. Attach that one |
| 8 | Planned a faint violet rim on Roxi (AX-D011) | "Roxi should have a glow in in gold instead of purple" (AX-D013) |

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
| Kotlin daemon `-Xmx2g`, `org.gradle.workers.max=2` (D-038), in `app.config.ts` `withBuildLimits` | build `258b7ac1` stalled in native compiles and was canceled at 45 min; paid `large` class not used without approval |
| New look: obsidian black and gold; Roxi's glow gold, no violet (AX-D013) | owner's call (rules 16, 18) |
| Roxi-like GIFs set movement only; identity comes from her source image; any rendering of Roxi must score SFace ≥ 0.80 against it and be recognised by the owner (AX-D015, AX-D016) | measured: no GIF face is hers (closest 0.59; hers 0.95–0.99) |
| Concept film shows direction 1 (Roxi presents from her hand) + "el hilo" signature | Claude's assumption, stated to the owner; open question 2 |
| Film cards use real district names, no invented listings | production has no listings; never fake data |
| Film sound from HeyGen's catalog (free with sign-in) instead of synthesising it | better quality; credited on the page |
| Deploy the additive server endpoints to production after staging | Claude's stated assumption from "push hard on everything"; done, no existing route changed behaviour |

## 7. Changed / rejected
- `finish` as an HTML page with meta refresh + "Abrir Yavaya" link → 303 redirect (27 Nov, before any phone ran it); strings `mobile.auth.returning` and `mobile.auth.open_app` removed
- WebRTC 144.2.0 → 144.1.2 (Kotlin type mismatch)
- Four Android ABIs → two phone ABIs (out of memory)
- One Skia canvas per panel everywhere → lite glass in grids/lists
- ❌ Expo "build from repository" (`build_run` MCP tool): the Expo project has no GitHub repository connected
- ❌ App Links for the return address (deferred to Chapter 10; custom scheme + PKCE for now)
- New look palette: violet main light + gold accents (Claude's proposal), and the Halo prototype's obsidian + violet + champagne gold → obsidian black + gold, violet only a tiny glow on Roxi (owner, 27 Nov). The app's current Halo stays as built until the owner approves the new look.
- Roxi's violet rim (rule 16, AX-D011) → gold glow (owner, 27 Nov; AX-D013)
- Roxi's purple outfit in the film → graded to obsidian with gold piping (open question 1 asks the owner to confirm)
- Film sound synthesised by us (stated assumption) → HeyGen catalog music and effects
- Phone copy of the film at 5200k (gritty in the release) → 6000k tune grain, 14.6 MB
- ❌ The reference's cyan, glitch, scanlines, DNA helix, logo, armour and full-frame white flash

## 8. Data & facts (exact)
| What | Value |
| --- | --- |
| Repo | Lunara-Society/yavaya, checked out at `/home/user/yavaya` (`platform/`, `mobile/`, `docs/synapse/`) |
| Latest commits | branch `claude/yavaya-lat-migration-uzwusm`: the second-send commit on top of `44dfb50` (Aether AX-00 to AX-03); `main`: `46d73ac` (the Aether commits wait for the owner's "push main": the push to `main` was refused by the session's permission check). Earlier: `146d2ea` build memory limits · `18cef41` "Chapter 09 record; app sign-in returns by redirect" (last platform change, deployed) |
| Earlier commits this chapter | `4c6894a` platform endpoints · `0ac7b5f` voice deps · `6c78bab` WebRTC pin · `a889c1f` mobile 0.4.0 · `c3fbcd7` phone ABIs only |
| App version | 0.4.0 (`mobile/package.json`, `app.json`) |
| Expo project | `@yavaya/yavaya`, ID `9e779c70-bbec-48c5-ac71-ca8a45debf66`, Android package `yavaya.lat` |
| Preview APK 0.4.0 | build `27cc5ff7-4724-4f42-a331-0271f3f54f9c` (from `146d2ea`, channel `preview`), FINISHED in 15 min, 95.6 MB, https://expo.dev/artifacts/eas/WULe2u76i-w-fKRaBMYryUYJ6aYBkvQJNxB_WaF8Q2k.apk (valid until 2026-12-11T02:17:49Z); checked: arm64-v8a + armeabi-v7a (28 libs each), WebRTC, `yavaya` scheme, RECORD_AUDIO |
| Failed builds | `61e55061` (WebRTC prefix) · `91a52595` ("Gradle build daemon disappeared", out of memory) · `258b7ac1` (stalled 5 min into native compiles, canceled at the 45-minute limit) · `61a280db` canceled · `d2a5bee8` dev 0.3.0 canceled at 45 min |
| EAS limits (docs) | medium Android class 4 vCPUs, 16 GB, Gradle `-Xmx4g`, `org.gradle.parallel=true`; `large` 8 vCPUs, 32 GB (paid); builds over the plan's maximum duration are canceled (observed 45:00) |
| Last good APK (0.3.0) | build `6d7af8c1` |
| Production | https://yavaya.lat · Railway project `yavaya` `682b2a31-cad5-4e80-a863-51a4dd23f012`; deploys of `18cef41` SUCCESS (services `d49a2cfb…` ams, `6fbb30af…` iad; `e907c02f…` skipped) |
| Staging | https://yavaya-web-staging.up.railway.app · Railway project `yavaya-staging` `c9521f3e-2be0-4a82-8787-dd17f9287cce`; deploy of `18cef41` SUCCESS |
| Tests | platform 96 files / 863 tests pass · mobile 41 pass · shaders 6/6 · local sign-in 18/18 |
| Live checks (27 Nov) | config, auth/session, feeds 200 on both; `auth/start` bad params 400, valid 303 → `/auth/google?next=/api/mobile/v1/auth/finish`; production feeds 0 items (website pages also empty: "Todavía no hay publicaciones") |
| Sign-in code | AES-256-GCM, key = HMAC(SESSION_SECRET, 'yavaya mobile sign-in code v1'), 120 s, bound to PKCE; hand-off cookie `yav_mobile_auth`, path `/api/mobile/v1/auth`, 15 min |
| App session storage | SecureStore key `yavaya.session.v1`; WebView cookie `yav_session` |
| Stack | Expo SDK 58, RN 0.88.1, `@elevenlabs/react-native` 1.3.0, `@livekit/react-native` 2.12.0, `@livekit/react-native-webrtc` 144.1.2, `livekit-client` 2.25.0, `@livekit/react-native-expo-plugin` 1.0.3, `@config-plugins/react-native-webrtc` 15.0.2, `expo-crypto` ~58.0.9 |
| Docs placeholders | filled (APK link in NEXT_CHAPTER.md and TEST_REPORTS.md) |
| Concept film | "Presencia Oro", `design/films/oro/` (commit `a28411d`), 19.0 s, 1080×1920, 30 fps, 570 frames; private page https://claude.ai/artifact/JLZ1LkLch8aUbRz4hQxVDf |
| Film palette | ground `#050505`; gold `#E2C27A` / `#F6DDA0` / `#FFF3D6`; violet `#8E7CFF` rim 0.12–0.18 only (the film as made; Roxi's glow is now gold); Geist Light/Regular/SemiBold |
| Film files kept out of git | `renders/` (master 52.9 MB), `assets/audio/` (re-fetch by the HeyGen catalog ids in `SPEC.md`), `.hyperframes/`, `node_modules/` |
| Film sound (measured, not heard) | eagle hit 15.00 s, whooshes from 6.35 s, release 11.75 s, breath −23 to −35 dB, −12.9 LUFS, true peak −1 dBTP |
| Owner's reference video | "Ideas.mp4" (17 s Assassin's Creed fan animation by @MadebyGuille); not in the repo; its breakdown is in `VISUAL_DIRECTION.md` |
| Aether × Roxi Anima memory | `docs/aether/` (README, CONSTITUTION, CHAPTER_STATUS, MASTER_ARCHITECTURE, REFERENCE_MATRIX, ROXI_CAPABILITIES, ROXI_PIPELINE, VISUAL_CONSTITUTION, ASSET_REGISTRY, TECHNICAL_DECISIONS, PRODUCTION_TESTS) |
| Owner's references of 27 Nov (R01–R71, four sends) | private page https://claude.ai/artifact/SDQpvaaspuA2gMJeyDEKoe (version 5) holds the originals (`refs/…`) and frame sheets (`sheets/…`); hashes in `docs/aether/ASSET_REGISTRY.md` §3 to §3d; measurements in `design/references/aether/metrics.json` and `metrics-batch2.json` to `metrics-batch4.json`; face scores in `identity-2026-11-27.json`, `identity-batch3.json`, `identity-batch4.json` and `identity-small-controls.json` |
| Third send facts | 20 files, 3 duplicates (the same files as R37, R38, R39) dropped; 17 new, 12 frames held 0.22–0.35 s; 0 flashes; violet on the figure, blue in the interface scenes; faces: R40 0.37, R56 0.18, the rest under 60 px; tactical outfit (thigh pouches or a holster, straps, fingerless gloves, combat boots); invented "YAVAYA" marks and a "Mi Yavaya" tab (not in the app) |
| Fourth send facts | 15 files, all new; 12 frames held 0.30–0.65 s; flashes at most 0.5/s; gold glow (R68 `#DEA473`); one consistent woman (0.6–0.9 to each other) at 0.18–0.38 against Roxi, whose own images score 0.88–0.90 at GIF size; brown leather jacket, wavy brown hair; a gold "V" mark; flows into Santuario, light maps, layered cards, product in hand, listing creation, voice search; conflicts: Mercadito checkout, in-app tokens ("Bóveda Digital"), Mensajes, YavayaGo restaurants and routes, new Santuario sections |
| Second send facts | 20 files, 1 duplicate of R20 dropped; R21–R26 6 frames; R27 12 frames held 0.65 s; R28–R39 12 frames held 0.22–0.24 s, 358 × 358; 0 flashes; the Roxi GIFs glow violet (hers will be gold); face match with her source: her images 0.95–0.99, R28 0.59, close-ups R37 0.37, R39 0.32, R38 0.21, other women 0.07–0.48 |
| Identity check | `design/references/aether/tools/identity_check.py <models> <source> <out> <files>`; needs `opencv-python-headless` and the YuNet (MIT) and SFace (Apache-2.0) models from huggingface.co/opencv, kept outside the repo; bar 0.80 |
| Reference facts | GIFs are keyframe boards: 6–9 frames held 0.85–1.8 s; flash check max 0.5/s; gold medians `#DEA258` (highlight) and `#895E2F` (body); R09 = Roxi's source pixels; women in R03, R08, R10 are not Roxi |
| Repository visibility | `Lunara-Society/yavaya` is **public** (checked 27 Nov) |
| Default new-session repo | `Lunara-Society/Lunara-Society.github.io` = the Lunara Society website, NOT Yavaya; do not work there (rule 12) |
| Session environment | "Full": holds the network secret for api.expo.dev that EAS builds need ("Default" doesn't) |

Commands that work in this environment:
```bash
cd /home/user/yavaya/mobile
EXPO_TOKEN=placeholder-replaced-by-proxy npx eas-cli build:view <id> --json   # the environment's network secret for api.expo.dev supplies the real login
EXPO_TOKEN=placeholder-replaced-by-proxy npx eas-cli build --platform android --profile preview --non-interactive --no-wait --json
curl -s --compressed -o build.txt '<logFileUrls[0] from build:view>'   # build logs are brotli-encoded
npm test; npx tsc --noEmit -p .; npm run check:shaders
cd ../platform && npx vitest run    # full suite, local Postgres (service postgresql start)
```
Film (HyperFrames; skills in `/root/.claude/skills/hyperframes`, CLI via its `scripts/plugin-cli.mjs`):
```bash
cd /home/user/yavaya/design/films/oro
python3 -I tools/prep.py /home/user/yavaya/mobile   # Roxi grade + particle data into assets/
npx hyperframes check --json; npx hyperframes snapshot --at 1.5,4,7.7,10,12.3,15.4,18.7; npx hyperframes render
```
- `npx expo prebuild` rewrites `package.json` scripts (changes the fingerprint): revert with `git checkout mobile/package.json` and delete `android/`.
- The local end-to-end sign-in check needs a production build (`next build && next start -p 3100`); its env sets `NODE_ENV=production`, so `next dev` fails with an EvalError. The script and env were in the old session's scratchpad and may be gone.

## 9. People, terms & names
- **People:** the owner (Yavaya / Lunara Society), phone tester.
- **Terms & nicknames:** Presencia Oro = the concept film; el hilo = two strands of light forming the Yavaya mark ("Lo que nos une"); La señal = proposed assembling transition; Noche de Luz, La Ciudad Viva, Roxi en tu mundo… = the ten directions in `VISUAL_DIRECTION.md`; Synapse = the native app programme; Presence = Roxi's visual system; Classic = switch back to the previous look; "lite" glass = canvas-free `HoloPanel lite`; Laboratorio = in-app lab screens (preview builds).
- **Names in use:** routes `platform/src/app/api/mobile/v1/auth/{start,finish,exchange,session,web}`, `…/roxi/start`, `…/feed/[district]` (mercadito, work, animals, community); `platform/src/server/auth/{mobile,bearer,context}.ts`; mobile `src/business/{api,auth.tsx,feed}.ts`, `src/roxi/{RoxiVoiceProvider.tsx,tools.ts,RoxiIsland.tsx}`, `src/render/{shaders.ts,RoxiHologram.tsx,HoloPanel.tsx}`, `src/screens/{Home,District,RoxiScreen,WebScreen,Account,Settings}.tsx`; `app.config.ts` `withPhoneArchitectures`.

## 10. Work state
| Item | Status | Version / location | Notes |
|---|---|---|---|
| Server endpoints (sign-in, bearer, Roxi start, feeds) | live | `18cef41` on yavaya.lat and staging | not exercised from a phone yet |
| Mobile 0.4.0 code | done, pushed | `c3fbcd7` | typecheck + 41 tests |
| Preview APK 0.4.0 | finished, link sent to owner | EAS `27cc5ff7` | waiting for the owner's phone test (no results yet) |
| Chapter 09 record | written, pushed | `docs/synapse/CHAPTER_09.md` + index, tests, decisions D-032–D-037, known issues 31–35, status, memory | two placeholders above |
| Owner phone test of 0.4.0 | not started | steps in `docs/synapse/NEXT_CHAPTER.md` | waits for the APK |
| Development build | none current | — | owner doesn't need it |
| Task list | #92–#99 completed; #57 (HeyGen AI video) pending on HEYGEN_API_KEY | — | — |
| Visual direction notes | written | `docs/synapse/VISUAL_DIRECTION.md` | palette, reference breakdown, 8 build ideas, 10 epic directions, commands |
| Aether AX-00 to AX-03 | done (documents and analysis; no product change); AX-02 second to fourth sends (R21–R71) done | `docs/aether/`; private page above | AX-03: pipeline chosen, 3D master NOT made (needs the owner's decisions); more GIFs coming |
| Concept film "Presencia Oro" | first cut delivered | `design/films/oro/` + private page above; `REVIEW.md` | waiting for the owner's three answers |

## 11. Next steps
0. **If `/home/user/yavaya` is missing:** attach the repo with the `add_repo` tool (owner `Lunara-Society`, repo `yavaya`, access `push`), clone it to `/home/user/yavaya` as the tool says, call `register_repo_root`, then `git checkout claude/yavaya-lat-migration-uzwusm`. Never work in `Lunara-Society.github.io`.
1. **Next action:** take the owner's further GIFs: keep one copy of any duplicate (SHA-256, then frame correlation ≥ 0.8), read every frame (`analyse_refs.py`), measure faces (`identity_check.py`), record them in `REFERENCE_MATRIX.md`, `ASSET_REGISTRY.md` and the private page. Only when the owner says all GIFs are sent: go over (a) the seven decisions on the private page https://claude.ai/artifact/SDQpvaaspuA2gMJeyDEKoe (also in `docs/aether/ROXI_PIPELINE.md` §9 and `REFERENCE_MATRIX.md` §4), (b) the AX-04 text or approval of the proposed AX-04 (`docs/aether/CHAPTER_STATUS.md` §3), and (c) the owner's results from the 0.4.0 phone test (steps in `docs/synapse/NEXT_CHAPTER.md`); if they say the Google sign-in stops on a browser page, ask for a screenshot of that page first.
2. Fix what the phone test shows, re-run the checks (mobile `npm test`, `npx tsc`, platform `npx vitest run`), build a new preview APK the same way, push to the branch and `main`.
3. When the owner answers the film questions (section 12), turn the chosen moment into a design with `/superpowers:brainstorming`, behind the Classic switch, smooth on a mid-range phone.
4. Record results in TEST_REPORTS.md, KNOWN_ISSUES.md and CHAPTER_09.md §6; Chapter 10 (proposed in NEXT_CHAPTER.md) needs the owner's go.

## 12. Open questions ⚠️
- 0.4.0 phone test: no results yet (steps in `docs/synapse/NEXT_CHAPTER.md`).
- Aether decisions (numbered as on the private page): 1 gold amber `#DEA258` or champagne `#E2C27A`; 2 Roxi's outfit kept (recommended) or black and gold; 3 new Roxi views made by the owner or generated; 4 may her image go to outside services; 5 paid tools; 6 which reference-only features to build (saved hearts, likes, messages, booking, enrolment, business requests, fixed fares; from the second send: country communities, turn-by-turn with live traffic, trip ratings; from the fourth: buying inside Mercadito, restaurants and routes in YavayaGo, new Santuario sections); 7 AX-04 text or the proposed AX-04.
- Is the gold "V" beside "Yavaya" in the fourth send a new logo the owner wants? Until answered, the official logo stays (AX-D017).
- Film 1: Roxi in black and gold, keep it or back to her purple outfit?
- Film 2: which moment should the app do first: Roxi assembling, the arc of cards from her hand, or the eagle signature ("el hilo")?
- Film 3: anything too much or too little?
- Which two or three of the ten directions to design first? Noche de Luz is tied to 7 December 2026.
- Unverified: whether HeyGen catalog music may be used in public videos; check its licence before anything is published.

## 13. Re-attach checklist
- [ ] This file (`docs/synapse/handoff-yavaya.md`, also in the repo).
- [ ] "Ideas.mp4", the owner's reference video, only if the new chat must watch it again (its breakdown is in `VISUAL_DIRECTION.md`).
- [ ] The repository Lunara-Society/yavaya must be attached to the new session (the code, docs and this file live there).
- [ ] The 27 Nov references are on the private page (originals and sheets); re-attach them only if that page is lost.

---
<sub>Audit: 13/13 sections · 19 rules · 8 corrections · 45 data points · secrets removed: none found · generated by active-memory</sub>
