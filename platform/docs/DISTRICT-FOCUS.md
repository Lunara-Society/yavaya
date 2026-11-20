# The districts' first screen ("District focus")

The owner's decision of 20 November 2026 ("let's do all that"), after a
review of every district on a phone: the pages were beautiful but often
showed two photographs before the district's name, no button in the first
screen, and several empty boxes saying the same thing.

Switch: Admin → Diseño del sitio → "Distritos: primera pantalla y «sé el
primero»" (`look.district_focus`, `SITE_LOOK_RULES.focus`), **on** by
default. Off, every page below is exactly as it was. The shell puts
`data-focus` on `.site` while it is on; the styles are the "District focus"
block of `src/app/site.css`.

## On a phone (under 700 px wide unless noted)

- **The world strip** (`DistrictWorld`) stays, thinner (84–118 px instead of
  180–250), so the district's own hero carries the first screen.
- **Shorter heroes** for the four that pushed the name out of the first
  screen: Santuario, Comunidad, YavayaGo, Animales (Animales shows its words
  and buttons before its framed photograph).
- **A button in the first screen** where there was none: Santuario ("Ir al
  muro de oración", "Registrar mi iglesia") and, for a visitor, Comunidad
  ("Entrar para ver la plaza").
- **Sign-in in the header** (under 900 px): one "Entrar", as on the home page,
  instead of the row above the header. The row still appears to say a session
  has ended. Google stays on /login, /register and its own prompt.
- **"Abriendo por etapas" once**: shown on the first page a browser sees,
  then remembered with the cookie `yv_ribbon=1` (30 days; a preference, no
  identifier). The status page keeps the full answer, one tap away in the menu
  and the header badge on wide screens.
- **Servicios**: the ten kinds of help as compact rows (about one screen
  instead of two and a half).
- **The footer**: the long list of districts folds to its first link, the page
  that lists them all.
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
