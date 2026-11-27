# Reference-to-capability matrix (AX-02)

The owner's 20 references (27 Nov 2026), inspected one by one: every frame
extracted, measured and read. Measurements come from
`design/references/aether/tools/analyse_refs.py` (results in
`design/references/aether/metrics.json`). The originals and the contact
sheets of every frame are kept privately (the repository is public;
[ASSET_REGISTRY.md](ASSET_REGISTRY.md) §3).

Rule for everything below: the references show **behaviour**. Products,
prices, people, places, ratings, counts and logos in them are illustrative
and must never become data ([constitution](CONSTITUTION.md)).

## 1. What the files are (measured)

| | Frames | Each frame held | Size | Note |
| --- | --- | --- | --- | --- |
| R01–R05 | 9 | 0.85 s (7.65 s loop) | ≈ 414 × 414 | Guardian, Roxi-style figure, vortex |
| R06 | 6 | 1.8 s (10.8 s) | 508 × 508 | Guardian assembly |
| R07, R08, R11–R20 | 6 | 1.5 s (9.0 s) | ≈ 507 × 507 | app flows |
| R09, R10 | 1 | — | 1440 × 3088 | R09 is pixel-identical to `mobile/art/roxi/roxi-source.png`; R10 is a phone screenshot of a gallery |

What follows from that:

- **The GIFs are keyframe boards, not animations.** Six to nine stills a few
  hundred pixels wide, each held for about a second, palette-quantised to
  256 colours. Consecutive frames differ a lot (mean change 14–46 levels out
  of 255, peaks to 67), so the motion between them has to be designed, not
  traced. They contain no recoverable 3D geometry, skeleton or animation
  curves, and they are too small to use as textures (decision AX-D005).
- **Photosensitivity:** a WCAG 2.3.1 general-flash check (heuristic, not a
  certified test) finds at most 0.5 flashes per second (R17, R19); every
  reference passes. None has a full-frame white flash.
