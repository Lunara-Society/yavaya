# Presencia Oro: concept film

Design preview of Yavaya's next look, from the owner's reference (a holographic
fan animation) and their palette: obsidian black and gold, violet only as a
faint glow on Roxi. Taken from the reference: things assemble from light, a
hand projects content, a curved floating arc of panels with depth of field,
lines of light, a held breath before the signature. Not taken: its world, its
logo, its cyan, its glitch.

GOAL:    The owner sees Yavaya's app as a cinematic black-and-gold space where
         Roxi assembles from light and presents what you need from her hand, and
         says "build this".
OUTPUT:  HyperFrames, 1080 x 1920 (a phone), 30 fps.
TIME:    19.0 s x 30 = 570 frames. Music track e42ec51c (dark cinematic swell,
         loudest 3 s, receding to near silence by 14 s): the music is the clock.

LOOK:    ground #050505 obsidian with a warm floor glow (radial, #1A140A at 0.55,
         under Roxi) and a 10% vignette; ink #F3EDE2 warm white; accent gold:
         #E2C27A (lines, edges), #F6DDA0 (light), #FFF3D6 (hottest point).
         Violet #8E7CFF only as Roxi's rim, intensity 0.18, one side.
         Type: Geist SemiBold for names (cards 58 px, wordmark 104 px, tracking
         +28%), Geist Regular for lines (32 px), Geist Light for the tagline
         (34 px). Medium: light itself. Particles are additive gold points
         1.6-3.4 px, bloom only above luminance 0.62 (strength 0.85, radius 0.55).
         Cards: obsidian glass rgba(14,12,9,0.82), 3 px gold edge #E2C27A at
         0.9, 4% top highlight, radius 36 px.
OBJECTS: Roxi: her approved image, outfit graded to obsidian with gold piping,
         matte alpha, a 64k-point copy of her for assembling and releasing.
         Light in her hand: a hot gold point at her hand (u 0.216, v 0.602) that
         rises to chest height in front of her.
         Five district cards with the app's real names and lines: Mercadito,
         Trabajo, Servicios, YavayaGo, Barrio.
         El hilo: two gold strands twisting into one.
         The eagle: the app's own emblem, drawn in 34k points of light, then the
         real image in a gold-edged rounded square, with the wordmark.
MOTION:  arrivals expo.out (long tail); camera and colour power2.inOut; exits
         power3.in, 40% shorter than arrivals. Particles follow eased paths with
         a swirl that dies as they land: nothing pops, nothing glitches.
         Card flights 27 frames, staggered 13 frames. Letters 3 frames apart.
SHOTS:
  1  f0-45     Darkness. Her 64k points drift as faint gold dust in depth; a warm
               point brightens at her heart. Sound: music enters.
  2  f45-120   She assembles: the dust spirals in and lands on her body, core to
               edge, colour warming from gold to her true colours; her image
               resolves under the points at f108-130. Sound: sub swell, impact
               lands at f120.
  3  f120-156  She stands. A gold sheen sweeps down her once; violet rim, faint.
               Camera eases in 6%.
  4  f156-186  Light gathers in her hand and rises to her chest, rays turning.
  5  f186-258  The light opens: five cards fly out on an arc in front of her, one
               every 13 frames; a thread of light joins each to her hand. She
               falls behind into soft focus (blurred, 55%). Sound: a soft whoosh
               per card (three takes rotated).
  6  f258-348  The arc turns slowly; focus moves card to card; the front card is
               sharp, the side cards soft.
  7  f348-396  Everything releases: cards break into gold points that stream up;
               her points lift away head first. Sound: air release.
  8  f396-426  Held breath: near black, near silence, one gold thread glints.
  9  f426-450  El hilo: two strands spiral in from above and below and meet.
 10  f450-570  At the meeting they open into the eagle, which draws itself in
               light (f450-477), then the real emblem resolves (f468-486);
               YAVAYA letter by letter, "Lo que nos une", then a small
               "Vista previa de diseño". Sound: whoosh into sub impact at f450,
               music returns under it.
BANNED:  cyan, teal, blue; purple anywhere but Roxi's rim; glitch, scanlines,
         strobe or a full-frame white flash (photosensitivity); HUD letters and
         numbers; the reference's logo, helix-as-DNA and armour; text moving
         while read; everything fading in at once; the logo in a corner;
         particles that drift without a part in the story.
QA:      f30 dust and the warm point; f96 mid-assembly (points on her shape,
         swirl visible); f135 Roxi resolved with gold sheen; f230 cards on the
         arc, threads, her soft behind; f300 front card legible at phone width;
         f370 release; f410 the breath; f462 eagle drawing; f560 end card.

SOUND (HeyGen catalog ids; files kept out of git, fetch again to render):
  music  e42ec51cc364425fa587a3e2b07d9c02  "dark cinematic ambient synth, building
         tension, peaking at the reveal"  -> assets/audio/m_e42ec51c.wav
  sfx    267aac82036013b5 "Sci fi sub bass impact" (peak 3.27 s) -> sfx_arrival_267aac82.mp3
         a4855a82116cd4cc "Fast airy whoosh" (peak 0.45 s)       -> sfx_whoosh_a_a4855a82.mp3
         00caa739b2b0a74c "Quick Whoosh" (peak 0.215 s)          -> sfx_whoosh_b_00caa739.mp3
         2e34dc51fefc19c7 "Low Muffled Whoosh" (peak 0.625 s)    -> sfx_whoosh_c_2e34dc51.mp3
         69406ab5b6667dc6 "Air burst" (peak 1.165 s)             -> sfx_release_69406ab5.mp3
         128d8419bd34e7bb "Cinematic Sub Bass Hit" (peak 0.42 s) -> sfx_mark_128d8419.mp3
