# Chapters 02–08: the native Synapse application

Built 26 November 2026, after the owner's "yes to everything" (security
upgrades, staging, Chapter 02 onwards). Each chapter below states what exists,
how it was verified, and what is still unverified. States follow
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

**How it was verified.** This cloud machine cannot run a phone emulator (no
hardware virtualisation) and EAS cloud simulators are not enabled on the Expo
account (`simulator:availability` → `available: false`). So every claim rests
on one of four kinds of evidence:

1. **Unit tests** of the pure logic (39, `npm test` in `mobile/`).
2. **Skia's own compiler** (CanvasKit) compiling and rendering every shader
   (`npm run check:shaders`).
3. **The app itself running in Chromium at phone size** (the Expo web build,
   driven by Playwright through ten scenes, with real server data through a
   same-origin proxy). Its frame numbers come from **software rendering
   (SwiftShader, no GPU)** and say nothing about a phone; its start-up and
   correctness results do count.
4. **EAS cloud builds** compiling the native code for Android and iOS
   (results in [TEST_REPORTS.md](TEST_REPORTS.md)).

Nothing has run on a phone yet. That is the owner's first step
([NEXT_CHAPTER.md](NEXT_CHAPTER.md)).

---

## Chapter 02: mobile application foundation

### Architecture decision (evaluated against this codebase)

| Option | GPU, shaders, particles | Digital human | Backend reuse | One team, two platforms | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Expo development builds + React Native (New Architecture) + Skia + Reanimated** | SkSL runtime shaders on the GPU (Metal / Vulkan / GL through Skia); UI-thread animation | path: the platform's Genesis character is a glTF (MakeHuman, CC0) already rendered by Three.js; native rendering through a GPU 3D layer (react-native-wgpu or expo-gl with Three.js) as a later module | TypeScript like the platform; same types and rules language | one codebase; EAS builds, updates, submissions already in place | **chosen** |
| Flutter | strong (Impeller, fragment shaders) | through a 3D engine plug-in | Dart: nothing shared with the TypeScript platform | one codebase | rejected: full rewrite, new language, loses the existing app and pipeline |
| Fully native (Swift + Kotlin) | best possible GPU access | best possible | nothing shared | two codebases, double the work | rejected for now: a module can drop to native code inside Expo when measurement demands it |
| Unity or Unreal as the app | excellent 3D | excellent | poor | one codebase | rejected as the app (heavy binary, weak accessibility and text, battery); kept as a possible embedded "stage" for a future cinematic Roxi |
| WebView / Capacitor | browser-limited | browser-limited | full | one codebase | rejected: the directive forbids a website wrapper. The website stays only as the **fallback screen** |

Criteria the choice still has to meet, and how:

