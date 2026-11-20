# The districts' first screen ("District focus")

The owner's decision of 20 November 2026 ("let's do all that"), after a
review of every district on a phone: the pages were beautiful but often
showed two photographs before the district's name, no button in the first
screen, and several empty boxes saying the same thing.

Switch: Admin → Diseño del sitio → "Distritos: primera pantalla y «sé el
primero»" (`look.district_focus`, `SITE_LOOK_RULES.focus`), **on** by
default. Off, every page below is exactly as it was. The shell puts
`data-focus` on `.site` while it is on; the styles are in
`src/ui/site/district-focus.css`, loaded only with the district pages so no
other page pays for them.

## On a phone (under 700 px wide unless noted)

- **The world strip** (`DistrictWorld`) stays, thinner (84–118 px instead of
  180–250), so the district's own hero carries the first screen.
- **Shorter heroes** for the four that pushed the name out of the first
  screen: Santuario, Comunidad, YavayaGo, Animales (Animales shows its words
  and buttons before its framed photograph).
- **A button in the first screen** where there was none: Santuario ("Ir al
  muro de oración", "Registrar mi iglesia") and, for a visitor, Comunidad
  ("Entrar para ver la plaza").
- **Sign-in in the header** (under 900 px, on the district pages): one "Entrar", as on the home page,
  instead of the row above the header. The row still appears to say a session
  has ended. Google stays on /login, /register and its own prompt.
- **"Abriendo por etapas" once**: shown on the first page a browser sees,
  then remembered with the cookie `yv_ribbon=1` (30 days; a preference, no
  identifier). The status page keeps the full answer, one tap away in the menu
  and the header badge on wide screens.
- **Servicios**: the ten kinds of help as compact rows (about one screen
  instead of two and a half).
- **The footer** (on the district pages): the long list of districts folds to
  its first link, the page that lists them all.
- **Films**: the player's controls sit in a dark band under the poster, so
  they no longer cover its title.

## "Be the first" (`ui/site/first-block.tsx`)

Where a district is still empty, one block replaces the boxes it used to
stack: what will be here, who can bring it, one button, and an example of how
it will look. The example is drawn by the component, never stored: it is not
a listing, nobody can open, answer or count it, and it carries the site's
"Ejemplo" tag and the note "Así se verá. Es un ejemplo, no una publicación
real." It disappears by itself with the first real item, because the page
shows the block only while it has nothing real to show.

| District | Shown when | Button |
|---|---|---|
| Mercadito | no listings, nobody searching or filtering | Publicar gratis, plus each category as a small door |
| Santuario | no words and no churches, nobody searching | Registrar mi iglesia |
| Animales | no animals up for adoption, no species or size chosen | Solicitar ser rescatista |
| Trabajo | no open offers, no field, kind or remote filter | Publicar una oferta |
| The eight board districts | no posts, no subdistrict, kind or search | Publicar |

The place filter does not count: when a place is empty the lists already widen
on their own (`widenWhenEmpty`), so an empty result there means empty
everywhere.

## The home page's cards

With the look on (and the First Light off, as now), each district card on the
home page carries one line of real activity (`districtPulse` in
`server/domains/discovery/pulse.ts`, `PulseLine` in `ui/site/home.tsx`):

- **"3 nuevos hoy"** with a green dot, or **"5 nuevos esta semana"**: new
  things in the live feed's own windows (`LIVE_FEED_RULES.windowHours` and
  `keepDays`), so the cards and the ticker never disagree about what is new.
- **"· cerca de ti"** when they happened inside the place the visitor chose;
  when nothing did, the count is for everywhere and says nothing about nearness.
- **"Abre aquí: sé el primero"** only when the district has nothing live a
  visitor could see on its page. Never for Servicios or Comunidad, whose pages
  are for members.
- Otherwise nothing: the card keeps its own line.

The seven website districts are counted from the live activity feed, which
refuses demo content and drops listings no longer published; the board
districts from their open posts, leaving out registered demo accounts.
Tests: `tests/integration/district-pulse.test.ts`.

The photographs' disclosure is said once, above the grid, with the footer's
own sentence, instead of an "Ilustración" stamp on every card.