- **Colour:** gold carries 39–96 % of the lit pixels in 15 of the 18 GIFs.
  The measured gold is warm amber: highlight median `#DEA258`
  (range `#CF9666`–`#EAC054`), body median `#895E2F`, warmer than the
  concept film's champagne `#E2C27A`. White-silver light is 3–20 %. No GIF has
  violet. Three districts glow in their own colour: Aprender blue (74.5 % of
  lit pixels), Salud green-teal (75.7 %), Negocios silver-chrome (grey and
  white 60 %). R09 (Roxi's own photo) is 58.6 % violet: her jacket.
  ([VISUAL_CONSTITUTION.md](VISUAL_CONSTITUTION.md) §2)
- **Identity:** the women in R03, R08 and R10 are **not Roxi** (brown hair,
  another face). From them we take staging, gesture and material only; her
  face, hair, proportions and clothes come from R09 (decision AX-D007). The
  Guardian in R02, R04 and R06 matches the approved Guardian
  (`platform/public/first-light/guardian2-*`, 6 Nov 2026) in pose, palette
  and shape; R01 and R05 show a close-up of its head that no current asset
  provides.

## 2. Each reference

Times are the frame times in the file. "Between frames" is our inference of
the intended motion.

**R01: Guardian to marketplace hall** (GENESIS · 9 frames)
f0 the Guardian's head and black-gold plumage · f1 one feather lifts out of
the plumage and lights up · f2–f3 the feather alone, a ring of light opens
round it · f4 the feather unravels into gold and white ribbons; floating
glass cards appear (a motorbike, a sofa) · f5–f6 more cards (a house, a
dress, headphones) at different depths · f7–f8 a crystal hall with a light
column at its centre and a mirror floor.
Between frames: the feather turns about 30° as it rises; the ring scales
from nothing; the camera pushes forward through the ring (the cards grow and
part to the sides, parallax by depth); ribbons lead the eye left to right.
Builds: C06, C50, C52, C02 (inverse). Cards are real descriptors.

**R02: Holographic rotunda dissolves into the Guardian** (GENESIS · IMPOSSIBILIS · 9 frames)
f0 a cylinder of curved glass screens round a small Guardian hologram on a
lit disc · f1–f2 the screens break into glass shards and gold ribbons in an
S-swirl · f3–f5 the ribbons gather into the Guardian, wings opening ·
f6–f8 the full Guardian, wings spread, the final emblem.
Between frames: shards fly outwards and spin, then the flow reverses and
converges along spirals; wings open in two beats.
Builds: C07, C03, C02.

**R03: A figure picks up a feather** (ANIMA · CORPUS · IMPOSSIBILIS · 9 frames)
f0 a woman in a transparent crystal body with gold light inside, the
Guardian's wings behind her, a gold feather on a dark water surface ·
f1–f3 she reaches down with her right hand, fingers open; ripples spread ·
f4 she lifts the feather · f5–f7 raises it, looks up at it · f8 holds it
near her face and smiles at the camera.
Between frames: arm reach with the shoulder leading; the hand closes on
contact; her gaze moves feather → feather → camera; ripples expand from the
contact point; the Guardian's wings breathe.
Builds: C10, C11, C12, C13, C16. Not Roxi's face.

**R04: The Guardian and the district constellation** (GENESIS · TRANSCENDENCE · 9 frames)
f0 a spiral of gold light with a bright core · f1–f3 the Guardian forms from
the spiral and opens its wings under a halo · f4–f8 faceted crystals, each
holding a district symbol, appear one or two at a time and settle in a ring
round it.
Between frames: the spiral tightens into the body; crystals pop in with a
glint and drift to their slots; slow orbit.
Builds: C04, C02, C05. The crystals are the real district registry, not the
GIF's symbols.

**R05: The Guardian's head revealed by light** (GENESIS · AETHER · 9 frames)
f0 darkness with one light stroke along the beak · f1–f5 light sweeps over
the feathers from beak to crown; the eye lights · f6–f8 white ribbons begin
to circle.
Between frames: a moving rim light, not a fade; the eye ignites at about
4 s; mean luminance rises from 0.003 to 0.099.
Builds: C01. Needs a head close-up master.

**R06: Ribbons and shards become the Guardian** (GENESIS · 6 frames)
f0 an S-swirl of ribbons with glass shards · f1–f3 the ribbons converge into
a rising Guardian · f4–f5 wings fully spread, final emblem.
Builds: C02 (this is the reference for it), C03.

**R07: Search with suggestions and filters** (INFINITY · 6 frames)
f0 home: wordmark, bell, a search line, a 4 × 2 grid of glass tiles, bottom
bar · f1 the search line expands into a glass field · f2 typing "moto",
suggestions under it · f3 results with tabs (Todos, Venta, Compra,
Alquiler), a count and a sort · f4 a glass filter sheet: place, price range,
condition · f5 filtered results, one heart filled.
Between frames: the field grows from the line with a ribbon of light;
the tiles dim under the suggestions; the sheet rises from the bottom.
Builds: C20, C24, C25, C26, C30.

**R08: Phone in hand, into Mercadito, Roxi helps** (TRANSCENDENCE · SYMBIOSIS · 6 frames)
f0 a home of three crystal prisms (Trabajo, Mercadito lit, Servicios) ·
f1 a finger taps Mercadito · f2 the prism bursts into a vortex of glass
ribbons carrying preview cards · f3 Mercadito: search, tabs, a 2-column grid
· f4 an item page with a presenter pointing at the item, price,
description, place, buttons Contactar, Llamar, Mensaje · f5 the grid with a
small docked card: "¿Necesitas ayuda? Estoy aquí." and a voice waveform.
Builds: C21, C22, C25, C28, C14, C15. The presenter is not Roxi's face.

**R09: Roxi** — the owner's full-length image (identity source). See
[ROXI_PIPELINE.md](ROXI_PIPELINE.md).

**R10: Gallery screenshot with a Mercadito concept** (TRANSCENDENCE) — a
woman with gold light strands (not Roxi's face), Mercadito header with a
green cart, categories (Todo, Ropa, Hogar, Electrónica), three items with
prices. The gallery strip shows more Guardian emblems and a circular
emblem animation that were not sent.

**R11: Santuario** (INFINITY · TRANSCENDENCE · 6 frames)
f0 lotus, title, a church picture held in a ribbon of light · f1–f2 the
ribbon opens and the picture fills the screen · f3 "Palabra del día"
carousel · f4 the district menu (Palabra del día, Oración, Reflexiones,
Eventos, Comunidades de fe) · f5 the word for the day with like, share and
WhatsApp share.
Builds: C23, C27, C33.

**R12: YavayaGo trip** (INFINITY · AETHER · 6 frames)
f0 YavayaGo home (Viaje, Envío, Mandado, Programar, "¿A dónde vas?") ·
f1 destination search with suggestions and the keyboard · f2 a route drawn
in gold on a dark light-map, time, distance, an estimated fare,
"Solicitar" · f3 "Buscando conductor…" radar pulse · f4 a driver card with a
rating, car, time, distance, fare, Mensaje and Aceptar · f5 tracking: the
car moves along the route; Compartir viaje, Seguridad, Cancelar.
Builds: C24, C32, C51. The fare and matching shown differ from the real
rules (§4).

**R13: Trabajo** (INFINITY · 6 frames)
f0 home, the Trabajo tile glows · f1 its hero (briefcase in a glass ring) ·
f2 list with tabs and pay · f3 the first card lifts out of the list ·
f4 job page with requirements and Llamar, WhatsApp, Aplicar · f5 "Solicitud
enviada".
Builds: C20, C23, C25, C27, C28, C29, C39.

**R14: Hogar** (INFINITY · 6 frames)
f0 a 3 × 3 home (Hogar lit, a ribbon looping round it; Salud present) ·
f1 hero: house photos fanned as glass sheets · f2 list (prices per month) ·
f3 a card grows into the page · f4 page with photo carousel, rooms, area ·
f5 tabs Detalles, Ubicación, Galería, Contacto and a fact table.
Builds: C20, C23, C27, C28, C40.

**R15: Aprender** (INFINITY · AETHER · 6 frames, blue)
f0 a glowing neural brain over a gold book · f1 category bubbles orbit the
book · f2 home with categories over a light-mesh terrain · f3 list with
tabs (Cursos, Tutoriales, Talleres, Becas) · f4 a course page ·
f5 "Inscripción confirmada".
Builds: C23, C25, C28, C29, C34, C51.

**R16: Negocios** (INFINITY · 6 frames, chrome)
f0 a chrome bar chart with a gold orbit · f1 menu (Empresas, Aliados,
Financiamiento, Promociona tu negocio) · f2 directory · f3 a business page ·
f4 "Contactando…" progress ring · f5 "Solicitud enviada".
Builds: C23, C25, C28, C29, C36.

**R17: Animales** (INFINITY · TRANSCENDENCE · 6 frames)
f0 a dog and a kitten inside a loop of glass ribbon · f1 grid of animals in
organic glass bubbles, tabs Adopción, Perdidos, Ayuda · f2 one bubble grows ·
f3–f4 adoption page · f5 "Contactando…" with a WhatsApp mark.
Builds: C23, C27, C28, C29, C38.

**R18: Comunidad** (INFINITY · 6 frames)
f0 feed with tabs (Todo, Ayuda, Ideas, Eventos) · f1 threads of light link
the avatars · f2 a post page with counts and participants · f3 replies ·
f4 writing a reply · f5 the reply posted; a small constellation of the
participants lights up.
Builds: C31, C50.

**R19: Salud y Bienestar** (INFINITY · 6 frames, green)
f0–f1 leaf emblem in green ribbons · f2 categories · f3 providers ·
f4 provider page "Agendar ahora" · f5 "Cita agendada".
Builds: C23, C25, C28, C29, C35.

**R20: Servicios** (INFINITY · TRANSCENDENCE · 6 frames)
f0 glass shards orbit a point · f1 they assemble into a ring round a chrome
wrench · f2 title · f3 category tiles on a curved floor · f4 providers with
ratings and filters (Todos, Cerca de mí, Disponibles hoy) · f5 list and
"Publicar mi servicio".
Builds: C03 (reversed), C23, C25, C37.

## 3. Capabilities and how each is built

Technique codes: **3D** 3D asset · **SKL** skeletal animation · **PROC**
procedural motion · **SHD** shader · **PTC** particle system · **CMP**
compositing · **VID** video asset · **UI** native interface animation.

| ID | Capability | System | Seen in | Technique | Real data and rules | Missing | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | Light sweep reveals the Guardian | AETHER, GENESIS | R05 | SHD, CMP (3D later) | brand asset | Guardian head close-up master | NOT IMPLEMENTED |
| C02 | Ribbons and shards assemble into the Guardian | GENESIS, IMPOSSIBILIS | R02, R04, R06 | PTC, SHD, PROC; VID first on weak phones | brand asset; Guardian point cloud exists (`design/films/oro/assets/eagle_points.js`) | — | NOT IMPLEMENTED (film: design only) |
| C03 | A screen breaks into shards and ribbons (and back) | IMPOSSIBILIS | R02, R20 | PTC, SHD (screen snapshot → shard mesh), PROC physics | the current screen | — | NOT IMPLEMENTED (Synapse reconstruction is 2D, INCOMPLETE) |
| C04 | Vortex birth | AETHER | R04 | SHD, PTC | — | — | NOT IMPLEMENTED |
| C05 | District crystals orbit the Guardian | TRANSCENDENCE | R04 | UI, SHD (faceted crystal), PROC | district registry (15, with status) | gold icon set | NOT IMPLEMENTED |
| C06 | Feather portal into a hall of floating cards | GENESIS | R01 | CMP (2.5D layers, perspective), SHD, PTC; VID option | content descriptors | Guardian head close-up | NOT IMPLEMENTED |
| C07 | Rotunda of curved panels round a hologram | TRANSCENDENCE | R02 | UI, CMP (cylinder perspective) | content descriptors | — | NOT IMPLEMENTED |
| C10 | Reach, grasp, lift and present an object | CORPUS, SENTIENCE | R03 | 3D, SKL (IK, hand poses) | — | rigged Roxi | NOT IMPLEMENTED |
| C11 | Crystal body with inner gold light | IMPOSSIBILIS | R03 | SHD on 3D mesh; 2.5D fallback on the portrait | — | rigged Roxi | NOT IMPLEMENTED |
| C12 | The Guardian as companion behind Roxi | ANIMA, AETHER | R03 | CMP, PROC (wing breathing) | brand asset | — | NOT IMPLEMENTED (the website's Guardian breathes) |
| C13 | Water surface with ripples | AETHER | R03 | SHD | — | — | NOT IMPLEMENTED |
| C14 | Roxi points at the item and presents it | SYMBIOSIS | R08 | SKL + IK to screen targets (3D); pose set (2.5D) | descriptor; layout geometry | rigged Roxi | NOT IMPLEMENTED |
| C15 | Docked help card with voice waveform, dismissible | OMNIPRAESENTIA, VOX | R08 | UI, SHD | Roxi state and voice level | — | INCOMPLETE (Roxi island, Presence pill) |
| C16 | Smile, gaze shifts | SENTIENCE | R03 | 3D facial shapes | — | facial shapes | NOT IMPLEMENTED |
| C20 | Glass tile home (4 × 2 or 3 × 3); lit tile, looping ribbon | TRANSCENDENCE | R07, R13, R14 | UI, SHD | district registry; order from `config/districts.ts` | gold icon set | INCOMPLETE (Synapse home, older palette) |
| C21 | Crystal prism carousel | TRANSCENDENCE | R08 | UI, CMP (2.5D), SHD | district registry | — | NOT IMPLEMENTED |
| C22 | District entry burst with preview cards | TRANSCENDENCE, GENESIS | R08 | PTC, UI shared element | newest real items | — | NOT IMPLEMENTED |
| C23 | District hero that opens into its screen | TRANSCENDENCE | R11, R13–R17, R19, R20 | UI shared element, SHD, CMP | district registry | hero art for all 15 districts | INCOMPLETE (district object exists; older look) |
| C24 | Glass search with live suggestions | INFINITY | R07, R12 | UI | Mercadito search exists (`q`); no cross-district search or suggestions endpoint; places API exists | mobile API | NOT IMPLEMENTED |
| C25 | Lists with tabs, counts, sort | INFINITY | R07, R13–R16, R19, R20 | UI | feed endpoint covers 4 districts, no tabs or counts | mobile API | INCOMPLETE (4 districts, read only) |
| C26 | Filter sheet (place, price range, condition) | INFINITY | R07 | UI | Mercadito conditions exist; filter params not in the mobile API | mobile API | NOT IMPLEMENTED |
| C27 | Card lifts and grows into its page | TRANSCENDENCE | R13, R14, R17 | UI (shared element) | — | — | INCOMPLETE (motion engine) |
| C28 | Item page: media carousel, facts, tabs, action bar | INFINITY | R08, R13, R14 | UI | needs the content descriptor | mobile API | NOT IMPLEMENTED (website page opens today) |
| C29 | Progress ring and confirmation seal | INFINITY | R13, R15–R17, R19 | UI, SHD | only after the server confirms (never a fake success) | — | NOT IMPLEMENTED |
| C30 | Favourite hearts | INFINITY | R07, R08, R13, R14, R16, R17, R20 | UI | **no saved items in the platform** (Mercadito has saved searches) | owner decision | NOT IMPLEMENTED |
| C31 | Community thread, reply, participant constellation | INFINITY | R18 | UI, SHD | posts, replies and supports exist; **no likes** | — | NOT IMPLEMENTED natively (website page) |
| C32 | Trip: destination, route, offers, driver, tracking | INFINITY | R12 | UI, SHD (light map) | places, trips with offers and counter-offers, live tracking exist; **no fixed fare or automatic matching** | map style | NOT IMPLEMENTED natively (website page) |
| C33 | Word for the day with share | INFINITY | R11 | UI | `sanctuary_devotionals` | native share | NOT IMPLEMENTED natively |
| C34 | Course page | INFINITY | R15 | UI | Aprender is a board: posts with contact; **no enrolment** | owner decision | NOT IMPLEMENTED |
| C35 | Health provider page | INFINITY | R19 | UI | Salud is a board; **no appointments** | owner decision | NOT IMPLEMENTED |
| C36 | Business directory and page | INFINITY | R16 | UI | Negocios is a board; **no in-app requests** | owner decision | NOT IMPLEMENTED |
| C37 | Service categories on a curved floor; providers with ratings | INFINITY, TRANSCENDENCE | R20 | UI, CMP | services, requests, reviews, "Lo necesito hoy" exist | — | NOT IMPLEMENTED natively |
| C38 | Animals in glass bubbles; adoption | INFINITY | R17 | UI, SHD | adoption applications exist | — | INCOMPLETE (native list) |
| C39 | Job application | INFINITY | R13 | UI | applications exist | — | NOT IMPLEMENTED natively |
| C40 | Housing page with a fact table | INFINITY | R14 | UI | Hogar is a board; **structured area, rooms, baths not verified in the data** | data check | NOT IMPLEMENTED |
| C41 | Bell with badge | INFINITY | all app refs | UI | bell REAL; push NOT IMPLEMENTED | — | NOT IMPLEMENTED natively |
| C42 | Bottom bar: Inicio, Buscar, Publicar, Mensajes, Perfil | INFINITY | R07, R08, R12–R18, R20 | UI | **no member-to-member messages** outside Espacio Violeta; publishing is website forms | owner decision | NOT IMPLEMENTED |
| C50 | Light ribbons in the background | AETHER | most | SHD, PROC | — | — | INCOMPLETE (environment shader, older palette) |
| C51 | Light-mesh terrain, neural mesh, city light-map | AETHER | R12, R15 | SHD; vector map with a custom style | places; map tiles | map style and tile source | INCOMPLETE (country map hologram only) |
| C52 | Mirror floor and glass platform | AETHER | R01, R02 | CMP, SHD | — | — | NOT IMPLEMENTED |

## 4. Where a reference shows something the platform does not do

The constitution forbids new commercial features and changes to district
rules without the owner's approval. Each item is adapted to the real rule
until the owner decides (decision AX-D006).

| Reference shows | The platform today | Until the owner decides |
| --- | --- | --- |
| Fixed fare estimate and automatic driver search (R12) | the member offers a price; drivers accept or counter-offer; cash | offer field and incoming offers in the same look |
| Driver star rating (R12) | drivers are reviewed by a person; a public star rating is not confirmed in the data | no stars |
| Appointment booking (R19) | Salud is a board with contact | contact; booking would be a new, health-sensitive feature |
| Course enrolment (R15) | Aprender is a board with contact | contact |
| In-app request to a business (R16) | Negocios is a board with WhatsApp contact | contact |
| Likes on community posts (R18) | supports and replies exist; likes do not | supports |
| Favourite hearts (most app refs) | no saved items (Mercadito: saved searches) | no hearts |
| "Mensajes" tab, "Mensaje" buttons | no member-to-member messages outside Espacio Violeta | the tab waits for a decision |
| "Llamar" buttons (R08, R13, R16) | contact runs through the district's own rules (WhatsApp for members) | the existing contact rule |
| Prices in C$, counts ("124 resultados", "248 oportunidades") | real prices carry their own currency; counts come from queries | only real values |
| Fact tables for housing (R14) | board posts' structured fields not verified | only fields the row has |

## 5. Missing assets and limits

Missing (details and owners in [ASSET_REGISTRY.md](ASSET_REGISTRY.md) §5):
new reference views of Roxi; a Guardian head close-up master (R01, R05); a
3D Guardian if its assembly runs in real time; hero art for all fifteen
districts in the new look (seven older "worlds" exist on the website; the
board districts have none); a gold icon set; the official wordmark as a
vector (the references show a serif "YAVAYA.LAT"; the repository has raster
logos only); a map style for the light-map.

Technical limits:

- Keyframe GIFs give poses and compositions, not motion; all timing and
  easing is designed ([VISUAL_CONSTITUTION.md](VISUAL_CONSTITUTION.md) §5).
- Real refraction, depth of field and thousands of particles are too heavy
  for a 120 USD phone; every effect needs a cheaper tier and a still.
- Skia has a canvas budget (D-036): grids and lists use views; heavy effects
  share one canvas.
- The camera flights in R01 and R02 are 3D; on phones they become 2.5D
  layers or the video tier.
