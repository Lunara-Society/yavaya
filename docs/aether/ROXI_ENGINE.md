# Roxi's character engine (AX-04)

How Roxi lives in the app: a persistent digital human whose body is driven
by independent channels running at the same time, not a played video.
Written 27 November 2026 from the owner's AX-04 text. Layer 3 of
[PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md); who she is,
measurably: [IDENTITY_SPEC.md](IDENTITY_SPEC.md); her look:
[VISUAL_LANGUAGE.md](VISUAL_LANGUAGE.md).

## 1. What exists today

| Piece | Code | What it does |
| --- | --- | --- |
| Voice | `roxi/RoxiVoiceProvider.tsx` | phases `idle`, `starting`, `live`; state resting, listening, thinking, speaking (0 to 3); a live voice level (0 to 1) on the UI thread |
| Body, 2.5D | `render/RoxiHologram.tsx` | her real picture cut from the dark by its depth map, on a projector disc; driven by `level`, `state`, `form` (built from light, 0 to 1) and `tilt` |
| Presence | `synapse/PresenceDock.tsx` | her face where her web button is, lit only while she actually listens or speaks |
| Persistence | `roxi/RoxiIsland.tsx` (mounted in `AppRoot.tsx`) | while she talks and the member is on another screen, she stays in an island: face lit by her voice, a tap back to her, an end button; never covers the dock |
| Actions | `roxi/tools.ts`, `roxi/drafts.ts` | client tools that open pages and prepare drafts; the member confirms |

The engine keeps all of this and adds what is missing: separate channels,
a planner, arbitration and renderers that can be swapped.

## 2. Rules that do not change

- She prepares, the member confirms. She never publishes, pays or sends.
- She is an assistant, not a person; she does not claim to feel.
- She never covers what the member is using: the focused field, the
  keyboard, the primary action or text being read.
- She does not move constantly: idle means still, apart from breathing and
  blinking.
- Her glow is champagne gold; never violet light.
- Nothing she shows is invented: facts come from the platform's data and
  tools, never from the animation layer.

## 3. The twelve channels

