# Production architecture for Android and iOS (AX-04)

The architecture the Yavaya app grows into, designed on the code that exists
today (mobile 0.4.0, platform on Railway). Written 27 November 2026 from the
owner's chapter text (CONSTITUTION, AX-04 brief in CHAPTER_STATUS). Companion
documents: [VISUAL_LANGUAGE.md](VISUAL_LANGUAGE.md) (the permanent look, the
material, optical and transformation engines, navigation and touch),
[ROXI_ENGINE.md](ROXI_ENGINE.md) (the character engine) and
[IDENTITY_SPEC.md](IDENTITY_SPEC.md) (who Roxi is, measurably).

**In one paragraph.** Yavaya stays one React Native app for Android and iOS.
The functional app (screens, data, navigation, forms) is plain native UI that
works on every phone and never waits for a visual effect. On top of it sit
optional layers, each with one job and one engine: a Skia optical layer for
materials, light and transformations; a Roxi engine with interchangeable
renderers (3D, 2.5D portrait, still portrait, voice only); and an asset
service that downloads heavy files only when a phone can use them. Every
layer can fail, be switched off remotely or be skipped by the person, and the
app still does everything it did before.

## 1. What exists today (read from the code)

| Area | Code | What it already does | Verdict |
| --- | --- | --- | --- |
| Shell and screens | `mobile/src/screens/*`, `App.tsx` | native home, districts, search, map, Roxi, settings, account; Classic (the website in a WebView) | keep; Classic stays the last fallback |
| Navigation | `navigation/routes.ts`, `stack.ts`, `Navigator.tsx` | typed routes (home, district, listing, profile, search, map, roxi, settings, lab), a tested reducer, deep links from `yavaya.lat` URLs, Android back | keep and extend; it already gives the control transitions need |
| Scenes and transitions | `motion/SceneHost.tsx`, `specs.ts`, `cues.ts`, `metrics.ts` | eight transition kinds, edge swipe back, latency budget 100 ms, quality-aware | evolve into the transformation engine |
| Rendering | `render/*` (Skia SkSL shaders, `HoloPanel`, `Reconstruct`, `RoxiHologram`, `Environment`) | atmosphere, edge light, reconstruction techniques, the 2.5D hologram; shaders checked off-phone by `mobile/tools/synapse/check-shaders.mjs` | evolve into the optical layer |
| Adaptive quality | `performance/tier.ts`, `Quality.tsx` | low, mid and high tiers from memory and year class; steps down (never up) when frames overrun | evolve into the quality governor |
| Flags | `core/flags.ts` | every visual layer can be switched off from the server without a new build | keep; add one flag per new engine |
| Preferences | `core/store.ts`, `synapse/settings.ts` | AsyncStorage with safe fallbacks; the Synapse or Classic look | evolve into the preferences service |
| Roxi | `roxi/*` | ElevenLabs voice over LiveKit WebRTC, client tools, drafts, the docked island | evolve: voice and tools stay, the body becomes the Roxi engine |
| Data | `business/*` | session (SecureStore), API client, district feeds (mercadito, work, animals, community) | keep; grows with content descriptors (AX-06) |
| Design tokens | `design/tokens.ts` | black void, glass, restrained metal, 15 district accents tested at 7:1 on black, Geist | evolve into the permanent tokens (VISUAL_LANGUAGE §2) |

Stack facts (mobile `package.json`): Expo SDK 58, React Native 0.88.1,
React 19.3, Reanimated 4.7.1 with react-native-worklets 0.13.0, Skia 2.14.0,
Gesture Handler 3.3, expo-updates, expo-haptics, ElevenLabs React Native SDK
1.3.0, LiveKit WebRTC 144.1.2. React Native has run only the New Architecture
since 0.82, so every native library must support it. The last preview APK
(two phone ABIs) was 95.6 MB.

## 2. Principles that decide every choice

1. **The functional app never depends on rendering.** No screen, action or
   piece of data waits for a shader, a 3D model, an animation or a download.
   Visual layers are overlays that join when ready and leave when they fail.
2. **Navigation is immediate.** The destination screen mounts and takes
   touches at once; the transition is a visual layer over it that can be
   interrupted or reversed.
3. **One engine per job.** One 2D GPU engine (Skia), at most one 3D engine,
   one animation runtime for the interface (Reanimated), one voice stack.
   No second engine is added to do what an existing one can.
4. **Open formats and thin adapters.** glTF 2.0 and KTX2 for 3D, WebP and PNG
   for images, JSON for manifests and behaviour data. Each engine sits behind
   an interface the rest of the app calls, so it can be replaced.
