# The permanent visual language (AX-04)

How Yavaya looks and responds from AX-04 on: colour, type, depth, light,
materials, transformations, spatial navigation, continuity, touch and
accessibility. Written 27 November 2026 from the owner's AX-04 text. It
applies to the new look, which ships behind the **Classic** switch; the
current Synapse look and Classic itself do not change until the owner
approves the new one on the phone. Architecture:
[PRODUCTION_ARCHITECTURE.md](PRODUCTION_ARCHITECTURE.md). Roxi:
[ROXI_ENGINE.md](ROXI_ENGINE.md), [IDENTITY_SPEC.md](IDENTITY_SPEC.md).

Where this document and [VISUAL_CONSTITUTION.md](VISUAL_CONSTITUTION.md)
disagree on interface colour, this one rules (AX-D026); the constitution's
rules on Yavaya's identity, the logo and the wordmark stay as they are.

## 1. Principles

1. **Light is information.** An element is lit because it is selected,
   focused or active. Everything else stays quieter. Nothing glows for
   decoration.
2. **Black first.** Every screen starts from absolute black. Surfaces are
   deep obsidian; materials are transparent and optical; metal is rare.
3. **Calm when idle.** A screen nobody touches draws no new frames. No light
   loops, breathing gradients or drifting particles.
4. **The app works without the effects.** Every effect has a lighter version
   and an off position (degradation levels L4 to L0, architecture §6).
5. **Authentic Yavaya.** The eagle logo and the wordmark are used as images,
   never redrawn. Spanish comes first in every label.
6. **One ecosystem.** Every screen, Roxi and every later surface use the same
   tokens, materials, light and motion, so they read as parts of one
   instrument.

The idea behind it, called "Animus-like" in the brief: the interface is a
precise optical instrument that assembles what the member needs, where they
need it, and dissolves it afterwards. We take the principles and never the
product.

| Taken (principles) | Never copied |
| --- | --- |
| Places have fixed positions, so the member builds spatial memory | Assassin's Creed or Ubisoft names, marks, logos or sounds |
| Content reconstructs from light where the member touched | White void rooms, glitch effects, DNA helixes, hexagon grids |
| The world stays dark and quiet behind what is in focus | The cyan HUD, scan lines and their interface shapes |
| Thin, exact lines and measured spacing | Any layout, icon or typeface taken from the games |

Also never: generic cyberpunk, neon, sci-fi dashboards (gauges, fake
telemetry, tickers), repeated glowing rings, decorative particles, lens
flares, heavy bloom, continuous light animation, or violet light in the
interface.

## 2. Colour

Contrast is computed (WCAG 2.x relative luminance) on absolute black
`#000000` and, in the last column, on the lightest obsidian `#18181B`.