Each channel has its own controller and its own value, and changing one
never changes another. So she can speak while walking, listen while
transforming, gesture while changing scale and keep the conversation going
while the member navigates (the owner's examples, tested as T-RX-02). Per-frame channels run as UI-thread worklets on
Reanimated shared values; the planner sets their goals.

| # | Channel | Controls | Driven by | Idle default |
| --- | --- | --- | --- | --- |
| 1 | **Position** | where she is: dock, beside content, centre stage | planner, layout anchors, springs | docked |
| 2 | **Scale** | portrait, half body, full body | planner and the member's size preference | dock size |
| 3 | **Orientation** | body and head turn toward the member or a target | attention and position | facing the member |
| 4 | **Material** | light body (spectral matter) or solid; how built she is (`form`) | state and quality level | solid, softly lit |
| 5 | **Transparency** | opacity, so content stays readable when she is near it | content rules | opaque when docked |
| 6 | **Locomotion** | getting from one position to another: a glide in 2.5D; short steps and turns in 3D | planner; at most one move per 10 s unless asked | none |
| 7 | **Attention** | where her eyes and head look: the member, the element she talks about, where the member is about to tap | planner and layout; saccades and blinks are procedural | the member |
| 8 | **Facial expression** | the face: the 52 ARKit shapes in 3D | speech, emotion, idle micro-expressions | calm |
| 9 | **Emotional expression** | calm, warm, attentive, concerned, pleased, with an intensity that decays back to calm | planner, from the conversation's tone | calm, low |
| 10 | **Speech** | mouth and jaw from her voice (visemes in 3D, level in 2.5D); speaking state | voice system | closed |
| 11 | **Gestures** | point, present, open hand, count | a clip library aimed by inverse kinematics | none |
| 12 | **Environmental interaction** | pointing at or standing by an element, lighting what she presents, her reflection on glass | planner and the layout rectangles of layer 1 | none |

## 4. How the channels are mixed

```
intents (layer 4) ─┐
voice state/level ─┤       ┌──────────────┐   goals    ┌─────────────────┐
layout anchors ────┼──────►│   behaviour   │──────────►│ 12 channel      │
member activity ───┤       │   planner     │           │ controllers     │
preferences ───────┤       │ (events, JS)  │           │ (per frame, UI) │
quality level ─────┘       └──────────────┘           └───────┬─────────┘
                                                      arbitration (masks,
                                                      priorities, fades)
                                                              ▼
                                                     ChannelFrame ─► renderer
```

- **Planner.** Event-driven on the JavaScript thread, at most ten decisions a
  second. It turns intents into goals with a priority and a duration, and it
  never blocks the interface.
- **Arbitration by priority.** From strongest to weakest: the member's needs
  (typing, scrolling, reduced motion: she keeps out of the way); the member
  moving her by hand; speech; an explicit intent (present, point); emotion;
  idle.
- **Arbitration by body region.** Speech owns the mouth and jaw; emotion owns
  brows and eyes; blinking is procedural; attention owns head and eyes;
  gestures own the arms; locomotion owns the legs and root; position and
  scale own the whole. A stronger layer overrides only the regions it
  claims, and the rest keep blending. Handovers crossfade in 120 to 300 ms.
- **Interruption.** Every goal can be replaced at any frame; every clip can
  be left at any frame and blends back to a valid pose. No sequence plays to
  the end against the member.

## 5. Renderers

One `RoxiRenderer` interface (`load(lod)`, `apply(frame)`, `dispose()`), four
implementations, chosen by the quality governor (architecture §6):

| Channel | 3D (AX-05, after the spike) | 2.5D hologram (exists) | Still portrait | Voice only |
| --- | --- | --- | --- | --- |
| Position, scale | ✓ | ✓ | ✓ | — |
| Orientation | ✓ | slight, through depth parallax | — | — |
| Material, transparency | ✓ | ✓ (`form`, opacity) | opacity | — |
| Locomotion | steps and turns | glide | glide | — |
| Attention | eyes and head | — | — | — |
| Facial expression | 52 shapes | — | — | — |
| Emotional expression | face, posture, light | warmth of her light | warmth of her light | wording only |
| Speech | visemes | voice level and state light | level ring | captions |
| Gestures | clips with inverse kinematics | a light accent toward the target | — | — |
| Environmental interaction | pointing, standing by, reflection | lighting the presented element | lighting the presented element | — |

What a renderer cannot show, it skips: the other channels keep working, and
the planner never waits for a channel the renderer lacks. Until the 3D Roxi
passes the identity gate, the 2.5D hologram (her real picture) is her body.

## 6. Presence across navigation

- One Presence host is mounted above the navigator in `AppRoot.tsx`, as the
  island is today, so a route change never unmounts her and the
  conversation continues.
- Screens report anchors (`usePresenceAnchor(id)`: a measured rectangle and
  a role) so she can stand beside what she is talking about. Without an
  anchor she returns to the dock.
- She takes touches only on her own body; everything else passes through to
  the screen beneath.
- Between the dock, the island and the full Roxi screen she moves as a shared
  element (VISUAL_LANGUAGE §7); a deep link or Android back never waits for
  her.

## 7. The intelligence interface (layer 4 to layer 3)

```ts
type RoxiIntent =
  | { kind: 'present'; target: AnchorId }      // show the member an element
  | { kind: 'point_at'; target: AnchorId }
  | { kind: 'attend'; target: AnchorId | 'member' }
  | { kind: 'express'; emotion: Emotion; intensity: number }
  | { kind: 'move_to'; anchor: AnchorId | 'dock' | 'centre' }
  | { kind: 'prepare'; draftId: string }       // a draft waits for the member
  | { kind: 'idle' };
```

Listening, thinking and speaking come from the voice system, not from
intents. Intents carry references to elements and data IDs, never values.
The client tools in `roxi/tools.ts` emit an intent beside the action they
already perform. No new agent tools are added now (AX-D024); the ElevenLabs
agent is unchanged.

## 8. Animation sources

Procedural (breathing, blinking, saccades, small sway, head follow);
parametric clips (gestures, steps), each at most 2 s and left at any frame;
inverse kinematics for pointing and looking at a rectangle; visemes for
speech; emotion presets as blendshape weights; springs for position and
scale. Clip motion may follow the movement references (AX-D016), never their
faces, hair or clothes.

## 9. Voice coupling

- Voice state drives the channels: listening (attention on the member, soft
  stillness), thinking (a slow look aside, then back), speaking (speech
  channel, light following her level).
- The mouth moves within 100 ms of her audio.
- The light is honest (the PresenceDock rule): it moves only while she
  really listens or speaks; if the voice fails she switches to text with
  captions and never pretends to talk.

## 10. Budgets

| Renderer | Per frame on screen | Notes |
| --- | --- | --- |
| 3D | ≤ 4 ms render with LOD1 on the high tier | spike S9 decides the engine (ROXI_PIPELINE §6) |
| 2.5D | ≤ 2 ms | existing shader |
| Planner | ≤ 1 ms per decision | event-driven |

Idle she draws at 30 frames a second at most, and nothing while she is
minimised, hidden or the app is in the background.

## 11. Tests

| Test | Pass |
| --- | --- |
| Channel independence | setting any one channel leaves the other eleven unchanged (unit tests on the controllers) |
| Concurrency (T-RX-02) | speaking while moving, listening while her material changes, gesturing while her scale changes, and talking across five route changes, each at full frame rate on the Samsung |
| Arbitration | a stronger layer overrides only its regions (unit tests on the masks) |
| Interruption | an intent replaced at a random frame returns a valid pose within 300 ms |
| Persistence | twenty navigations in a row: one Presence instance, conversation unbroken |
| Fallback | a renderer that throws or draws nothing for 1.5 s is replaced by the next one down |
| Speech latency | mouth within 100 ms of audio, measured on the Samsung |
| Out of the way | she never overlaps the focused field, keyboard, primary action or text being read (layout tests) |
| Identity | every renderer's output passes [IDENTITY_SPEC.md](IDENTITY_SPEC.md) |
| Accessibility | reduced motion: no locomotion, fades only; screen reader: her words as captions |
