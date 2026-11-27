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

## 6. Second send (27 Nov 2026): R21–R39

Twenty more files arrived, with the owner's words: "What I give is close to
what we shall have, but it's your job to make sure what we will have will be
Roxi. I'm just giving you the direction of her movement and Roxi should have a
glow in gold instead of purple." Measurements:
`design/references/aether/metrics-batch2.json`; face scores:
`design/references/aether/identity-2026-11-27.json`.

- **Duplicates:** the first file (`1000192811.gif`) is byte-identical to R20,
  so only R20 is kept. The two Diáspora GIFs (R21, R25) are different
  animations (no frame pair correlates above 0.8), so both are kept
  (decision AX-D014).
- **Files:** R21–R26 have 6 frames held 1.3 or 1.8 s (R22 and R24 are tall,
  about 336 × 764). R27 has 12 frames held 0.65 s. R28–R39 have 12 frames held
  0.22–0.24 s (loops of 2.6–2.9 s), 358 × 358: smoother than the first send,
  but still twelve stills per clip, so they give poses and timing, not motion
  capture.
- **Flashes:** all pass (0 general flashes).
- **Colour:** the Roxi GIFs glow violet (20–90 % of their lit pixels). From
  now on her glow is gold (decision AX-D013). Diáspora glows violet and blue,
  Movilidad cyan, Campo gold.
- **Identity:** measured in §7. No face in these GIFs is Roxi's. They give
  her movement; her face, hair and clothes come from her source image.

### What each one shows

**R21 Diáspora, globe to communities.** A globe of night lights; arcs leave
Central America; member pins appear; country chips (MX, US, ES, CR);
community cards with member counts; a card opens into a community page with
"Unirme" and tabs.

**R22 Movilidad.** A glass map pin with a car over a cyan light-road; service
bubbles (Viaje, Envío, Mandado, Reservar); a route form over a cyan city;
"Calculando ruta… tráfico en tiempo real"; turn-by-turn directions with time
and distance; "Has llegado" with a five-star rating.

**R23 Barrio.** A glass map pin over a colonial street at night; place icons
orbit a 3D block; a 3D neighbourhood map with pins and distances; a list of
places (a bakery, a clinic, a corner shop); a place page (open now, closing
time, call, WhatsApp, directions, follow); a walking route.

**R24 Campo (gold).** A crystal sprout over a gold wireframe terrain; the
crystal opens onto a farm under a volcano; six categories; land listings in
manzanas with prices; a listing page.

**R25 Diáspora, tap the globe.** A finger taps Nicaragua; the globe becomes a
3D map of Nicaragua with Managua's community; a country hub; a community card
with "Unirme"; a feed of posts.

**R26 The app with Roxi at its centre.** Home with a globe and a central orb
button; a district carousel on a glass platform; Roxi appears with "¡Hola!
Soy Roxi" and quick actions (Buscar cerca, Publicar anuncio, Ver mapa, Mis
mensajes, Comprar tokens); Mercadito; YavayaGo directions; Santuario. The
woman here is labelled Roxi but has another face and a black outfit.

**R27 Roxi presents a listing.** Beside a glass card she reaches in, pulls
the photo out, holds it on her open hand while the details open beside it
with "Contactar", then the photo dissolves back into the card.

**R28 Roxi materialises.** A column of particles on a mirror floor becomes a
silhouette, then a translucent body, then her solid self; the camera moves
in; she smiles and closes her eyes.

**R29 Turn and walk away.** From the front she turns to her left and walks
until we see her back.

**R30 Welcome.** A hand to the waist, an open hand, both arms wide, back to
rest.

**R31 Walk in and face.** She walks across in profile and turns to face the
camera.

**R32 Walk away into depth.** She turns and walks away until she is small.

**R33 Explaining.** Both hands open to the sides while she talks, then back
to clasped hands.

**R34 Listening.** Hands clasped, a nod, a one-hand explanation, a smile.

**R35 Look and point.** She looks up to her left, points at something
off-screen, and comes back.

**R36 Thinking.** She looks down, folds an arm, and puts a hand to her chin.

**R37 Joy.** Close-up: a smile becomes a laugh; the head tilts back, the eyes
close; a gentle smile.

**R38 Concern.** Close-up: brows knit, an open hand towards the viewer, then a
soft smile.

**R39 Surprise.** Close-up: eyes widen, the mouth opens, a palm rises, then a
smile.

### New capabilities

