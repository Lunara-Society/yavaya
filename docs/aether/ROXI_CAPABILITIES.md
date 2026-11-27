# Roxi's capabilities

What Roxi can do today, what each Anima system must add, and the reusable
behaviours (primitives) every chapter builds on. States as in
[MASTER_ARCHITECTURE.md](MASTER_ARCHITECTURE.md) §2. Updated 27 Nov 2026 (AX-01).

## 1. Who she is (identity, fixed)

- **Source of truth:** `mobile/art/roxi/roxi-source.png` (the owner's
  image, AI-generated, Yavaya's own). The owner's upload R09 is the same
  picture, pixel for pixel.
- **Recognisable features to keep in every medium and variant:** long
  straight black hair with a centre parting; her face as in the source;
  slim build; purple jacket with lilac piping and a stand collar over a black
  top; dark purple trousers; black ankle boots; a small pendant. Whether the
  jacket becomes black and gold is the owner's open decision
  ([ROXI_PIPELINE.md](ROXI_PIPELINE.md) §9); until then the source outfit
  rules.
- **Not her:** the women in references R03, R08, R10 and R26, and the faces
  in R27–R71. The second send (R27–R39) shows a Roxi-like woman in a purple
  jacket; measured against her source, the closest face scores 0.59 and the
  close-ups 0.21–0.37, where her own images score 0.95–0.99
  ([REFERENCE_MATRIX.md](REFERENCE_MATRIX.md) §7). Their movements, gestures
  and expressions are references; their faces, hair and clothes are not
  (they drift to black cargo trousers, combat boots and a belt). The third
  send (R40–R56) adds tactical items (thigh pouches or a holster, harness
  straps, fingerless gloves, tall combat boots) and wavy hair with violet
  streaks: none of it is hers. The fourth send (R57–R71) is one consistent
  woman with another face (0.18–0.38 against her source, where her own
  images shrunk to the same size score 0.88–0.90), in a brown leather jacket,
  with wavy brown hair.
- **Her glow is gold** (the owner, 27 Nov: "Roxi should have a glow in gold
  instead of purple"): rim light, particles and material states use the gold
  tokens, never violet. In the interface that gold is champagne (AX-D026);
  her engine and identity are specified in [ROXI_ENGINE.md](ROXI_ENGINE.md)
  and [IDENTITY_SPEC.md](IDENTITY_SPEC.md).
- **What she is not:** she is an assistant, not a person. She does not claim
  to be conscious or to feel. She never publishes, pays or sends anything for
  a member: she prepares, the member confirms.

## 2. State per system

| System | Capability | State | Evidence or what is missing |
| --- | --- | --- | --- |
| SENTIENCE | Understands requests, chooses tools, answers in the member's language | REAL (website) | ElevenLabs agent with Yavaya's tools (`platform/src/ui/roxi/tools.ts`) |
| SENTIENCE | Same, in the app | INCOMPLETE | `mobile/src/roxi/tools.ts` (a copy kept in step); not run on a phone |
| SENTIENCE | Memory (goals, tasks, reminders), plans, member's MCP servers | REAL (website) | `/status` |
| SENTIENCE | Emotional expression (face, posture) | NOT IMPLEMENTED | needs the 3D face (CORPUS, facial shapes) |
| SENTIENCE | Content understanding from typed descriptors | NOT IMPLEMENTED | today she sees search results as `{title, detail, url}` cards; the descriptor is designed in MASTER_ARCHITECTURE §6 |
| VOX | Voice conversation | REAL (website); INCOMPLETE (app, WebRTC) | Chapter 09 §2 |
| VOX | Listening state, speaking state | INCOMPLETE (app) | Presence states: listening, speaking, working, waiting, problem |
| VOX | Lip sync | NOT IMPLEMENTED | the hologram follows the voice level only; which timing data the React Native SDK exposes is to be checked in the VOX chapter |
| ANIMA | 2.5D hologram from her picture and depth | INCOMPLETE | `render/RoxiHologram.tsx`; phone frame rate not measured |
| ANIMA | 3D digital human | NOT IMPLEMENTED | pipeline in ROXI_PIPELINE.md |
| CORPUS | Skeleton, poses, locomotion, hands | NOT IMPLEMENTED | needs the rigged master |
| VITALIS | Breathing, blinking, micro-motion | NOT IMPLEMENTED | can start on the 2.5D portrait (warp), full on 3D |
| IMPOSSIBILIS | Forming from light, dissolving (2D) | INCOMPLETE | reconstruction engine, seven techniques |
| IMPOSSIBILIS | Material states: crystal, gold light, particles on her body | NOT IMPLEMENTED | shader parameters on the 3D mesh |
| OMNIPRAESENTIA | Docked island and Presence pill, full screen | INCOMPLETE | `roxi/RoxiIsland.tsx` |
| OMNIPRAESENTIA | Placement and scale system (beside content, in a corner, life size) | NOT IMPLEMENTED | — |
| SYMBIOSIS | Opens pages, shows result cards, prepares drafts | REAL (website); INCOMPLETE (app) | tools |
| SYMBIOSIS | Points at, lifts and presents real items on screen | NOT IMPLEMENTED | needs layout geometry and primitives (§3) |
| ABSOLUTA | One orchestrator over voice, body, face, placement and interface | NOT IMPLEMENTED | — |

## 3. Primitives (reusable behaviours)

Every behaviour in the references reduces to a small set of primitives. Each
takes targets from the screen's layout and facts from a content descriptor,
never from a specific product. A new kind of listing needs no new animation.

| Primitive | What it does | Inputs | 2.5D tier (today's portrait) | 3D tier | Seen in |
| --- | --- | --- | --- | --- | --- |
| `idle` | breathes, blinks, small weight shifts | none | warp loop | VITALIS layer | all |
| `attend` | turns to the member, eye contact | camera | glow and tilt | head, eye look-at | R03 f8 |
| `look_at` | looks at a target | screen point or element | — | head, eye IK | R03 |
| `point_at` | points at an element | element bounds | pointing pose, generic | arm IK to target | R08 f4 |
| `reach_and_hold` | reaches for, grasps and lifts an object | object anchor | — | arm IK, hand pose | R03 |
| `present` | holds content up and towards the member | descriptor, media | card beside her | hand and card anchor | R03, film |
| `fan_out` | lays several items in an arc from her hand | descriptors (n) | arc of cards from the portrait | hand anchor, arc layout | film, R01, R08 f2 |
| `compare` | two or three items side by side, says what differs from their fields | descriptors | split cards | gestures between | — |
| `summarise` | reads the key facts aloud | descriptor fields | voice | voice and face | — |
| `guide_to_action` | shows the real button for the next step | descriptor `actions` | highlight | point_at that button | R08 f4 |
| `dock` | becomes the small help card | — | island | scaled 3D in a card | R08 f5 |
| `step_aside` | moves out of the way of what she opened | layout | slide | walk or scale away | tools today |
| `materialise` / `dematerialise` | forms from light, dissolves | — | reconstruction techniques | IMPOSSIBILIS shaders | R02, R06 |
| `react` | smiles, nods, concern | sentiment | glow colour | facial shapes | R03 f8 |
| `listen`, `think`, `speak`, `problem` | visible state | voice state | Presence glow | face, posture, lips | Presence |

Movement references for the primitives (second to fourth sends; motion only,
never the face):

| Primitive | Reference |
| --- | --- |
| `materialise` | R28: particles, silhouette, hologram, solid; the camera moves in; a smile. R52 from strands of light, R53 out of a line of light, R51 climbing out of the screen, R68 from gold particles beside the mark |
| `reach_and_hold`, `present`, `guide_to_action`, `dematerialise` | R27: the photo pulled from its card, held on her palm, the facts open with Contactar, the photo dissolves back |
| walk in and face (new) | R31 |
| exit (new) | R29, R32 walk away; R46 walk away in glass; R47 a line of light; R48 fade |
| welcome (new) | R30 |
| `speak` while explaining | R33, R34 |
| `listen` | R34 |
| `look_at`, `point_at` | R35; R54 and R56 at real tiles |
| `think` | R36; R40 close-up |
| `react`: joy, concern, surprise | R37, R38, R39 |
| `present` with an open hand | R45, R48, R51, R53, R56 |
| material states during a gesture (crystal, liquid glass) | R41, R45, R47 |
| `dematerialise` and re-form in motion (shards) | R43 |
| celebrate (new; only after a real success) | R42 |
| working on several things (echoes) | R44 |
| interface scale and touch (new): walks on the app, a tile lights under her hand, taps with the member | R49, R50, R54, R55, R56 |
| `idle`: calm breathing, eyes closed | R65 |
| into a district with the member (new) | R59, R60, R61, R63 |
| walking a light map (new) | R57, R64, R66 |
| `fan_out`: layered glass cards | R58 |
| `reach_and_hold`, `present`: an item turning in her hand | R62 |
| guiding a form step by step (new; the member publishes) | R67 |
| `listen`, `think`, `speak` as visible stages | R70 |
| `dock`, summoned by a central button | R26; R52 sitting on the district bar |

Planner rules (shape-based, never category-based):

- one item with media → `present`; several → `fan_out`; two or three with
  the same fields → `compare`;
- no media → the title card with the district's symbol; no price → no price
  mentioned; missing place → place not mentioned;
- an action is offered only if it is in the descriptor's `actions`;
- the item's page always opens on request, with or without Roxi.

## 4. Behaviour rules (every chapter)

- **Dismissible, interruptible, scalable, unobtrusive:** a tap, a swipe or
  speaking stops her (target: motion stops within 200 ms); her size and place
  follow the member's choice; she never covers the primary action.
- **Never invents:** prices, specifications, availability, places, ratings,
  seller credentials and results come only from descriptor fields or tool
  answers. A transcript check enforces it (PRODUCTION_TESTS T-FACTS-01).
- **The member decides:** drafts, never sends; opens the real form; actions
  outside Yavaya need the member's tap (`confirm`).
- **Privacy:** Espacio Violeta never appears in her context, previews or
  screenshots; she works on the member's own visibility.
- **The app works without her:** every flow has a path that never involves
  Roxi, and with Roxi switched off nothing is missing.
