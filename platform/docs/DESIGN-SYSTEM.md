# Design system

One foundation, seven worlds.

Yavaya must feel like one product and seven distinct places at the same time.
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

**The palette.** Dark is layered, not flat: a midnight-teal page (`--bg`,
#071B22), forest-teal and evergreen bands (`--forest`, `--evergreen`), a warm
obsidian closing band (`--obsidian`), antique gold for actions (`--accent`,
#C99B35) with champagne highlights (#F3D77B), and ivory text (`--text`,
#F4EBD8). This is the owner's October 2026 direction and replaces the Master
Bible's navy. Text set over a photograph is the one place fixed values are
right: it stays light on its scrim in both themes, so it must not follow tokens
that flip.

**Colour worlds** (`src/app/worlds.css`, October 2026). The shared night is
lit from three sides: lamp gold, water teal, dusk violet. Text is warm
(ivory and parchment), not grey. Each district page puts its whole shell,
header and footer included, into its own world, in both themes (table
below). Since 24 October 2026 six of them are **their colour and black**
(owner's direction): by night a black street lit by the barrio's colour,
buttons struck in that colour with black ink; by day white paper, black ink,
and black buttons that write in the colour. The colour is painted, not only
lit, because a black page with a few words lit in green reads as one more
dark theme: the ribbon under the header is the barrio's fascia board, and
every door that asks you to do something (a members-only gate, an empty list
with its first step) is painted the way its buttons are, so the colour with
black ink by night and black lettered in the colour by day. A door with
nothing to do, such as an operator's empty queue, stays plain (worlds.css,
"Painted, not only lit"). **Santuario is the exception** —
a white chapel by candlelight, ivory and soft gold, in both themes; its pages
always render in the light theme (`isCandlelit` in `config/preferences.ts`),
so every light-theme rule applies there. Gold otherwise stays only where it
means Yavaya itself or money: the wordmark and seal, the tokens coin, and
paid placements. `tests/unit/colour-worlds.test.ts` checks every world's
text and buttons against WCAG AA, so a world cannot quietly become
unreadable.

**Colour never carries meaning alone.** Every status is also a word or a mark.
A red dot is invisible to many people and meaningless in bright sunlight. The
`CapabilityBadge` and Trust Shield check rows are built this way deliberately.

**Focus is always visible.** A 2px accent outline with offset on every
interactive element. Removing focus styling is never acceptable — keyboard and
switch users depend on it.

**Motion with a reason** (since 25 October 2026). The site moves to show
something arriving, a state changing or a place being reached, and for
nothing else. What moves: sections rising into view once; a district's
sign settling as you arrive; the home page's film, once; the live
position of a driver on a map; Roxi while she connects, listens or thinks.
What does not: nothing loops for decoration — no auroras, no light sweeping
across a photograph, no drifting pictures, no spinning or twinkling coins,
no pulsing dots, no light following the mouse, no cards tilting toward it,
no particles of any kind. A still dot says "live" as well as a pulsing one.
Durations stay short (120/200/320ms with a soft ease), and
`prefers-reduced-motion` stills everything that remains. Motion is never
the content, and nothing waits on it: a section that has already passed
the bottom of the screen is shown even if no frame saw it arrive.

**Touch targets are at least 44px** (`--spacing-touch`), and navigation sits at
the bottom within thumb reach.

## District worlds

Each district sets its own accent family and, more importantly, its own layout
archetype. The registry records both, and a test asserts that all seven
archetypes are distinct — recolouring one card grid seven times is explicitly
not the plan.

| District | Accent | Colour world | Archetype | The feeling | What the page does with it |
| --- | --- | --- | --- | --- | --- |
| Mercadito | Emerald | Emerald and black, the market at first light; woven cloth | `discovery-density` | Commerce, browsing, density | A market stall: awning, one big search, categories to swipe, goods in a tight grid |
| Services | Cyan | Clear-water cyan and black; ripples spreading from a call | `request-board` | Someone needs help; someone can help | A help desk: the question and "Lo necesito hoy" beside a photograph, every kind of help as tiles |
| Works | Electric blue | Blue and black, ink and blueprint; a drafting grid | `professional-directory` | Precise, professional, credible | A job board: the search inside the banner, offers in one list, the board's rules pinned beside it |
| YavayaGo | Orange | Sunset orange and black, the road at dusk; light streaking past | `motion-map` | Movement, maps, speed | A delivery app: where you are first, what you can ask for, kinds of shop as round icons |
| Community | Violet | Violet and black, the plaza after dark; rings, like people gathered | `calm-column` | Calm, human, unhurried | A town square: the photograph edge to edge, then kinds of post, one calm column, the doors to Santuario and Espacio Violeta |
| Sanctuary | Soft gold | A white chapel by candlelight, ivory and soft gold; light from a high window | `sacred-nave` | Quiet, reverent, warm | Candlelight: a tall centred title, the day's light set alone like an epigraph, then the churches |
| Animals | Leaf green | Leaf green and black, the garden in the morning; a trace of leaves | `organic-profile` | Organic, compassionate | A gallery: a framed print first, adoption as a path of steps, large frames for the animals |

The archetype is the substance. Mercadito is dense because browsing many items
quickly is the task. Community keeps the conversation in a single calm column
because someone asking for help should not be presented as inventory.
YavayaGo asks where you are before anything else because location is the
question being answered.

Each district's guide film comes **after** its own content, never as the first
thing on the page: the district should be recognisable before anyone is asked
to press play. Photographs are shown in full colour, with a shade only where
words sit on them.

**Crowns** (`worlds.css`, October 2026). Every page of a district wears its
mark along the top, the way Mercadito has its awning: Mercadito a narrow
awning (its own page has the full one), Servicios a signal running along a
dashed line, Trabajo a draftsman's rule, YavayaGo a road with someone on it,
Comunidad papel picado, Santuario candlelight, Animales a trail of paws. A
pseudo-element in the world's own colours, so a screen reader never meets it;
all of them still, since crowns are marks, not events.

## Barrios

Since 24 October 2026 each district is a barrio of one colonial town, and a
barrio is more than its colours. It has a **sign** — a wrought-iron rótulo
over the door, a silhouette of the trade rather than a word, its emblem lit
from behind in the barrio's colour (`ui/site/rotulo.tsx`) — an **object**,
the shape its things take; a **motion**, the way they arrive; and a
**gesture** of its own. The sign swings once as you arrive, as if someone
had just walked past, then hangs still; with reduced motion it never moves.

| Barrio | Sign | Object | Motion | Gesture |
| --- | --- | --- | --- | --- |
| Mercadito | A basket of fruit, round | Price tags with a punched hole; every category a stall under its own awning | Goods set down on the table | The awning |
| Servicios | Hammer and wrench, a guild shield | A ticket torn from the pad, notched down its edge | Rippling into view | "Lo necesito hoy" carries its lit dot, a call waiting to be answered |
| Trabajo | A compass on a rule, a cut plate | The ficha: ruled, corner turned down, the pay stamped in mono | The top rule draws itself across | The pay, always the first thing read |
| YavayaGo | A scooter with its box, a pennant pointing the way | A route ticket, perforated and notched, fee and time printed like a departure board | Arriving from the right, like traffic | The road with someone on it |
| Comunidad | The ceiba with two people under it, an oval | A note pinned to the plaza's board, a little crooked, pins in papel picado colours | Rising gently | The papel picado over the plaza |
| Santuario | A gilded chapel arch with a candle that burns | The arch of a chapel window: the day's light, the words, the churches | Kindling into view, slowly | A prayer lights a candle |
| Animales | A paw, a scalloped round | A polaroid, taped up | A small hop | The trail of paws |

The prayer candle is the one gesture that crosses barrios: wherever a
prayer request appears, its "I'm praying with you" button carries a candle,
alight once you have pressed it — the real words and the real count, given a
shape (`worlds.css`).

Each barrio's own rules live in `app/<district>/barrio.css`, loaded by that
district's layout, so a page only downloads its own barrio. Every rule is
scoped to `.site[data-tone="<district>"]` as well: a stylesheet one route
loaded stays in the page when the visit moves on. A district page's own
classes can move there too, out of the stylesheet every page downloads, as
Mercadito's market stall has; they keep the cascade layer they were written
in, so nothing else about them changes.

**The home page's districts are seven windows.** Each card in the gallery
wears its district's world: its colours and pattern, light rising from one
corner, the name in its heading tint, the photograph fading into the colour
beneath it. Mercadito is the large window because it is the way in;
Santuario and Animales close the gallery as a wide pair. The Mercadito
feature above it has a picture of its own, so no photograph appears twice on
the page.

**Opening day.** Yavaya has just opened and most lists are still empty. An
empty list is drawn as an open door in the world's colours, an invitation to
be first — never filler, never invented content.

**The living hero.** On a phone, the home page's market moves once, for seven
seconds, after the page has loaded: the film starts exactly on the still
picture and comes to rest (`hero-film.tsx`; `tools/hero-film/` at the
repository root has how it was made). A moment, not a loop — a picture that
keeps moving under the title stops being calm — and only where the visit can
afford it: no data saver, no slow connection, no reduced motion.

**Community carries an additional rule:** it must never present a
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

## Global controls

Language, appearance, shortcuts and member access live in one panel, one tap
from anywhere, anchored to the header.

The panel is a `<details>` element and every control is a plain form whose
submit button carries its value. Nothing here needs JavaScript: on a cheap
phone or a bad connection the settings still work, which matters more than a
snappier toggle.

**Language** defaults to `auto`, which follows the device's language via
`Accept-Language`. An explicit choice overrides it, persists in a cookie, and
is mirrored onto the account so it follows the member to another device. The
fallback for an unsupported device language is Spanish, never English.

**Appearance** defaults to `system`. The theme is resolved on the server before
the first byte and written as `data-theme` on `<html>`, so the correct palette
is in the first paint — no flash, and no render-blocking inline script.
`system` deliberately emits *no* attribute, leaving `prefers-color-scheme` in
charge.

**Shortcuts** are deliberately few — the destinations a member returns to, not
a sitemap. A long list would defeat the point.

**Member access** is in the same panel: sign in and register when signed out,
member area and sign out when signed in. The fourth slot of the bottom
navigation follows the same rule, so the tap always lands somewhere useful.

## Honesty in the interface

A district that is not built is not a link — it renders with its real status
and does not invite a tap into an empty room.

Demo content is visibly marked `DEMO` and explained. It never counts in a
statistic and never generates a notification.

Capability states are rendered with the word first and colour second, through
one `CapabilityBadge` component. A member who cannot distinguish the colours,
or is reading in sunlight, gets the whole message.

Where a capability is not `REAL`, the interface does not offer it. Token
packages are shown for information while payments are unconfigured, and there
is no purchase button at all — not a disabled-looking one that still invites a
tap.

The live activity feed shows only real events. When there is nothing real to
show, it shows nothing, or an honest empty state. It is never padded.