| ID | Capability | System | Seen in | Technique | Real data and rules | State |
| --- | --- | --- | --- | --- | --- | --- |
| C53 | Roxi forms from a particle column into her solid self, in gold | IMPOSSIBILIS | R28 | 3D + SHD + PTC; 2.5D tier with the existing reconstruction | — | NOT IMPLEMENTED (2D reconstruction INCOMPLETE) |
| C54 | Roxi pulls an item's photo out of its card, presents it, opens its facts, returns it | SYMBIOSIS | R27 | SKL + IK, UI shared element, SHD | content descriptor: only the item's real fields | NOT IMPLEMENTED |
| C55 | Walk in, turn to face, turn and walk away | CORPUS | R29, R31, R32 | SKL (root motion, foot contacts) | — | NOT IMPLEMENTED |
| C56 | Body language: welcome, explain, listen, think | CORPUS, SENTIENCE | R30, R33, R34, R36 | SKL clips blended by state | Roxi's real state (listening, speaking, working) | NOT IMPLEMENTED |
| C57 | Look at and point to a real element on screen | SYMBIOSIS | R35 | SKL + look-at and arm IK to layout targets | layout geometry | NOT IMPLEMENTED |
| C58 | Expressions with gestures: joy, concern, surprise | SENTIENCE, VOX | R37–R39 | facial shapes + SKL | — | NOT IMPLEMENTED |
| C59 | A central button summons Roxi with a greeting and quick actions | OMNIPRAESENTIA, SYMBIOSIS | R26 | UI + Roxi tier | quick actions only for features that exist | NOT IMPLEMENTED |
| C60 | Globe of night lights with arcs; tap a country for its 3D map | AETHER | R21, R25, R26 | 3D (sphere, night-lights texture) or VID; SHD | places, district data | NOT IMPLEMENTED |
| C61 | Glass map pin hero; 3D neighbourhood map with pins | AETHER | R22, R23 | vector map with 3D buildings, SHD | places; distance needs the phone's location with permission | NOT IMPLEMENTED |
| C62 | Turn-by-turn directions and live traffic | INFINITY | R22, R26 | navigation provider | **none in the platform** | NOT IMPLEMENTED (owner decision) |
| C63 | District emblem crystal over a wireframe terrain | TRANSCENDENCE | R24 | SHD, CMP | district registry | NOT IMPLEMENTED |
| C64 | Country communities with membership | INFINITY | R21, R25 | UI | **community groups are not built** | NOT IMPLEMENTED (owner decision) |
| C65 | Trip rating after arrival | INFINITY | R22 | UI | not in the data | NOT IMPLEMENTED (owner decision) |

### Where the second send differs from the platform

| Reference shows | The platform today | Until the owner decides |
| --- | --- | --- |
| Diáspora as communities by country, with members and "Unirme" (R21, R25) | Diáspora is the family bridge: help at home arranged from abroad (repairs, errands, elder care, medical visits, deliveries, paperwork, celebrations, property care); community groups are not built | the real subdistricts |
| Movilidad as trip booking with live traffic, turn-by-turn and a rating (R22) | Movilidad is a board (shared rides, routes, freight, vehicle rental, vehicles, parts, workshops); trips are YavayaGo, with offers; no navigation provider | the board; YavayaGo for trips |
| Barrio as a directory of places with distances, opening hours and "Seguir" (R23) | Barrio is a board (notices, utilities, events, fairs, lost and found, giveaways, neighbour help, groups); no opening hours in the data | the board's categories |
| Campo categories Tierras, Productos, Insumos, Maquinaria, Servicios, Oportunidades (R24) | subdistricts: harvest, buyers, livestock, supplies, machinery, land lease, farm work, farm transport; land for sale is in Hogar | the real subdistricts |
| Roxi's quick actions "Mis mensajes" and "Comprar tokens" (R26) | no member messages; buying tokens inside the app waits for the store-billing decision (R1) | messages hidden; tokens open the website |
| A listing's year, mileage and condition on Roxi's card (R27) | only the fields the listing has | only real fields |

## 7. Is it Roxi? (identity check, 27 Nov 2026)

Method: every frame of every Roxi-like reference, faces found with the
OpenCV YuNet detector, aligned, and compared with her source image by SFace
cosine similarity (`design/references/aether/tools/identity_check.py`).
OpenCV's published same-person threshold for SFace is 0.363, but on these
AI-generated women it is too loose: four clearly different women from the
references pass it. So the scale is read against controls:

| Faces | Score against Roxi's source |
| --- | --- |
| Roxi's own images (film grade, face crop) | **0.95–0.99** |
| R28, materialising (closest of the new GIFs) | 0.57–0.62 (median 0.59) |
| R37 joy, close-up | median 0.37 (0.27–0.45) |
| R39 surprise, close-up | median 0.32 (0.24–0.38) |
| R38 concern, close-up | median 0.21 (0.16–0.33) |
| other women in the references (R03, R08, R10, R13, R19, R26) | 0.07–0.48 |
| R27, R29–R36 (full body) | faces under 60 px: not measured |

Reading: R28 is the closest but still far from her own images. The three
close-ups score in the range of different women, and R38 and R39 resemble
each other (0.71) more than they resemble Roxi: a different face. The
full-body GIFs are close in hair and jacket but drift in clothes (black cargo
trousers with a side pocket and lace-up combat boots, against her dark purple
trousers and ankle boots; a belt in some).

So: these GIFs set **how she moves**; **who she is** comes from her source
image, and every rendering of her must pass the identity bar in
PRODUCTION_TESTS T-ID-01 (decisions AX-D015, AX-D016).
