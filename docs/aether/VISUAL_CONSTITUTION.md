# Visual constitution

The look, materials and motion of the Aether × Anima app, and the rules that
keep them safe and fast. It replaces, for new work, the design notes in
[DESIGN_SYSTEM.md](../synapse/DESIGN_SYSTEM.md) and
[VISUAL_DIRECTION.md](../synapse/VISUAL_DIRECTION.md) (both kept as history).
Written 27 Nov 2026 (AX-01, AX-02). Nothing here is in the app yet; every
visible change ships behind **Classic**.

## 1. Sources, in order

1. The owner's palette, word for word (27 Nov 2026): "Color / Black, obsidian
   black / Gold / That's our theme / If we can avoid purple, it would be
   great, just maybe just a tiny bit of purple glow on Roxi, that's pretty
   much it / And disassemble stuff should be ultra smooth and realistic. Any
   color or glow that fits will be good."
2. The owner's reference video: "a major direction of how the app can look",
   "not to do exactly the design the video shows" (its breakdown:
   VISUAL_DIRECTION.md).
3. The 71 references of 27 Nov, in four sends ([REFERENCE_MATRIX.md](REFERENCE_MATRIX.md)).
4. The identity assets: Roxi's source image and the approved Guardian.
5. The owner on the second send of references (27 Nov 2026): "I'm just
   giving you the direction of her movement and Roxi should have a glow in
   gold instead of purple."

## 2. Colour

Measured from the 18 GIFs (pixels classified by hue, every other frame):

| Ref | What | Gold highlight | Gold body | Lit pixels by colour (top 3) | Max flashes/s |
| --- | --- | --- | --- | --- | --- |
| R01 | Guardian to hall | `#DEA467` | `#895B3A` | gold 61.2 %, grey 15.0 %, red 10.5 % | 0.0 |
| R02 | Rotunda to Guardian | `#E3A046` | `#884F18` | gold 92.8 %, white 3.2 %, grey 2.9 % | 0.0 |
| R03 | Figure and feather | `#DF9E58` | `#7F4E2C` | gold 90.7 %, white 3.6 %, red 3.1 % | 0.0 |
| R04 | Guardian constellation | `#E49F45` | `#894E1B` | gold 87.2 %, white 5.7 %, grey 4.2 % | 0.0 |
| R05 | Guardian light sweep | `#DEA15A` | `#88542A` | gold 94.0 %, white 4.2 %, red 1.0 % | 0.0 |
| R06 | Guardian assembly | `#E99A33` | `#89480D` | gold 95.9 %, white 2.8 %, grey 1.1 % | 0.0 |
| R07 | Search and filters | `#E7AF57` | `#8A5F2F` | gold 45.3 %, grey 25.4 %, blue 19.6 % | 0.0 |
| R08 | Into Mercadito | `#E2A353` | `#8A5A2F` | gold 66.7 %, grey 15.9 %, white 10.4 % | 0.0 |
| R09 | Roxi (photo) | `#CB8F73` | `#B2785D` | violet 58.6 %, red 31.8 %, gold 7.2 % | — |
| R10 | Gallery screenshot | `#DDA15C` | `#885E3B` | gold 37.7 %, grey 21.5 %, white 15.1 % | — |
| R11 | Santuario | `#E6AB72` | `#82582E` | gold 66.8 %, grey 23.0 %, white 7.3 % | 0.0 |
| R12 | YavayaGo | `#EAC054` | `#8E652A` | gold 42.8 %, blue 23.5 %, grey 21.3 % | 0.0 |
| R13 | Trabajo | `#CF9666` | `#90623C` | gold 44.2 %, grey 24.2 %, blue 18.3 % | 0.0 |
| R14 | Hogar | `#D6A950` | `#906728` | gold 47.2 %, grey 13.3 %, blue 13.2 % | 0.0 |
| R15 | Aprender | `#D4AC76` | `#85633E` | blue 74.5 %, gold 10.2 %, white 7.6 % | 0.0 |
| R16 | Negocios | `#D8A973` | `#876136` | grey 40.5 %, gold 37.9 %, white 19.6 % | 0.0 |
| R17 | Animales | `#D4A271` | `#8D623C` | gold 78.0 %, grey 11.0 %, white 10.9 % | 0.5 |
| R18 | Comunidad | `#D9A168` | `#895D36` | gold 39.4 %, grey 38.6 %, white 19.1 % | 0.0 |
| R19 | Salud | `#D89A4A` | `#93684B` | green 75.7 %, white 8.6 %, gold 7.6 % | 0.5 |
| R20 | Servicios | `#E49B55` | `#976846` | gold 38.9 %, grey 36.6 %, white 15.6 % | 0.0 |