5. **Measure, then choose.** Where two technologies are plausible, a spike on
   real phones decides (AX-D009).
6. **The owner's rules stay in force:** Classic behind one switch, Roxi
   prepares and the member confirms, no invented data, privacy of Espacio
   Violeta, no paid service without approval.

## 3. The nine layers

```
┌───────────────────────────── Phone ──────────────────────────────┐
│  9 Preferences ──────────────┐                                   │
│                              ▼                                   │
│  1 Functional UI  ◄── navigation, screens, forms, lists, data    │
│     │  layout rects, focus, route events                         │
│     ▼                                                            │
│  2 Visual rendering engine (optical layer, Skia)  ◄─┐            │
│  3 Roxi character engine (Presence layer) ◄─────────┤ 5 Animation│
│     ▲          ▲                                    │   system   │
│     │ intents  │ audio level, states                │            │
│  4 Intelligence orchestration ◄── 6 Voice system ───┘            │
│     │ tool calls, facts                                          │
│  8 Asset delivery ── manifests, packs, cache ──────────────────► │
└──────┬───────────────────────────────────────────────────────────┘
       ▼ HTTPS (bearer session)
  7 Backend services: platform API, Postgres, ElevenLabs agent, CDN files
```

| # | Layer | Owns | Never does | Technology | Grows from |
| --- | --- | --- | --- | --- | --- |
| 1 | **Functional application UI** | screens, navigation state, forms, lists, data fetching, accessibility, deep links, back | wait for 2, 3 or 8; draw effects itself | React Native views, Gesture Handler, Reanimated for small UI motion | `screens/`, `navigation/`, `business/` |
| 2 | **Visual rendering engine** (the optical layer) | materials, light, depth, transformations' visuals, district atmospheres | own state the app needs; block touches | Skia 2.14 (SkSL runtime shaders), one canvas per screen plus native "lite" fallbacks | `render/`, `motion/` |
| 3 | **Roxi character engine** (the Presence layer) | Roxi's twelve channels, her renderers, her persistence across screens | decide facts; publish, pay or send | channel controllers in TypeScript (UI-thread worklets where per-frame); renderer adapters: 3D (chosen in the spike), 2.5D Skia, still image, none | `roxi/`, `render/RoxiHologram.tsx` |
| 4 | **Intelligence orchestration** | turning conversation and tool events into Roxi intents and UI actions; the behaviour planner | invent facts; act without the member's tap where the rules require one | ElevenLabs agent (server-configured tools) + client tools + planner | `roxi/tools.ts`, `voice-context.ts` |
| 5 | **Animation system** | timing, springs, interruption and reversal for the interface; Roxi's animation graph | run cinematic sequences that hold the app | Reanimated 4 shared values and worklets for UI; inside 3, clips + procedural + IK + facial shapes | `motion/specs.ts`, `cues.ts` |
| 6 | **Voice system** | microphone, WebRTC session, speaking and listening states, audio level, transcripts | start without the member's action; keep audio | ElevenLabs React Native SDK over LiveKit, session opened and metered by the server | `roxi/RoxiVoiceProvider.tsx` |
| 7 | **Backend services** | accounts, sessions, districts, listings, content descriptors, flags, asset manifests, Roxi session start | send UI decisions; hold device state | Next.js platform on Railway, Postgres, `/api/mobile/v1/*` | `platform/src/app/api/mobile/v1/*` |
| 8 | **Asset delivery** | what is bundled, what comes by update, what is downloaded on demand; integrity, cache, prefetch | download heavy files a phone cannot use; download on mobile data without permission | bundled assets, expo-updates, a content-addressed manifest with on-demand packs (expo-file-system, to add) | `expo-asset`, `expo-updates` |
| 9 | **User preferences** | look, motion, quality, Roxi presence, placement and scale, voice, haptics, sound, device motion, data saver, language | store secrets (those stay in SecureStore) | AsyncStorage, versioned keys, safe defaults; later synced to the account for language and Roxi choices | `core/store.ts`, `synapse/settings.ts` |

Cross-cutting: the **quality governor** (from `Quality.tsx`) gives every
layer its budget; **SceneBoundary** error boundaries wrap each optional layer;
**flags** can switch any layer off; **metrics** record transition latency and
dropped frames.

### Contracts between layers (the seams that prevent lock-in)

