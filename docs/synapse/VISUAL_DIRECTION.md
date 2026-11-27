# Visual direction: the next look (27 Nov 2026)

Design notes only. Nothing here is built into the app yet, and each item needs
the owner's go before it is.

## The owner's palette (27 Nov, word for word)

> "Color
> Black, obsidian black
> Gold
> That's our theme
> If we can avoid purple, it would be great, just maybe just a tiny bit of purple glow on Roxi, that's pretty much it
> And disassemble stuff should be ultra smooth and realistic. Any color or glow that fits will be good."

This replaces the earlier proposal of violet as the main light (and the Halo
prototype's obsidian + violet + champagne gold) for the new direction. The
values used in the concept film: ground `#050505`, gold `#E2C27A` (lines,
edges), `#F6DDA0` (light), `#FFF3D6` (hottest point), violet `#8E7CFF` only as
a faint rim on Roxi (0.12–0.18).

## The reference video (owner's upload "Ideas.mp4", not in the repo)

A 17 s screen recording of a YouTube Short, an Assassin's Creed fan animation
by @MadebyGuille, music and effects only. The owner sent it as "a major
direction of how the app can look", not to copy.

| Time | Picture | Sound |
| --- | --- | --- |
| 0–1 s | Tunnel of glowing rings, glitching letters, a point of light | Deep rumble |
| 1.5 s | White-cyan flash | Hit |
| 2–3.6 s | AI head assembles from scanlines, halo ring, eyes light up | Loudest moment |
| 4–5 s | Armoured hand reaching up, blurred screens | Drops, airy |
| 5.6–14 s | Light from the open palm; screens fan out in a curved arc; circuit lines connect them | Whoosh per screen (6.2, 9.3 s), swell at 10.5 s |
| 14.7–16.8 s | Particle DNA helix, then the logo forms | Near silence at 15.5 s, then a bright hit |

What it teaches: one light colour; nothing appears, it assembles; content comes
from a source (a hand) with light joining them; content floats in a curved arc
with depth of field; visible circuitry; a sound rhythm (bass on arrival, air
while browsing, silence before the reveal, a hit for the signature); a
signature at the end.

What we never take: their world, logo, Animus look, armour or helix, the cyan,
the glitch, and the full-frame white flash (photosensitivity).

## Eight things to build from it (proposed)

1. **Roxi shows you things from her hand**: results fan out of her open hand as
   a curved arc of cards joined to her by light. (Recommended first.)
2. **An awakening like a film opening**: a tunnel of Yavaya's real words, a soft
   burst, Roxi assembles in close-up, halo ring. Still 5 s, still skippable.
3. **Districts as a floating arc** with each district's newest real photo or
   Mirador video, background blurred.
4. **Roxi's work made visible**: a line of light grows from her to a district
   only when she is really acting.
5. **Her state in light**: listening, thinking, speaking, problem, one glow each.
6. **"La señal" transition**: screens assemble from fragments; sparingly; off
   with reduce motion.
7. **Sounds re-scored** to that rhythm (the app's sounds are generated in the repo).
8. **"El hilo"**: two strands of light twisting into the Yavaya mark ("lo que nos
   une"), our signature instead of the helix.

Limits: blur and particles are heavy on cheap phones (the app already detects
weaker phones and serves less); Roxi's own hand replaces the armoured hand.

## Ten epic directions (proposed 27 Nov, none chosen yet)

| # | Idea | Builds on | Effort |
| --- | --- | --- | --- |
| 1 | **La Ciudad Viva**: home as a holographic Nicaragua lit by real activity at its real place; pinch from country to neighbourhood; quiet places stay dark | map hologram, YavayaGo live map, 55,577 places in the database | large |
| 2 | **Roxi en tu mundo**: augmented reality, Roxi stands on your table, talks, holds up her draft; one tap records a clip | hologram, voice | large; native AR module; not all cheap phones; behind Classic |
| 3 | **Roxi con cuerpo**: real-time 3D Roxi, lips follow her voice, gestures, looks at you | Play's free character pipeline | very large; paid 3D tools need approval |
| 4 | **Noche de Luz**: La Gritería, 7 December, the country lights candles together on the live map; phones in a crowd form one image | Santuario candle counts, live feed, sound engine | medium; date-bound; could ship as an over-the-air update |
| 5 | **Tu año en luz**: 15 s vertical year film told by Roxi, opt-in, neighbourhood totals only | promo-film pipeline, Roxi's voice | medium |
| 6 | **Mercadito holográfico**: one photo becomes a floating hologram listing; place furniture in your room | depth-map technique, Roxi drafts, Mercadito feed | medium |
| 7 | **El Radar del Barrio**: water and power cuts move like weather fronts; power returns street by street | Barrio live board | medium |
| 8 | **Constelación**: family abroad as lines of light across a night sky; packages travel the globe | Diáspora district, star field | medium–large |
| 9 | **Habla y el mundo se mueve**: voice-first; "muéstrame trabajos cerca" rearranges the space; helps people who struggle to read | motion engine, Roxi's tools | medium |
| 10 | **La ciudad como juego**: Play on real streets, daily route from the city map, ghost runs, quests that are good deeds | Play engine, progression, ghosts, daily route | very large; location-safety rules |

Claude's pick (not the owner's): 4 now (date), then 1 and 2 as the flagship
pair; 6 and 7 as quick wins. Rule: epic only counts if it runs on a $120
phone. The owner has not chosen yet.

Commands proposed for building: `/superpowers:brainstorming`,
`/superpowers:writing-plans`, `/superpowers:subagent-driven-development`,
`/expo:expo-animation`, `/expo:expo-native-ui`, `/expo:expo-module`,
`/expo:eas-update`, `/playcanvas:inspect-glb`,
`/mobile-app-design:review-screen`, `/ui-design-review:review`,
`/audit-suite:audit-as-perf-eng`, `/hyperframes`, `/media-use`,
`/social-media-skills:viral-reverse-engineering`,
`/social-media-skills:tiktok-script`, `/code-review`, `/security-review`,
`/superpowers:verification-before-completion`, `/amhandoff`. Paid tools
(Meshy, larger EAS machines) only with approval.

## The concept film

`design/films/oro/` ("Presencia Oro", 19 s, 1080×1920). It shows direction 1
(Roxi presents from her hand) with the palette above, the release back into
light, and "el hilo" forming the eagle. See its `SPEC.md` and `REVIEW.md`.
