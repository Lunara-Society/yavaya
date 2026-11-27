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
- **Not her:** the women in references R03, R08 and R10. Their staging,
  gestures and materials are references; their faces and hair are not.
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