- `OpticalRenderer` (layer 2): `register(elementId, rect, material, state)`,
  `setFocus(elementId)`, `transform(from, to, progress)`; implementations:
  `SkiaOptical` (high and mid), `LiteOptical` (views only), `NoOptical`.
- `RoxiRenderer` (layer 3): `load(lod)`, `apply(channelFrame)`, `dispose()`;
  implementations: `Roxi3D` (spike winner), `Roxi25D` (the existing Skia
  hologram), `RoxiStill` (portrait image), `RoxiNone`.
- `RoxiIntent` (4 → 3): `{ kind: 'present' | 'point_at' | 'attend' | …,
  target?, descriptor?, priority }` (ROXI_ENGINE §6).
- `AssetPack` (8): `{ id, version, sha256, bytes, minTier, url }` in a signed
  JSON manifest from the platform.

## 4. Technology evaluation

Compatibility criteria, in order: runs on React Native 0.88 with the New
Architecture (Fabric, TurboModules); fits Expo SDK 58 and continuous native
generation (no hand-edited `android/` or `ios/`); coexists with Reanimated 4
and react-native-worklets 0.13 and Skia 2.14 without a second copy of a
runtime; Android and iOS from one codebase; licence allows commercial use;
size and memory fit a 120 USD-class Android; replaceable.

### 4.1 Approaches

| Approach | What it means here | Strengths | Weaknesses | Verdict |
| --- | --- | --- | --- | --- |
| **Native rendering** | platform UI and graphics per OS: SceneKit/RealityKit and Metal on iOS, Filament/SceneView and Vulkan on Android, written twice | best per-OS fidelity | two engines and two codebases for every effect and for Roxi; breaks "one engine per job"; the app is React Native today | rejected as a whole; native views stay the base of layer 1 |
| **Cross-platform rendering** | one GPU engine embedded in React Native for both OSs | one codebase; already proven in this app (Skia) | 2D only; true 3D needs another engine | **chosen for layer 2** (Skia) |
| **Embedded 3D engine** | a full engine inside the app: Unity as a Library, Unreal, Babylon | editors, physics, mature 3D | large binaries, separate runtime and toolchain, lock-in; the React Native bridges are old or lack New Architecture support (below) | rejected |
| **Hybrid** | native UI for function, Skia for 2D optics, a lean 3D renderer only for Roxi (and the Guardian), video only for authored cinematic moments | each job gets the lightest adequate tool; graceful fall-back per layer | needs clean contracts between layers | **chosen** |

### 4.2 Candidates checked against this app (npm registry, 27 Nov 2026)

| Candidate | Version | New Architecture | Peers / runtime | Licence | Notes | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `@shopify/react-native-skia` | 2.14.0 (installed, latest) | yes | react-native-worklets ≥ 0.7, Reanimated ≥ 4 | MIT | already renders shaders here; shaders checked off-phone | **layer 2** |
| `react-native-filament` | 1.11.0 | yes (codegen) | `react-native-worklets-core` ≥ 1.3.2: a second worklet runtime beside react-native-worklets | MIT | native Filament (PBR, skinning, morph targets, glTF); renders with Metal on iOS; package 343 MB unpacked (prebuilt binaries per ABI): app growth must be measured | **3D finalist** |
| `expo-gl` + `three` (+ `@react-three/fiber`) | 58.0.4 + 0.187.0 (+ 9.8.2) | Expo module | none extra; R3F peers React ≥ 19 < 19.4 (this app: 19.3) | MIT | matches SDK 58; three has skinning, morph targets, GLTF loading, custom shaders; GL calls run on the JavaScript thread; on iOS it draws through OpenGL ES, which Apple deprecated in 2018, and an Expo discussion records no plan to move it to Metal | **3D finalist** |
| `react-native-wgpu` | 0.5.17 | JSI | React Native ≥ 0.81 | MIT | WebGPU; young; a future path for three's WebGPU renderer | watch, not now |
| `@babylonjs/react-native` | 2.0.8 | no codegen found | Babylon core ≥ 9, react-native-permissions | MIT | 86.5 MB package; New Architecture support unproven | excluded |
| `react-native-unity` (Unity as a Library) | 1.0.1 | no | peer React Native ^0.41 | MIT bridge, Unity licence | unmaintained bridge, large runtime, lock-in | excluded |
| `rive-react-native` / `lottie-react-native` | 9.8.6 / 7.5.1 | — | Lottie needs dotLottie | MIT | vector animation runtimes: a second 2D engine beside Skia | not for core UI; only if an authored asset needs it |
| `expo-file-system` | 58.0.15 | Expo module | — | MIT | download and cache asset packs | **add (layer 8)** |
| `expo-image` | 58.0.19 | Expo module | — | MIT | disk-cached images with placeholders | **evaluate in AX-04b** for listings |
| `expo-sensors` | 58.0.5 | Expo module | — | MIT | device motion; not needed, because Reanimated's `useAnimatedSensor` already reads the phone's rotation (`render/useTilt.ts`) | not added |
| `react-native-mmkv` | 4.3.2 | yes | react-native-nitro-modules | MIT | faster storage, adds a runtime | not now: AsyncStorage is enough for preferences |

