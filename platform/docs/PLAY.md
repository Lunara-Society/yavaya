# Yavaya Play

A small world of original games at `/play`, apart from the rest of the
platform: its own full-screen page, its own code (`src/ui/play/`), its own
tables (`play_*`), and a 3D library (three.js, MIT) that is downloaded only
there. It never touches tokens, reputation or the marketplace.

## The plan, and where it stands

The first release (owner's directive "The next evolution", approved):

| Step | What | State |
| --- | --- | --- |
| 1 | One shared engine: screen and clock, thumbs, movement, camera | **Done** |
| 2 | The character: catalogue, studio, saved look | **Done** |
| 3 | Yavaya Plaza, the hub (studio, Rush gate, Reward Corner, Adventure Gate, Roxi's lot reserved) | Next |
| 4 | Rush polish; records on the account | — |
| 5 | Discovery: hidden Guardian symbols, a secret garden | — |
| 6 | Progression: XP, levels, achievements, Play Coins, checked by the server | — |
| 7 | A small earnable cosmetic shop (no real money) | — |
| 8 | Dash, a short downhill sprint (not a lane runner) | — |

Not in this release: multiplayer, chat, payments, AI calls during play,
Roxi's House, any paid service.

## What is real now

- **Yavaya Rush, course one — "La Calle del Mercado".** A third-person
  obstacle run: a street, stepping stones over a fountain, swinging market
  signs, steps to the roofs, two moving carts, a wide wall or a narrow golden
  one, a finish arch. A timer, twenty coins, four checkpoints, a best time.
- **The character.** One model for every game, built in code
  (`character/build.ts`): smooth tapered limbs with real joints, a head a
  little large for the body, a drawn face that blinks and grins, cel shading
  with a thin outline. Nine choices from `config/play-looks.ts`: 2 bodies,
  6 skin tones, 4 faces, 5 hairstyles, 8 hair colours, 6 tops (the
  guayabera among them), 4 bottoms, 4 shoes, 4 accessories and none.
  Animated by code: idle (breathing, weight shift, glances, blinks), walk and
  run blended by speed, rising and falling, a squash on landing, a cheer,
  and two emotes (Saludar, Bailar).
- **The Character Studio** (`modes/studio.ts`). The first visit opens here
  ("Crea tu personaje"); later, "Personaje" in the course opens it. A finger
  turns the character; the head's choices bring the camera close;
  "Sorpréndeme" dresses at random.
- **Where the look is kept.** On the account for a signed-in player
  (`play_profiles`, `PUT /api/play/profile`), on the phone for anyone else.
  A look made on the phone before signing in is moved to the account the
  first time the player is seen signed in. The server stores only a look made
  entirely of catalogue ids (`exactLook`) and refuses anything else; reading
  an old look repairs it (`parseLook`) so a retired option never breaks one.
- **Controls**, tuned on the owner's phone: the stick rests at the bottom
  left and a thumb on its arrow runs at full speed (a direction, not a
  throttle; near-forward is forward); every tap of Saltar is a whole jump; a
  jump keeps its run; one thumb can leave the stick to press Saltar. An
  interact button (`controls.offer`) appears only when something is in reach;
  the plaza is its first user.

What is **not** there yet, and is not pretended:

- The best time is kept on the device only. No records on the account, no
  rankings, no XP, no Play Coins (steps 4 and 6). Coins in a run mean
  nothing else.
- Tested by scripts in an emulated phone; the owner has played earlier
  builds on a real Android phone. Frame rates on real phones are measured
  with `/play?debug`, not claimed.

## Phase 3: Pruebas de Maestría (built, behind the owner's switch)

The owner's directive "The Mastery Evolution". Built so far: priorities 1–3
and 6 (movement, a real learning curve, five tiers, one guardian), with a
first pass at a more mature look. Not yet: XP, levels, achievements, Play
Coins and cosmetic rewards on the account (priority 4, the progression
step, with server checks), the Obsidian Ascent (5), the plaza locations (7).

**The switch.** Admin → Diseño del sitio → Pruebas de Maestría
(`play.trials`, off by default: `SITE_LOOK_RULES.trials`). While off, only
someone who may manage flags sees the trials; Yavaya Rush is unchanged
for everyone.

**The moveset** (`engine/moves.ts`, pure logic). Run 6.5 m/s; running
straight builds momentum to a sprint, 9.2 m/s, in about a second; a hard
turn or a stop spends it. One button, "Esquivar", read in context and
labelled live: running, a slide (low enough for a bar, keeps the speed);
standing, a roll (untouchable by fire for a quarter second, then a moment
of recovery); in the air, one dodge per jump (up to two metres more, the
later the more). Combinations: sprint → jump → air dodge; slide → jump.
Measured reaches: a run jump about 4.8 m, a sprint 6.8 m, a sprint with a
late air dodge 8.8 m, a slide jump 7.3 m. Every gap in the trials is sized
to one of those.

**The trials** (`trials/data.ts`, played by `trials/sim.ts`):

| Tier | Trial | Teaches |
| --- | --- | --- |
| I Bronce | Las Gradas del Volcán | jumps, a moving platform, pendulums |
| II Plata | El Paso Quebrado | slide, roll through fire, a sprint gap, slide → jump |
| III Oro | El Templo de Obsidiana | gates, a wave of vents, a crumbling bridge, a shortcut that needs an air dodge |
| IV Obsidiana | La Torre Rota | all of it, upward, on narrow ledges |
| V Guardián | El Centinela de Obsidiana | a guardian in three phases: light the plates while its arms sweep (jump the low, slide the high), then fire at the corners |

Fairness rules: every hazard runs on a fixed cycle from the start of the
attempt; every danger glows before it acts; a fall says what happened
("Te alcanzó el péndulo") and puts the player back at once (a quarter
second, nothing reloads); ↻ restarts at any time. A trial opens when the
one before it is beaten.

**Proven completable.** `tests/unit/play-trials.test.ts` plays every trial
to the end in Node with the moveset alone, with and without checkpoints.
The route's time is each trial's `reference` (11.9, 13.0, 16.9, 13.3 and
18.0 s); medals are cut from it (Guardián also needs a run with no
checkpoint). The multiples are ours and provisional, to be retuned from
real players' times once those are measured.

**Records** stay on the phone for now, and the screen says so.

**The look.** Volcanic basalt, obsidian with gold trim, a lava river under
the course, broken colonnades and forest on the banks, a dusk sky, soft
shadows from one low sun. The character everywhere now has adult
proportions, physically based materials instead of cel shading, and a
calmer, smaller-featured face. All generated in code; nothing downloaded.

## Who sees it

The switch is Admin → Diseño del sitio → Yavaya Play (`play.open`, off by
default: `SITE_LOOK_RULES.play`). While it is off, `/play` is a 404 for
everyone except someone who may manage flags, who sees it marked "Vista
previa". Nothing on the site links to it yet. When open, it is open to
everyone, signed in or not (the owner's decision).

## How it is built

- `play.ts` — the start: one runtime, one set of controls, then one
  activity ("mode") at a time; `go('studio' | 'rush')` switches.
- `engine/runtime.ts` — the renderer and the clock: a fixed 120 Hz step,
  up to a quarter second caught up (no slow motion on a slow phone), at most
  1.5 pixels per point and fewer if frames are slow, no zoom.
- `engine/controls.ts` — the stick, Saltar, the interact button, the keys.
- `engine/body.ts` — movement among boxes: gravity, run, jump with
  forgiveness (coyote time, a buffered press), landing, being carried.
- `engine/scenery.ts` — light, the follow camera (high and looking down, so
  gaps read as gaps), the shadow that shows where a jump lands.
- `character/` — the character and its faces.
- `modes/` — the activities. `course.ts` — Rush's course as plain numbers;
  every gap is laid out for a jump at a run (about 5.2 m, 1.7 m high).
- `loader.tsx` — asks the browser for WebGL, then fetches the game. The page
  hands over the `play.*` texts and the saved look.

The game’s download is about 155 KB compressed, all of it fetched only on
`/play` after the page has painted.

## Checking it

- `node tests/e2e/play.cjs http://127.0.0.1:3000` — through the studio,
  then the course from start to finish with the keyboard: a fall, a full
  run, the finish panel, a restart. A flawless run is about 20 seconds.
- `tests/integration/play-profile.test.ts` — every choice is named in both
  languages; the server refuses looks it never offered; one look per account.
- `/play?debug` — frames a second, pixel ratio, draw calls, speed: for a
  report from a real phone.

Whether it is *fun* is for a person to say.

## Later: multiplayer, more games, Roxi's House

Activities are modes on one runtime with one character, so a new game is a
new mode that reuses the body, the controls and the look. A shared plaza
needs, before anything else: moderation, age safeguards, reporting, blocking
and privacy (no public chat or voice). Roxi's House gets a reserved lot in
the plaza and nothing more until it is designed.