| Token | Hex | Role | On black | On obsidian 3 |
| --- | --- | --- | --- | --- |
| `void` | `#000000` | every screen's ground | — | — |
| `obsidian.1` | `#0A0A0B` | the environment plane | 1.06 | — |
| `obsidian.2` | `#111113` | structure: rails, lists | 1.11 | — |
| `obsidian.3` | `#18181B` | panels and sheets (at 78–92 % opacity) | 1.19 | — |
| `champagne.deep` | `#8A7448` | metal edges at rest; never text | 4.67 | 3.94 |
| `champagne.rest` | `#C9A96E` | primary actions, the focus ring at rest (today's `metal`) | 9.38 | 7.92 |
| `champagne.lit` | `#E2C27A` | the light of the selected or focused element; button fill with black text (12.23:1) | 12.23 | 10.32 |
| `champagne.hot` | `#F4E6C4` | the peak of a press, at most 160 ms; never a resting colour | 16.96 | 14.31 |
| `silver.text` | `#ECEFF6` | primary text (today's `text`) | 18.24 | 15.39 |
| `silver.secondary` | `#C9CED6` | secondary text | 13.28 | 11.21 |
| `titanium.light` | `#B4B9C1` | icons, inactive controls | 10.65 | 8.99 |
| `titanium.mid` | `#8B9099` | tertiary text, readable disabled labels | 6.55 | 5.52 |
| `titanium.dark` | `#5D626B` | structure lines only; never text | 3.42 | 2.89 |

Rules:

- **Champagne is restrained.** At most two champagne-metal elements on a
  screen: the primary action and the focused element.
- **District accents are contextual.** The fifteen accents in
  `design/tokens.ts` (each ≥ 7:1 on black, tested) appear only inside their
  district or on its card, as a thin line or a tint of at most 12 % of the
  area, one district at a time, never as a glow field.
- **States keep their meaning.** `positive` `#5FE0A5`, `caution` `#F2C266`
  and `critical` `#FF6B76` stay, always with an icon and words, never as a
  glow. Caution sits close to champagne, so it never appears without its
  icon.
- **Retired in the new look:** `signal` `#9CC9FF` (links become silver,
  underlined, champagne when focused) and `roxi` `#B9A3FF` (her light becomes
  champagne, below). Both stay in the Synapse look until it is replaced.
- **The logo keeps its own gold.** `#F0920C`, `#973D05` and `#FAE172` live
  inside the eagle and the wordmark images and on brand moments (start
  screen, About); interface materials use champagne. This reconciles the
  owner's answer 1A (logo gold) with the AX-04 text ("restrained champagne
  gold"); the owner can still choose logo gold everywhere (AX-D026).
- **Roxi's glow is champagne gold**: `champagne.lit` core, `champagne.rest`
  edge (the owner: "Roxi should have a glow in gold instead of purple"). Her
  violet clothing is part of who she is ([IDENTITY_SPEC.md](IDENTITY_SPEC.md)),
  never an interface colour.

## 3. Type

- **Geist** for every word in the interface, **Geist Mono** for numbers and
  data, with the existing scale in `design/tokens.ts` (display 34, title 24,
  headline 18, body 16, label 14, caption 13, micro 12; never below 12).
- **Cinzel Bold** (SIL OFL 1.1), uppercase with open letter spacing, only for
  typed display words of 24 px and above, such as a district's name on its
  arrival screen, matching the gold Roman capitals of Yavaya's typography
  (AX-D018). Never for body, labels or buttons.
- **The wordmark is always the image.**
- Text scales with the phone's setting up to the existing limits (display
  1.4×, body 2×, controls 1.6×); layouts reflow rather than clip.

## 4. Depth

The existing depth planes stay: environment, structure, panel, focus,
overlay, system. Each lower plane is darker, lit less and moves less.

- Only the **focus** plane is lit. When something is focused, the
  environment and structure planes dim by about 35 % (darker, never
  blurred), and return in 240 ms when focus ends.
- **Optical separation**: a focused or dragged element rises one plane, with
  an edge light and a soft contact shadow, never a coloured halo.

## 5. The optical system

One key light per screen (from the top left, or from Roxi when she presents
something) and a rim light on the focused element. Light follows state:

| State | Light |
| --- | --- |
| Rest | hairline edge in `champagne.deep` at 35 % opacity, no glow |
| Touch down | the edge brightens to `champagne.rest` within one frame; a small specular highlight at the touch point (L4–L3) |
| Pressed peak | `champagne.hot` for at most 160 ms, then settles |
| Focused or selected | edge in `champagne.lit`, a faint inner sheen; lower planes dim |
| Working | one slow sweep across the element, once; past 2 s a still progress indicator takes over |
| Success | one brief brightening, then still |
| Error | `critical` text and icon; no red glow |
| Disabled | `titanium.mid` label, no edge light |

Reflections are controlled: on L4 the focused element casts a faint
reflection (at most 10 % opacity) on the glass beneath it, and nothing else
reflects. Highlights, reflections and refraction are physically inspired on
L4 and approximated with gradients below it.

Limits: bloom radius ≤ 12 dp and strength ≤ 0.35; no lens flares; every
light change finishes within 1.4 s and then holds; text never sits on a
moving or refracting area without a scrim, and its contrast is measured
against the brightest pixel behind it (≥ 4.5:1 body, ≥ 3:1 at 24 px and
above). With reduced motion, light changes become crossfades of at most
120 ms.

## 6. The material engine

One data definition per material (`MaterialSpec`, pure data like
`design/tokens.ts`) with these parameters: tint, opacity, roughness,
refraction (displacement 0–0.2), edge light, specular, grain and
micro-structure density. Every material reacts to the same inputs: state
(rest, touch, focused, selected, disabled), depth plane, key-light direction
and quality level. Rendering: `SkiaOptical` draws L4 and L3 with three SkSL
shader families (glass, metal, matter) checked off-phone by
`mobile/tools/synapse/check-shaders.mjs`; `LiteOptical` draws L2 with plain
views; L1 uses flat obsidian. One optical canvas per screen (D-036).

| Material | Used for | L4 Full | L3 Balanced | L2 Lite |
| --- | --- | --- | --- | --- |
| **Obsidian** | the base of every surface | deep black, faint grain, slow vertical gradient | same | same (a static grain image) |
| **Crystal** | district emblems, the Guardian, key objects | faceted, refracts what is behind | gradient facets with edge light | still image |
| **Liquid glass** | sheets and panels that change shape | refraction with edge displacement, highlight at the touch point | gradient and edge highlight | obsidian at 86 % with a hairline |
| **Frosted transparency** | an overlay that needs readable text | blur of what is behind, radius ≤ 20 | blur ≤ 12 | no blur, obsidian at 92 % |
| **Refractive** | the search lens, a magnified detail | displacement of the background | edge highlight only | edge highlight only |
| **Optical titanium** | frames, toggles, sliders | brushed anisotropic highlight | two-stop gradient | flat `titanium.mid` line |
| **Champagne-gold metal** | the primary action, brand edges | anisotropic metal lit by the key light | gradient metal | flat `champagne.rest` |
| **Spectral matter** | Roxi's light body, reconstructions | thin-film colour held to a champagne and silver band, no rainbow | gradient | still gradient |
| **Adaptive opacity** | any material over changing content | opacity rises until text keeps ≥ 4.5:1 (samples what is behind) | same | a fixed safe opacity |
| **Microscopic luminous structures** | detail that rewards focus | a 0.5 dp lattice at ≤ 8 % opacity, shown only when focused or touched, never animated on its own | same, coarser | none |

**Blur policy.** Blur is the most expensive and most abused effect: at most
one blurred region per screen; never under a scrolling list; never full
screen; never on the low tier. Quieting the background is done by dimming,
not blurring.

## 7. The transformation engine

| Transformation | What happens | Where |
| --- | --- | --- |
| Expand / compress | a card grows into its screen from its measured position, and back | listings, district cards |
| Fold / unfold | a panel hinges open along an edge | filters, Roxi's drafts, details |
| Optical separation | an element rises one depth plane | focus, long press, drag |
| Material transformation | a surface changes material as its role changes, such as obsidian to liquid glass when it becomes editable | inputs, sheets |
| Shape interpolation | one shape becomes another, such as a button into a sheet (radius 10 to 26) | primary actions, the Roxi dock |
| Shared element | the same element continues between screens | photos, emblems, Roxi |
| Contextual reconstruction | the destination builds from light outward from the touched point (today's Reconstruct technique) | entering a district, summoning Roxi |

Rules:

- **Navigation is immediate.** The destination mounts and accepts touches at
  once; the transformation is drawn over it.
- **Spatial continuity.** Selected content, its destination, Roxi and the
  surrounding interface keep their visible relationship: what was touched
  becomes the destination's anchor, and Roxi stays beside it. This holds
  between districts, listings, profiles, conversations, maps and account
  screens.
- **One progress value drives each transformation (0 to 1)**, so it can be
  interrupted (a touch stops it where it is), reversed (back plays it home
  from where it is) and scrubbed (the edge swipe follows the finger).
- Durations come from the tokens: quick 160, base 240, emphasis 360,
  district 520 ms. Nothing is longer than 520 ms except the one-time
  awakening. With reduced motion every transformation is a 120 ms fade.
- The budget stays: at most 100 ms from tap to first frame and at most two
  dropped frames, or the governor steps down.
- It grows from SceneHost's eight kinds: `spatial` to expand and
  reconstruction, `return` to compress, `swipe` to the scrubbed gesture,
  `focus` to optical separation, `summon` to Roxi's arrival, `dive` to
  district reconstruction, `lateral` between districts, `fade` as the
  fallback.

## 8. Spatial district navigation

The fifteen districts, YavayaGo among them (district `yavayago`), become
places on a dark plane, each at a fixed position so the member learns where
things are. Each has its crystal emblem and its accent.

- **Moving:** drag to pan, pinch to zoom, tap a district to enter it by
  contextual reconstruction. The plane remembers where the member left it.
- **Proposed arrangement (the owner decides before it is built):** four
  neighbourhoods, the first holding the four districts the registry already
  marks essential. *Lo esencial*: Mercadito, YavayaGo, Servicios, Trabajo.
  *Casa y vida diaria*: Hogar, Movilidad, Salud y Bienestar, Negocios.
  *Comunidad*: Comunidad, Barrio, Diáspora, Aprender. *Cuidado y tierra*:
  Santuario, Animales, Campo.
- **Every other way in stays:** the home screen's direct district list,
  search, Android back and the edge swipe, and deep links from `yavaya.lat`,
  which open the destination directly with no animation.
- **No forced animation:** the plane is never a required step; a tap
  skips any transition; with reduced motion or a screen reader the plane is
  a list in the same order.

## 9. Continuity

Each screen keeps, per route: scroll position, filters, search query,
selected tab, map position and unfinished drafts. The navigation reducer
stays the source of truth; screens save and restore through one route
memory, so a screen can be unmounted to save memory and still come back as
it was. Drafts (forms and Roxi's drafts) persist on the phone for seven
days, never with secrets or tokens, and are cleared on sign-out.

## 10. Touch and haptics

- **Touch-responsive optics:** tap, long press, scroll, drag and select work
  as on any phone. On touch down the touched element's edge brightens, it
  presses in slightly (at most 2 % smaller or 1 dp deeper) and, on L4 and
  L3, a specular highlight sits under the finger; release settles in
  160 ms. The response starts within one frame. A phone cannot sense a finger before it
  touches, so nothing claims to react to an approaching finger.
- **Haptics** use the existing patterns (`haptics/patterns.ts`: tap, open,
  districtOpen, back, reconstruct, roxi, success, error, longPress and
  others), timed to the visual event and cancelled when its animation is
  interrupted (`playHaptic` returns a cancel). One haptic per action of the
  member; none for events the member did not cause, except the result of
  their own action. The settings switch stays.
- Targets stay at least 48 dp; primary actions sit in the lower 40 % of the
  screen.

## 11. Optional gestures and device motion

- **Pinch and zoom:** the district plane, photos and the map.
- **Rotate:** only for objects that are really 3D (Roxi in 3D, the Guardian,
  crystal emblems), and only on L4.
- **Long press:** a preview of a card with optical separation; release
  closes it.
- Every gesture has a visible button that does the same thing, and no
  ordinary action needs one.
- **No accidental activation, no conflict with the phone's own gestures:**
  custom gestures never start in the system gesture zones (the screen edges
  Android uses for back, the iPhone's home bar); the only edge gesture is
  the existing swipe back, which means the same as the system's; long press
  needs 500 ms; rotation starts only after a deliberate two-finger turn of
  more than 15°; phone motion never triggers an action.
- **Device motion only where it shows depth** (AX-D034): today's parallax
  reads the phone's rotation through Reanimated (`render/useTilt.ts`), behind
  the `parallax` flag and off under reduced motion; it is used only where the
  phone reports the sensor as available. In the new look it is
  used on the district plane and around Roxi in 3D, and nowhere else (not on
  reading screens, lists or forms). It is off under reduced motion and
  battery saver, and the person can switch it off.

## 12. Accessibility

Targets: WCAG 2.2 AA. Text contrast as in §2 and §5; control boundaries at
least 3:1; a visible focus ring (2 dp, `champagne.lit`); Spanish-first labels
for every control and image; text scaling as in §3; reduced motion turns
movement into fades; information never by colour alone (accent plus name,
state colour plus icon and words); no flashing more than three times a
second; every gesture has a button; sound and haptics optional.

## 13. How it is checked

- A colour test like `design.test.ts` for the new tokens (the contrast
  values in §2 become assertions).
- Shader checks off-phone for every material shader.
- Frame time and transition latency on the owner's Samsung and a 120
  USD-class Android at each level.
- Screenshots of every screen at L4, L3, L2 and L1, reviewed against §1
  (no neon, no rings, no particles, nothing lit without a reason).
- The owner's approval on the phone before the new look replaces anything.