## 5. The selected stack

| Layer | Technology | Status |
| --- | --- | --- |
| 1 Functional UI | React Native views, the app's own navigator (routes, reducer, SceneHost), Gesture Handler 3.3, Reanimated 4.7 | exists; extended |
| 2 Visual rendering | Skia 2.14 SkSL; one optical canvas per screen + `LiteOptical` views | exists in part (Synapse); rebuilt as the material and optical engines |
| 3 Roxi engine | channel controllers (TypeScript, worklets for per-frame) + renderer adapters; the 3D renderer is **Filament or expo-gl + three, decided by the spike below** | 2.5D renderer exists; engine new |
| 4 Orchestration | ElevenLabs agent with Yavaya's tools, client tools, behaviour planner | voice and tools exist; planner new |
| 5 Animation | Reanimated (UI); Roxi graph inside layer 3 | exists (UI) |
| 6 Voice | ElevenLabs React Native SDK 1.3.0, LiveKit WebRTC | exists |
| 7 Backend | platform `/api/mobile/v1` + new `assets/manifest` and content descriptors | exists in part |
| 8 Assets | bundled core, expo-updates, content-addressed packs via expo-file-system | updates exist; packs new |
| 9 Preferences | AsyncStorage service with versioned schema; SecureStore for the session | exists in part |

**Navigation.** The mobile folder's `AGENTS.md` (Expo's template text) says to
use Expo Router; this app instead has its own tested navigator with deep
links, Android back and transition control, which the transformation engine
needs. Moving to Expo Router would cost a rewrite with no gain for the
owner's goals, so the app's navigator stays (AX-D031).

### 5.1 The 3D decision (spike S9, before any 3D ships)

The same Roxi GLB (LOD0–LOD3, ROXI_PIPELINE §7) in both finalists, in a
development build, on the owner's Samsung and on a 120 USD-class Android, and
on one iPhone when an Apple developer account exists.

| Measure | Pass |
| --- | --- |
| Frame time with Roxi on screen (p95) | ≤ 16.7 ms on the high tier with LOD0–1; ≤ 33 ms on the low tier with LOD2–3 |
| Added memory | ≤ 150 MB with LOD1 loaded |
| App size added per ABI | ≤ 8 MB (engine only; models are downloaded, never bundled) |
| Cold start | unchanged: the engine loads only when Roxi first appears in 3D |
| Coexistence | Reanimated, Skia and voice keep working with the engine running |
| Identity | renders pass IDENTITY_SPEC (T-ID-01) |

Rule: if only one passes, it is chosen. If both pass, choose the one with no
second worklet runtime and the smaller size, unless iOS rendering longevity
decides it (Filament draws with Metal; expo-gl relies on deprecated OpenGL ES
on iOS). The losing adapter is deleted, so only one 3D engine ever ships.

## 6. Adaptive rendering and graceful degradation

| Level | Optical layer | Roxi | Transitions | When |
| --- | --- | --- | --- | --- |
| **L4 Full** | Skia materials with background sampling (refraction, frost), district atmosphere | 3D | shape interpolation, material transformation, reconstruction | high tier, 3D pack cached, charging or battery above 30 % |
| **L3 Balanced** | Skia materials without background sampling (gradients approximate refraction) | 2.5D hologram | shape interpolation, shared elements | mid tier, or 3D pack not yet cached |
| **L2 Lite** | `LiteOptical`: views, gradients, borders, a static noise texture | still portrait | shared elements and fades | low tier, battery saver, repeated frame overruns |
| **L1 Basic** | flat obsidian surfaces and hairlines | voice and text only | crossfades | an optional layer failed twice, or the person chose it |
| **L0 Classic** | the website in a WebView | Roxi on the website | the website's | the Classic switch, or the native shell flag off |