| Criterion | How the architecture provides it | State |
| --- | --- | --- |
| Advanced GPU graphics, custom shaders, real-time particles | `@shopify/react-native-skia` runtime effects; five SkSL programs (§04, §05) | REAL (code, compiled by Skia); phone frame rate NOT TESTED |
| Digital human integration | Roxi as a depth-reconstructed image today; a 3D Roxi through a GPU 3D layer later | NOT IMPLEMENTED (path documented) |
| Cinematic transitions | Reanimated 4 on the UI thread; scene host (§06) | REAL (code, browser-verified) |
| Native haptics | `expo-haptics`, patterns (§07) | REAL (code); NOT TESTED on a phone |
| Spatial sound | `expo-audio` layered playback today; positional audio needs the Web Audio API on the device (Software Mansion's `react-native-audio-api` is the candidate) | Partly: layered, prioritised, ducked sound REAL (code); positional sound NOT IMPLEMENTED |
| Existing backend integration | business layer: public reads today; the versioned mobile API (BASELINE_AUDIT §7) for writes | Partly REAL (reads); writes NOT IMPLEMENTED |
| Secure authentication | session token slot in the phone's keystore (`expo-secure-store`); the website screen keeps its cookie session | the slot exists; token issuance NOT IMPLEMENTED |
| Notifications | `expo-notifications` installed and configured | NOT IMPLEMENTED (needs FCM and APNs credentials and a device registry) |
| Maps | Skia map hologram with real points (§04); MapLibre native for street maps later | Partly REAL |
| Payments | store billing for digital goods (owner decision: Google Play / Apple billing) before any store release | NOT IMPLEMENTED |
| Long-term scalability | independent layers, feature flags, EAS Update channels, staged environments | REAL (structure) |

### The layers (`mobile/src/`)

| Layer | Folder | Holds | May depend on |
| --- | --- | --- | --- |
| Business functionality | `business/`, `core/` | server door, public data, session slot; variants, flags, preferences | nothing visual |
| Navigation | `navigation/` | routes, deep links, stack reducer (pure, tested), provider with Android back | core |
| Rendering | `render/` | shaders, compiled effects, environment, holographic panel, district object, map, toasts, reconstruction | design, performance |
| Animation | `motion/` | transition specs (pure), scene host, cues, metrics, scene error boundary | navigation, render, audio, haptics |
| Audio | `audio/` | sound table, mixing rules (pure), engine | — |
| Haptics | `haptics/` | patterns (pure), player | — |
| Roxi | `screens/RoxiScreen.tsx`, `synapse/` (P-01) | her presence and reconstruction; her voice and tools stay the website's (one Roxi) | render, motion |
| Districts | `districts/` | the fifteen districts (one accent each), map geometry | design |
| Performance adaptation | `performance/` | tiers, budgets, frame statistics (pure), quality provider stepping down on slow frames | a11y |
| Accessibility | `a11y/` | reduced motion, screen reader, bold text, font scale limits, announcements | — |
| Design system | `design/` | tokens (pure, tested), typography, icons, controls | a11y, motion (cues) |

The app root (`src/AppRoot.tsx`) composes the providers in dependency order and
shows either the Synapse shell or Classic.

### Environments

| | Development | Preview | Production |
| --- | --- | --- | --- |
| App name / Android package / iOS bundle | Yavaya Dev / `yavaya.lat.dev` / `lat.yavaya.dev` | Yavaya / `yavaya.lat` / `lat.yavaya` | same as preview |
| Server | **staging**: `https://yavaya-web-staging.up.railway.app` | yavaya.lat | yavaya.lat |
| Build | dev client APK (and an iOS simulator build) | standalone APK, internal | app bundle for Google Play |
| EAS Update channel | `development` | `preview` | `production` |
| Laboratory | on | off (remote flag can enable) | off |

The development app installs beside the real one, so testing never touches
the owner's real account or data.

**Staging** is a separate Railway project, `yavaya-staging` (environment
`staging`): its own empty Postgres (seeded with geography only), the web
service built from the work branch `claude/yavaya-lat-migration-uzwusm`, email
and SMS to the server log (`console`), no Stripe key, no WhatsApp, no media
storage, no ElevenLabs. It is deliberately **not** a fork of production: a fork
would copy real members' data and live payment and messaging credentials, and
its scheduler could message real people. Pushing to the work branch deploys
staging; pushing to `main` deploys production.

### Feature flags and rollback

| Lever | Scope | How |
| --- | --- | --- |
| Remote flags | any Synapse layer (shell, awakening, reconstruction, parallax, sound, haptics, lab) | Railway variable `MOBILE_FLAGS` (JSON of booleans) served by `GET /api/mobile/v1/config`; cached by the app and applied on the next launch; unknown or malformed values are ignored |
| Minimum build / notice | old binaries, incidents | `MOBILE_MIN_BUILD`, `MOBILE_MESSAGE` |
| Classic | one person, or everyone (`synapseShell: false`) | Settings switch; flag |
| JavaScript rollback | the app's code | EAS Update per channel: `eas update --channel production` publishes, `eas update:rollback` (or republishing an earlier update) rolls back; the runtime version follows the native fingerprint, so an update never lands on a binary it was not built for |
| Server rollback | the website and APIs | Railway "rollback" on the previous deployment |

### Platform limitations (as of 26 Nov 2026)

| Limitation | Effect | What lifts it |
| --- | --- | --- |
| No Apple Developer account | no iOS device builds, TestFlight or App Store; only iOS **simulator** builds | owner enrols in the Apple Developer Program |
| EAS cloud simulators not enabled on the account; no emulator possible on this machine | the app cannot be watched running on Android or iOS from here | owner's phone test; or Expo enabling cloud simulators |
| Push needs credentials | no remote notifications | Firebase project (`google-services.json`) for Android, APNs key for iOS, and the device registry (mobile API) |
| Google sign-in inside WebViews | refused by Google | native sign-in through the system browser and App Links |
| Background audio | not used, by design | — |
| iOS silent switch | interface sounds respect it (`playsInSilentMode: false`) | — |
| Android has no silent switch in `expo-audio` | sounds follow the media volume; the person's own switch in Settings always applies | — |
| Snapshots for reconstruction (`makeImageFromView`) | native only; the web build fades instead | — |
| Device tilt | native only; the web build is still | — |
| SkSL (the ES2-level shading language) | loops need constant bounds, some words are reserved (`flat` caught twice by the checker) | `npm run check:shaders` before every build |
| Text inside a shader | never used for information: all information is real text, readable by screen readers | — |

---

## Chapter 03: visual identity

Code: `design/tokens.ts` (pure, tested by `design/design.test.ts`),
`design/Text.tsx`, `design/icons.tsx`, `design/controls.tsx`; demonstration:
Laboratory → Diseño.

| System | Decision |
| --- | --- |
| Base | absolute black (`#000000`); atmosphere is faint blue-violet lifts of black (`abyss`, `deep`), never grey fills |
| Light | light means information: focus, activity, importance. One soft key light from above in the environment; edges catch it according to the phone's tilt |
| Colour | text `#ECEFF6` (never pure white); system light `#9CC9FF`; restrained metal `#C9A96E` for primary actions and the brand; Roxi violet `#B9A3FF`; states positive, caution, critical |
| District accents | one per district, fifteen in all; each ≥ 7:1 on black, pairwise ΔE ≥ 20, and ≥ 14 from Roxi, signal and metal (tested). Only the focused or current district shows its colour; lists stay neutral, so the screen never carries many colours at once |
| Typography | Geist (words) and Geist Mono (numbers, data), SIL Open Font License 1.1; six weights bundled. Display 34/40 light, title 24/30, headline 18/24, body 16/24, label 14/20, caption 13/18, micro 12/16 mono uppercase; nothing under 12 px; text scales with the phone, within limits the layout holds |
| Materials | void (black), glass (dark translucent body, edge light), metal (hairline accents only), light (emissive lines for focus and data) |
| Depth hierarchy | environment → structure → panel → focus → overlay → system; deeper layers are darker, less lit and move less with tilt (parallax 0.15 → 0.8) |
| Iconography | 31 original line icons on a 24 grid, 1.5 stroke, round joins (`design/icons.tsx`); no icon font |
| Controls | ≥ 48 dp targets; pressed state within a frame; haptic acknowledgement; screen-reader role, label and state on every control |
| Holographic panels | `render/HoloPanel.tsx` (§04) |
| Motion tokens | durations 90 / 160 / 240 / 360 / 520 / 1400 ms; standard, decelerate, accelerate curves; springs without overshoot |
| Mobile layout | portrait first; information at the top, actions in the lower 40 % (thumb zone), the dock with the five essentials under the thumb, Roxi in the centre; a 24 dp left edge reserved for the back swipe |
| Not used, by rule | Roman, imperial, medieval or game styling; neon cyberpunk; meaningless HUD decoration |

---

## Chapter 04: holographic rendering engine

Code: `render/`. Demonstration: Laboratorio → Holograma (with a live frame
meter: fps, p95 frame time, dropped frames, device tier, cell size, JS heap).

| Component | Technique (genuine, real-time) |
| --- | --- |
| Environment | full-screen SkSL: key light, slow haze (value noise), sparse dust, vignette to black; tinted by the current district; parallax from tilt; one canvas for the whole session |
| Holographic information panel | real React Native content over a GPU glass layer (`EDGE_SKSL`): rounded body, edge light from the direction the panel faces, sheen; perspective lean with tilt by depth and toward the finger when pressed; focus lights the edge in the accent |
| Interactive district object | ray-marched signed-distance crystal and orbit ring (`OBJECT_SKSL`) with diffuse, rim and facet-edge light; drag to inspect with momentum; ray-march steps 32 / 48 / 72 by tier |
| Geographic visualisation | Natural Earth outlines (public domain, simplified to 573 points) drawn as light; real YavayaGo store points from the public live map with pulses; focus on one country |
| Spatial notifications | toasts arriving from depth at the top, out of the thumb's way, with sound, vibration and a screen-reader announcement |
| Floating contextual controls / focused information | the dock (overlay depth) and panel focus state |
| Digital projection | Roxi's reconstruction in her scene (§05) |
| Adaptive quality | tier from memory and year class; steps down after 24 consecutive slow frames; reduced motion → light tier |

Not claimed: volumetric 3D information (panels are 2D surfaces in perspective
with real lighting); backdrop blur (not used).

**Measurements.** Shader compilation: all pass (CanvasKit). Browser run
(software rendering, no GPU): environment plus panels plus a ray-marched object
at 360 × 780 ran at 6–16 fps; this is the CPU emulating a GPU and is no
indication of a phone. Phone frame rate and memory: NOT TESTED (the frame
meter in the laboratory measures them on the device).

---

## Chapter 05: digital reconstruction engine

Code: `render/shaders.ts` (`RECON_SKSL`), `render/techniques.ts`,
`render/Reconstruct.tsx`. Demonstration: Laboratorio → Reconstrucción (one
technique large, or all seven side by side; drag to scrub forward or backward;
Formar / Disolver change direction from wherever it is; timing presets; the
last run's planned and real duration, fps and dropped frames).

| # | Technique | Who forms first (ordering field) | How a point looks while forming |
| --- | --- | --- | --- |
| 0 | Microscopic particle assembly | cell hash and distance from the origin | a point of light per cell that grows into its cell, then resolves to full detail |
| 1 | Spatial data reconstruction | a scan front, top to bottom, jittered per row | quantised blocks in the accent's luminance behind the front, then detail; a faint grid ahead |
| 2 | Surface fragmentation | Voronoi shard order | shards slide in from their own directions with lit seams |
| 3 | Volumetric light emergence | distance from the origin | the surface first appears as light, which recedes into the real surface |
| 4 | Geometric mesh reconstruction | triangle order and height | wireframe edges, then flat facets, then detail |
| 5 | Controlled digital wave | distance from the touch point | a single refracting wave front reveals the surface |
| 6 | Soft molecular dissolution | smooth noise | a soft threshold with a lit band and a few motes |

Every technique runs **backwards** (dissolution) by running progress from 1 to
0; runs are **interruptible** (a new run starts from the current progress and
takes only the remaining share of its time); controls are **never blocked**
(the live view stays touchable during the run, and reduced motion replaces
every run with a 120 ms fade).

| Preset | ms | Use |
| --- | --- | --- |
| frequent | 260 | moves made many times a session |
| district | 520 | opening a district (inside the 400–700 target) |
| roxi | 900 | Roxi's arrival |
| cinematic | 1800 | optional experiences only (the awakening, the laboratory) |

Budgets per tier: cell 7 / 5 / 3.5 dp (fewer, larger particles on weaker
phones); light layers 0 / 1 / 2.

**Signature (chosen from the comparison):** *volumetric light emergence* for
arrivals of a place or a being (districts, Roxi, the Guardian), because it is
the calmest and most legible: the subject is recognisable from the first frames
and nothing flashes. The *digital wave* starts where the finger touched and
finishes first, so it is the frequent-navigation variant, and *soft molecular
dissolution* is the leaving variant. Fragmentation and mesh are kept for
special moments; the data scan reads as busier and is not used by default.

Reference frames of all seven at 35 % and 70 % were rendered by Skia's own
compiler on Roxi's face (CanvasKit, not committed).

**Applies to:** images (Roxi, the Guardian, products) through
`ReconstructCanvas`; live interface (panels, maps, whole scenes) through
`ReconstructView`, which snapshots the view on the GPU, reconstructs or
dissolves it, and hands back the live view.

**Limits:** live-view reconstruction is native-only; phone frame rates NOT TESTED.

---

## Chapter 06: cinematic motion engine

Code: `motion/specs.ts` (pure, tested), `motion/SceneHost.tsx`,
`motion/metrics.ts`, `navigation/`. Demonstration: Laboratorio → Movimiento
(buttons for every standard move and a table of measured transitions).

| Move | Kind | ms | Shape |
| --- | --- | --- | --- |
| Opening a district | spatial | 460 | the old scene passes by (scales up, fades); the district comes up from depth, from the touched tile or object when there is one (shared element) |
| Returning home / back | return | 320 | the scene recedes; the parent comes forward |
| Swipe back from the left edge | swipe | 220 from the release | the finger scrubs the return; let go early and it settles back |
| Opening a listing or a profile | spatial | 460 | as a district, one level deeper |
| Opening search, settings, the laboratory | focus | 300 | the scene dims away; the panel settles from above |
| Summoning Roxi | summon | 420 | rises from the dock where her button is; then she forms from light (§05) |
| Opening the map | dive | 480 | a camera dive into the map |
| Switching between services at the same depth | lateral | 240 | a short directional slide |
| Notifications, confirmations | toast | spring | arrive from depth with sound and vibration |
| Reduced motion | fade | 120 | crossfade everywhere |

Environment continuity: the environment canvas never unmounts; its light
takes the current district's accent over 520 ms.

**Measured in the browser** (software rendering; durations and latency are
meaningful, frame counts are not):

| Transition | Planned | Real | Touch → first moving frame |
| --- | --- | --- | --- |
| spatial → district | 460 ms | 467–650 ms | 26–55 ms |
| return → home | 320 ms | 333–433 ms | — |
| focus → search | 300 ms | 300–467 ms | — |
| dive → map | 480 ms | 550–567 ms | — |
| summon → Roxi | 420 ms | 483–500 ms | — |
| focus → settings | 300 ms | 317–350 ms | — |

On the first, GPU-free run before Skia was loading correctly, the same moves ran
at 56–60 fps with 0–2 dropped frames. Latency after the first move read 0 ms
in the browser because of how frame timestamps line up there; the phone's
laboratory table is the measure that counts. Budgets: touch-to-motion ≤ 100 ms;
≤ 2 dropped frames per transition.

---

## Chapter 07: cinematic audio and haptics

Sounds: `mobile/assets/audio/*.m4a`, made by `mobile/tools/audio/make-sounds.py`
(numpy synthesis: sine partials, filtered noise, envelopes, a fixed random
seed). **No samples, no third-party audio, nothing copied from any production:
Yavaya owns all of it.** Loudness-matched to one RMS target, peaks ≤ −3 dBFS,
faded ends, AAC 96 kb/s mono.

| Sound | s | KB | Event |
| --- | --- | --- | --- |
| awaken | 2.80 | 34 | the awakening: sub resonance, harmonic shimmer, air, one bell |
| district-init | 0.70 | 9 | opening a district: a rising fifth and a tick |
| reconstruct | 0.90 | 12 | points of light gathering |
| dissolve | 0.80 | 10 | a surface releasing |
| holo-emerge | 0.50 | 7 | a panel opening |
| roxi | 1.30 | 16 | Roxi: warm open chord, slow shimmer |
| guardian | 1.50 | 19 | the Guardian: inharmonic bronze, never loud |
| expand | 0.22 | 3 | information expanding |
| confirm | 0.44 | 6 | success: a rising fifth |
| back | 0.18 | 3 | backward navigation |
| notify | 0.59 | 8 | important notification: two bells |
| error | 0.40 | 5 | error: two low muted notes |

Total 164 KB.

Engine (`audio/engine.ts`, rules in `audio/mix.ts`, tested): players created
once (low latency); at most three sounds at once, the lowest priority yields;
Roxi's voice ducks everything else to 25 %; stepped fades; silent switch
respected on iOS; mixes with other apps' audio; nothing in the background;
the person's switch and volume in Settings always win; sound is never
required for anything.

Haptics (`haptics/patterns.ts`, tested): fourteen short patterns timed to their
visual event; cancelled with the animation.

One physical event: `motion/cues.ts` starts sound, vibration and motion on the
same frame and cancels all three if the motion is interrupted.

Testing with speakers, headphones and silent mode: NOT TESTED (needs the phone).

---

## Chapter 08: application awakening

Code: `screens/Awakening.tsx` (+ `AWAKEN_SKSL`). Optional, first launch only,
replayable from Settings.

| t (s) | Event | Sound / haptic |
| --- | --- | --- |
| 0.0 | darkness | `awaken` begins; soft pulse |
| 0.35 | microscopic points of light emerge (three depth layers) | soft pulse at 0.9 |
| 1.0 | spatial structures draw (rings, arcs, spokes) | — |
| 2.0 | the Guardian reconstructs (light emergence) | `guardian`, medium pulse |
| 2.7 | the Guardian dissolves into the environment (molecular) | — |
| 3.3 | Roxi forms (light emergence) | `roxi` at 3.4, light pulse |
| 4.3 | home becomes visible; live controls | — |
| 5.0 | done | — |

Rules: "Saltar" works from the first frame; plays once (`yavaya.awakened.v1`);
low-end and reduced-motion phones get a 1.2 s Guardian fade; sign-in and every
function sit underneath it and never wait for it; it is behind the `awakening`
flag.

**Start-up measured (browser, this machine):** JavaScript start → first frame
445–652 ms on first launch (with the awakening mounting), 181–303 ms on
relaunch. Native cold and warm start on a phone: NOT TESTED; the laboratory's
Arranque section shows JavaScript-to-first-frame and warm resumes on the
device, and `adb shell am start -W` gives the native figure.