"Red" in R01 and R03 is the deep orange edge of the gold; "grey" is the
interface's dark glass. Medians over the 18 GIFs: highlight `#DEA258`,
body `#895E2F`.

**Tokens** (decision AX-D019: the gold of the owner's logo, chosen on 27 Nov):

| Token | Value | Use | Contrast on `#050505` |
| --- | --- | --- | --- |
| `ground` | `#050505` | background (the film's black) | — |
| `obsidian` | `#14110F` glass at 60–80 % | panels, bars, sheets | — |
| `gold.deep` | `#973D05` | the logo's gold in shadow: borders at rest, glows | 2.90:1, never for words |
| `gold.core` | `#F0920C` | the logo's gold: icons, active outlines, prices, headings | 8.56:1 |
| `gold.light` | `#FAE172` | the logo's bright gold: light, glow cores | 15.60:1 |
| `gold.hot` | `#FDF3CB` | the logo's white-gold: the hottest point of a glow | 18.30:1 |
| `light.white` | `#E8ECF2` | white-silver light ribbons, body text | 17.19:1 |
| `roxi.glow` | `#FAE172` core, `#F0920C` edge | Roxi's glow, rim light and particles: gold (the owner, 27 Nov); no violet anywhere | — |

Gold text keeps at least 4.5:1 against what is behind it (WCAG AA):
`gold.core` and lighter for words, `gold.deep` never for words. `gold.light`
and `gold.hot` are the medians of the logo's brightest gold pixels; superseded
on 27 Nov (AX-D019): the GIF amber (`#DEA258`, `#895E2F`, `#F6DDA0`,
`#FFF3D6`) and the film's champagne (`#E2C27A`).

**District glows.** The references give Aprender a blue glow, Salud a green
one and Negocios chrome. The owner allowed "any color or glow that fits", so
a district may have its own glow, but gold stays the brand's light on every
screen, and **no district uses purple**. Today the website's Comunidad
accent is purple (`config/districts.ts`); in the new app look Comunidad uses
gold (as R18 does). The website does not change. The second send glows
violet in Diáspora (R21, R25) and cyan in Movilidad (R22): in the app,
Diáspora takes gold or blue instead of violet, and Movilidad's cyan stays
only if the owner confirms it fits. The third send's interface scenes glow
violet and blue; in the app they are black glass and gold. The fourth send
already glows gold: its opening (R68) measures `#DEA473`, close to
`gold.core`. The owner's logo measures `#F0920C` (highlight) and `#973D05`
(shadow), warmer and more orange than the GIFs' amber; the owner chose it
(question 1, answer a; AX-D019).

## 3. Materials

| Material | Look | Built with | Seen in |
| --- | --- | --- | --- |
| Obsidian glass | dark translucent panel; thin gold or white edge light; soft inner reflection | Skia gradient + edge-light shader; views only in lists ("lite") | every app screen |
| Crystal prism and gem | faceted, a bright gold core, white glints on edges | Skia facet gradients; refraction approximated, never computed | R04, R08 |
| Light ribbon | white-silver or gold strips that flow, overlap and glow | procedural splines with additive glow | most |
| Liquid gold feathers | the Guardian's plumage; warm specular | the Guardian's own layers and light maps | R01, R05 |
| Glass shards | thin bright-edged fragments with motion blur | instanced particles from a screen snapshot | R02, R06, R20 |
| Mirror floor, water | dark reflection that fades; ripples on contact | mirrored layer with a fade; ripple normal shader | R01, R02, R03 |
| Chrome | cool metal with gold reflections (Negocios) | gradient maps | R16, R20 |
| Light mesh | points and lines of light: terrain, network, a city | shader; a vector map with a custom style for YavayaGo | R12, R15 |
| Crystal body | Roxi in transparent glass with gold light inside | IMPOSSIBILIS shader on the 3D mesh | R03 |

## 4. Identity

- **Roxi** looks as in her source image in every tier ([ROXI_CAPABILITIES.md](ROXI_CAPABILITIES.md) §1),
  and her glow is gold.
- **The logo** is the gold and black eagle (the owner's master of 27 Nov;
  also `platform/public/brand/`), and the lettering is the gold Roman
  capitals of "YAVAYA", set in Cinzel bold where it is typed (AX-D018). The
  marks drawn in the owner's GIFs are not used (AX-D017).
- **The Guardian** is the approved artwork (`platform/public/first-light/guardian2-*`,
  6 Nov 2026; logo `platform/public/brand/logo-1080.webp`). The references'
  eagles match it; any new rendering of it (a head close-up, a 3D model)
  must match it too and needs the owner's approval before use.
- **The wordmark** is the owner's own gold lettering (27 Nov), used as an
  image until a vector exists; it is never retyped in another font. Cinzel
  bold (SIL OFL 1.1) is for typed display words such as headings, because it
  is the closest free match to that lettering; body text stays in Geist
  (AX-D018).

## 5. Motion

The GIFs are keyframes held about a second each, so all timing is designed
here, not copied.

| Movement | Rule | Seen in |
| --- | --- | --- |
| Assemble, never appear | things form from light, shards or ribbons, and leave the same way | R02, R04, R06, R20 |
| Ribbon-led transitions | a ribbon travels and opens a hero into its screen | R07, R11, R14 |
| Shared element | a card lifts and becomes its page; back reverses it | R13, R14, R17 |
| District entry | a burst carries the district's newest real items in | R08 |
| Orbit | districts settle round the Guardian | R04 |
| Light sweep | a rim light reveals a form; never a fade from white | R05 |
| Confirmation | a glass ring fills, a seal appears, only after the server answers | R13, R15–R17, R19 |

Timing (targets to tune on phones): touches answer in under 100 ms;
micro-motion 120–200 ms; screen transitions 280–450 ms; district entry at
most 700 ms; a cinematic moment at most 5 s and always skippable (the
awakening rule). Motion uses springs and physically plausible paths;
"ultra smooth and realistic" means 60 fps on capable phones, no stepping,
shards with mass and blur, never a jump cut.

## 6. Safety and access

- **Flashes:** no more than 3 general flashes per second, and no full-frame
  white flash. The 18 references measure at most 0.5 per second
  (heuristic). Every cinematic render is checked with
  `design/references/aether/tools/analyse_refs.py` before it ships.
- **Reduce motion:** assemblies become fades, orbits stop, ribbons hold
  still, Roxi's motion drops to `idle`.
- **Contrast:** words at least 4.5:1 (§2); gold glow never behind small
  text.
- **Sound and haptics** are optional layers; nothing depends on hearing or
  feeling them.

## 7. Screens (patterns from the references, mapped to real data)

Header with the wordmark and the bell (bell REAL; push NOT IMPLEMENTED) ·
glass search · district tiles 4 × 2 or 3 × 3 from the district registry ·
bottom bar Inicio, Buscar, Publicar, Mensajes, Perfil ("Mensajes" waits for
an owner decision, REFERENCE_MATRIX §4) · every district: hero → list →
item page → action → confirmation, with each step backed by a real endpoint.

## 8. Never

From the owner's video rule: their world, logo, armour, helix, cyan, glitch,
scanlines and full-frame white flash. From the constitution: any product,
price, person, place, rating, count or logo copied out of a reference.

## 9. Speed

Every effect has a tier below it (MASTER_ARCHITECTURE §7) and a still
fallback. An effect that cannot hold its budget on a 120 USD phone drops a
tier there; it is not removed for everyone.