## A camera button for Roxi (`ui/roxi/photo-button.tsx`)

- **Mercadito**: "Vender con una foto" beside "Publicar gratis". The member
  takes or chooses the photo on the page itself (a browser opens its picker
  only inside a tap), and Roxi opens with it as if it had been sent in her
  panel (`giveRoxiPhoto` → `roxi:photo`): she drafts the listing, shown as
  the review card (the flagship, `roxi.review`, on by default since the same
  day).
- **Animales**: "Avisar con una foto". The photo goes to Roxi with the
  sentence "Quiero avisar de un animal perdido o encontrado. Esta es su foto.",
  so she prepares the lost or found notice (`prepare_post`, with the photo
  attached).
- **Barrio has none yet**: Roxi has no tool for board posts, so a camera
  button there would promise what she cannot do. It needs a new tool on her
  agent first.

Without Roxi on the page (signed out, or not configured) each button is a
plain link to the form that does the same by hand, so it never leads nowhere.

## Barrio's board of cuts (`CutsBoard` in `ui/boards/pages.tsx`)

On Barrio's front page, above its feed, while the look is on: the water,
power and internet cuts neighbours reported in the last
`BOARD_RULES.cutsWindowHours` (48), newest first, at most `cutsLimit` (6),
each with its place and how long ago ("hace 3 h", the live ticker's own words:
a clock time rendered on the server would be wrong in another time zone).
Inside the visitor's chosen place when anything was reported there ("cerca de
ti"), otherwise everywhere. It says what it is: members' reports, which Yavaya
does not verify. "Reportar un corte" opens the form in that subdistrict.

It is built from the posts neighbours already file under "Cortes de agua, luz
e internet" (`utilityReports` in `server/domains/boards/service.ts`); nothing
new is stored. It does not show while the whole board is empty (the "be the
first" block is there instead), nor on a filtered list. Tests:
`tests/integration/barrio-cuts.test.ts`.

## "SE BUSCA": a poster for every open lost or found notice

`app/animals/lost/[id]/poster` makes the notice into one portrait image
(1080 × 1350): "SE BUSCA" in red (or "ENCONTRADO" in green) over obsidian,
the first photo, the name or species, the place and the day, the start of the
description, and the page's address. Lost-pet posters already travel through
WhatsApp groups; this is that poster, made in a second.

- **On the notice page**, "Compartir cartel": on a phone that can share files
  the image itself goes to WhatsApp (or anywhere the member chooses); anywhere
  else the poster opens to save or forward (`ui/animals/poster-share.tsx`).
  Anyone can spread an open notice, not only its author.
- **As the page's preview**: the notice's link shared on WhatsApp shows the
  poster (`og:image`).
- **Only what the public page shows**, read as a visitor: never the WhatsApp
  number, which the page gives only to signed-in members (a number on a
  poster invites the ransom scam). A closed, reunited or removed notice has no
  poster (404).
- Not behind the look: it adds a door, it changes nothing that was there.

## The prayer wall's candle

On a prayer request (the prayer wall, `/sanctuary/prayer`, and the request's
own page), while the look is on, the "I'm with you" gesture becomes a candle:
**"Estoy orando por ti"**, lit with a warm light once the member has lit it
("Orando por ti"). Everyone sees how many candles are lit ("3 velas
encendidas"); the person who asked sees it said to them ("3 personas están
orando por ti"). It is the same support as before (`community_supports`, one
per member per request, counted in `support_count`), so every number is real
and nobody is named. Lighting a candle on the wall now brings the member back
to the wall, not to Comunidad.

## Each district's own WhatsApp preview

Every district page's link preview is its own card (`app/share/district/[slug]`,
1200 × 630, `districtPreview` in `ui/site/share-meta.ts`): the district's
photograph, darkened toward the words, "YAVAYA", its name, its promise and its
address, with the site's "Ilustración" tag on the photograph. Before, every
district shared the same Yavaya logo. The photographs are read from
`public/art` (the deployed image keeps `public` next to the server); an unknown
district answers 404. Not behind the look: it changes only the preview.