The **quality governor** chooses the level at start from the device tier and
preferences, steps down on sustained frame overruns (never up within a
session, as today), on memory warnings and on battery saver, and per layer:
Roxi can drop to 2.5D while materials stay at L3. **Watchdogs:** an engine
that has not drawn its first frame within 1.5 s, or throws, is replaced by the
next level down for the session and reported. **Reduce motion** keeps L3
materials and turns movement into fades.

## 7. Progressive loading and caching

| Class | Examples | How it arrives | Size rule |
| --- | --- | --- | --- |
| Core (bundled) | fonts (Geist, Geist Mono, Cinzel subset), icons, SkSL shaders, the still portrait, district emblems | inside the build | the base app grows by at most 5 MB per ABI in AX-04 |
| Updatable | JavaScript, small images, copy, behaviour data | expo-updates, checked at start and applied on the next launch | — |
| On demand | Roxi GLB LODs, KTX2 textures, environment textures, cinematic video, extra voice prompts | asset packs listed in the manifest, downloaded when the tier can use them | never bundled |

Manifest: `GET /api/mobile/v1/assets/manifest` returns packs with `id`,
`version`, `sha256`, `bytes`, `minTier` and a URL. The app downloads to its
cache directory, verifies SHA-256 before use, keeps an LRU index with a cap
(default 300 MB, lower on low-storage phones), prefetches only on Wi-Fi or
with the data-saver preference off, and never deletes the pack in use. Until a
pack is ready, the next level down renders, so nobody waits. Files are hosted
on the platform first; object storage and a CDN come when volume needs them,
with the owner's approval if they cost money.

## 8. Size and lock-in

- **Size.** Production ships as an Android App Bundle so each phone downloads
  only its ABI. Budgets: base growth ≤ 5 MB per ABI for AX-04 without 3D;
  the 3D engine ≤ 8 MB per ABI; 3D and video never bundled. Every build
  records its size in `docs/synapse/TEST_REPORTS.md`.
- **Lock-in.** Adapters behind the contracts in §3; assets in glTF, KTX2,
  WebP and JSON; masters in Blender (GPL tool, our output); no proprietary
  editor or runtime required; first-party Expo modules where they exist.

## 9. Platform notes

- **Android.** Two phone ABIs (arm64-v8a, armeabi-v7a) as in D-037; build
  memory limits as in D-038; Skia uses the GPU backend the device offers.
- **iOS.** The code is cross-platform, but no iOS build exists yet: EAS needs
  the owner's Apple developer account (a paid yearly membership) and a bundle
  identifier. Before iOS ships: microphone and network permissions text,
  Metal check of the 3D winner, and the same spike measures on one iPhone.

## 10. How AX-04 is built (stages)

| Stage | Delivers | Needs |
| --- | --- | --- |
| AX-04a | permanent tokens; the material engine (10 materials, 4 quality variants); the optical layer; the Aether look behind the Classic switch on home and one district | the owner's phone test of 0.4.0 before a build goes out |
| AX-04b | the transformation engine on SceneHost; shared elements; state preservation (scroll, filters, drafts, search) | 04a |
| AX-04c | spatial district navigation for the 15 districts (YavayaGo among them) with direct, search and deep-link paths | 04b |
| AX-04d | touch optics and haptics; optional gestures (pinch, zoom, rotate where suitable); opt-in device motion | 04a |
| AX-04e | the Roxi engine's channels and planner driving the existing 2.5D renderer; the Presence layer across screens | 04b |
| AX-05 | the 3D Roxi: the owner's reference views (AX-D021), the Blender master, the spike S9, then the 3D renderer | the owner's views |

Each stage ends with checks on the owner's Samsung (frame time, interruption,
Classic switch, no-3D path) and the owner's approval before the next.

## 11. Risks and open items

| Risk | Mitigation |
| --- | --- |
| A second worklet runtime (Filament) conflicts with Reanimated 4 | the spike tests coexistence first; expo-gl is the fallback |
| expo-gl on iOS rests on deprecated OpenGL ES | weighed in the spike rule; WebGPU (react-native-wgpu, three's WebGPU renderer) is the watched path |
| GPU canvas limits (Chapter 09: one Skia canvas per panel turned panels white, D-036) | one optical canvas per screen; lists and grids use `LiteOptical` |
| Effects cost battery on cheap phones | the governor, budgets per tier, no continuous animations, L2 by default on low tier |
| No iOS build yet | needs the owner's Apple account; tracked in the handoff |
| 3D Roxi not identity-true | IDENTITY_SPEC gates every asset; the 2.5D portrait (her real photo) stays until 3D passes |
