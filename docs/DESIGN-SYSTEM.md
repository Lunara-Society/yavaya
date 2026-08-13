# Design system

One foundation, eight worlds.

Yavaya must feel like one product and eight distinct places at the same time.
The foundation — type, spacing, motion, focus, navigation, identity components,
Trust Shield — is shared and does not vary. What varies is a district's colour
world, its layout archetype, and its information hierarchy.

## Shared foundation

**Type.** One family, wide weight range, with system fallbacks that actually
exist on low-end Android — the primary device across Central America. Body text
is never below 16px: smaller triggers iOS zoom on focus and is unreadable on
inexpensive screens in daylight.

**Colour tokens.** Components reference semantic tokens (`--surface-raised`,
`--text-secondary`, `--accent`), never raw colours. Light is defined on `:root`;
dark redefines only the tokens, under both `prefers-color-scheme` and an
explicit `[data-theme]`, so the toggle wins in both directions.

**Colour never carries meaning alone.** Every status is also a word or a mark.
A red dot is invisible to many people and meaningless in bright sunlight. The
`StateBadge` and Trust Shield check rows are built this way deliberately.

**Focus is always visible.** A 2px accent outline with offset on every
interactive element. Removing focus styling is never acceptable — keyboard and
switch users depend on it.

**Motion is short and removable.** 120/200/320ms with a soft ease.
`prefers-reduced-motion` collapses everything to near-zero. Motion is
decoration; content is not.

**Touch targets are at least 44px** (`--spacing-touch`), and navigation sits at
the bottom within thumb reach.

## District worlds

Each district sets its own accent family and, more importantly, its own layout
archetype. The registry records both, and a test asserts that all eight
archetypes are distinct — recolouring one card grid eight times is explicitly
not the plan.

| District | Accent | Archetype | The feeling |
| --- | --- | --- | --- |
| Services | Teal | `request-board` | Someone needs help; someone can help |
| Mercadito | Emerald | `discovery-density` | Commerce, browsing, density |
| YavayaGo | Orange | `motion-map` | Movement, maps, speed |
| Works | Deep blue | `professional-directory` | Precise, professional, credible |
| Community | Purple | `calm-column` | Calm, human, unhurried |
| Impact | Ruby | `campaign-progress` | Urgency held with hope |
| Animals | Forest | `organic-profile` | Organic, compassionate |
| Tavern | Gold | `playful-tiles` | Reward, discovery, play |

The archetype is the substance. Mercadito is dense because browsing many items
quickly is the task. Community is a single calm column because someone asking
for help should not be presented as inventory. Impact leads with progress
because a campaign's state is the point. YavayaGo is map-first because location
is the question being answered.

**Community and Impact carry an additional rule:** they must never present a
vulnerable person's situation as entertainment. No engagement ornamentation, no
urgency animations, no "trending" framing on human need.

## Mobile first, genuinely

Mobile is not a breakpoint here, it is the design target. That means: thumb
reach, one-handed operation, fast search, fast posting, low bandwidth,
optimised images, tolerance for intermittent connectivity, and honest loading,
empty and error states rather than a spinner that never resolves.

Zoom is never disabled. `maximumScale` is 5, not 1.

## What to avoid

Generic dashboard grids. Endless identical cards. Gradient stacks. Ornamental
"luxury" that communicates nothing. Animation for its own sake. Tiny text.
Visual clutter. The interface should feel alive and never chaotic — and it
should be legible to someone using Yavaya for the first time, on a cheap phone,
in a hurry.

## Honesty in the interface

A district that is not built is not a link — it renders with its real status
and does not invite a tap into an empty room.

Demo content is visibly marked `DEMO` and explained. It never counts in a
statistic and never generates a notification.

The live activity feed shows only real events. When there is nothing real to
show, it shows nothing, or an honest empty state. It is never padded.
