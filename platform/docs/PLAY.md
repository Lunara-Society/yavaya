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
| 3 | Yavaya Plaza: a menu hub (not a walkable world: faster on a phone) | **Done** |
| 4 | Records on the account (verified runs) | **Done** |
| 5 | Discovery: hidden Guardian symbols, a secret garden | — |
| 6 | Progression: XP, levels, achievements, Play Coins, checked by the server | **Done** |
| 7 | A small earnable cosmetic shop (no real money) | **Done** |
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

- Rush's best time is kept on the device only: Rush is not verified yet
  (its course runs on the older movement, not the replayable one). The
  coins picked up in a Rush run are not Play Coins.
- Tested by scripts in an emulated phone; the owner has played earlier
  builds on a real Android phone. Frame rates on real phones are measured
  with `/play?debug`, not claimed.

## Phase 3: Pruebas de Maestría (live since 13 November 2026)

The owner's directive "The Mastery Evolution". Built so far: priorities 1–3
and 6 (movement, a real learning curve, five tiers, one guardian), with a
first pass at a more mature look. Not yet: XP, levels, achievements, Play
Coins and cosmetic rewards on the account (priority 4, the progression
step, with server checks), the Obsidian Ascent (5), the plaza locations (7).

**The switch.** Admin → Diseño del sitio → Pruebas de Maestría
(`play.trials`, on by default since the owner asked to publish it). Off,
only someone who may manage flags sees the trials. The home page carries a
door to Yavaya Play under its search, and a pill beside "Cerca de mí",
while the game is open.

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

**Records**: a guest's stay on the phone, and the screen says so; a signed-in player's are verified and kept on the account (below).

**The look.** Volcanic basalt, obsidian with gold trim, a lava river under
the course, broken colonnades and forest on the banks, a dusk sky, soft
shadows from one low sun. The character everywhere now has adult
proportions, physically based materials instead of cel shading, and a
calmer, smaller-featured face. All generated in code; nothing downloaded.

## Progress, the day's route, challenges (14 November 2026)

The owner's word on the recommendations: "do everything of this, but don't
make it easier". Nothing was made easier: every new course is built from
stretches of the five trials at their own difficulty.

**The Plaza** (`modes/plaza.ts`). Where the game opens and comes back to:
a menu over the gate, not a world to walk (on a phone a good list is faster
than a walk to a door). The player's level, XP bar and coins, or for a
guest how to keep them; a challenge, if a link brought one; La Ruta del
Día; the trials; the Barrio and Diáspora routes; Rush; the shop; the
character.

**Verified runs** (`trials/run.ts`, `engine/dmath.ts`). The game plays a
course from the thumbs sampled once a step (120 a second) and keeps those
samples; that is what it sends, not a time. The server plays the samples
again on the same course with the same simulation and takes the time it
sees (`server/domains/play/progress.ts`). A made-up time has no input that
produces it. For both sides to compute the same numbers the simulation uses
its own sin, cos, atan2 and exp (browser engines differ in the last bit of
`Math.sin`; `+ − × ÷` and `sqrt` do not). A run must end on its finish: one
cut short or padded is refused. Honest limits: a script that plays well is
indistinguishable from a person who plays well, as in any game.

**Progress on the account.** XP, levels, Play Coins, achievements and
earned looks, given only for verified runs (`play_rewards`: each reward
once, by player, reason and reference). Guests keep their records and
ghosts on the phone, and the screens say so.

**La Ruta del Día** (`trials/courses.ts`). Seven stretches of the trials,
chosen and mirrored from the date (UTC), the same for everyone, new at
midnight UTC (runs count until three hours after). Its medals are cut from
the sum of the stretches' usual times. `tests/unit/play-courses.test.ts`
crosses every stretch alone, as cut and mirrored, and plays sixty-two days
end to end; the test route waits for a hazard's window by trying the move
ahead on a copy of the course.

**Rutas de distrito.** Barrio (rooftops, a cart, shop signs, shutters,
loose boards) and Diáspora (an airport: belts, barriers, security gates, a
luggage arm, long jumps): fixed sequences of the same stretches, dressed
differently (`engine/themes.ts`); no fire in either. Only the look changes.

**Leaderboards.** Per course: the world, the player's country, their city.
A player is on their city's board only if their profile lets the city be
shown. Another player's run is never handed out from a board.

**Ghosts and challenges.** A course is raced against a pale copy of the
player's own best (kept on the phone), or against a friend's: "Retar por
WhatsApp" shares a kept run as `/play?reto=…`; the friend sees "Reto de
Ana" in the Plaza and races that run's ghost. Only runs their owner shared
are given out.

**Shop and rewards.** Looks bought with Play Coins (never money); others
won (the Chaqueta de obsidiana for Obsidiana on all five trials, the
Sombrero del Guardián for a Guardián medal, the Gorra de la Ruta for seven
days' routes) or worn by Yavaya's first members (the Sombrero de Fundador,
worked out from the order of registration, never stored). Anyone can try a
look on in the studio; the server keeps it only for its owner.

**What players do** (`server/domains/play/signals.ts`, Admin → Visitas).
Anonymous counts by day: courses started and finished, and where players
fall (by stretch between checkpoints). No account, device or address.

**Phones.** In a headless emulation with software drawing, the daily route
ran at about 24 frames a second with or without the processor slowed four
times: the drawing, not the game's logic, was the limit there. Real phones
are measured with `/play?debug`, not claimed.

## Looks from the owner's artwork, proezas and gems (14 November 2026)

The owner sent twenty sheets of artwork (faces, beards, face paint, glasses,
hair, hats, clothes) and asked for most to be free, some won by very hard
challenges, and the most exclusive sold for $0.30 to $1. First batch: 59
items from the sheets, drawn onto the character as pictures
(`public/play/looks/<part>/<id>.webp`, made by a script from the sheets;
the script and the cut-outs are not in the repository).

- **New parts:** beard, face paint, glasses, a chest print; and 11 painted
  faces and 4 patterned tops (camo, tie-dye, galaxy, plaid). A painted face
  is the artwork's features with its skin taken out, laid on the
  character's own skin; it blinks with a lid of that skin. A beard is a
  picture on a shell over the lower face; glasses a picture curved in front
  of the eyes; a print a patch of the torso's own shape. They are pictures,
  not modelled 3D, so seen from the side they are flat; from the front, as
  in the studio, they read as the artwork.
- **Tiers:** about half free (31), a fifth won (11), a third exclusive (19 for
  gems). All-ages: revealing outfits, blood, skulls and copied logos from
  the sheets were left out.
- **Proezas:** a course with no fall, no checkpoint, and a time at or under
  its reference: the test route's own time, a route that plays almost
  perfectly. Each of the five trials, the two districts' routes and any
  day's route has one; all five trials' together make the Maestro. Checked
  by the server on the replayed run (`provenAchievements`).
- **Gems:** the money currency, for looks only. Bought in packs (100 for
  $1, 320 for $3, 550 for $5) through Stripe's page, the same path as tokens
  and Roxi's credits (`server/domains/play/gems.ts`, fulfiller `play_gems`),
  credited only when Stripe confirms, once per payment. One gem is a cent;
  exclusive looks cost 30 to 100. Never converted to Play Coins or tokens,
  and Play Coins never buy a gem look. In Stripe's test environment only an
  administrator can buy.
- **Not yet:** hair, hats and whole garments from the sheets. Turning a
  picture into a 3D piece needs paid image-to-3D generation (about 35
  credits an item on the connected service; the account had 2), and a
  garment that bends with the body cannot come from one picture at all.

## The Vault (13 November 2026)

Premium looks and collectibles for gems, from the owner's collection sheet
(`public/play/vault/*.webp`, 68 pieces cut from it; the skull bandana, gas
mask and rifle were left out, all-ages). Server: `server/domains/play/vault.ts`;
game: `ui/play/modes/vault.ts` (from the Plaza); admin: `/admin/vault`.

- **Six collections** (Legado Obsidiana, Dinastía Celestial, Reino de Sombra,
  Ascenso Real, Ascensión Cyber, Orígenes Míticos), each sold whole at a
  bundle price ($9.99 to $14.99 in gems) to someone who owns none of it yet.
- **Every product says what it is now:** *Disponible ya* (worn today),
  *Solo coleccionable* (owned, its art for the character not made yet) or
  *Modo de juego futuro* (owned, its game mode does not exist yet), and
  where it will be used. A "more game modes coming soon" note heads the
  Vault and its Plaza card.
- **Usable today: two outfits only**, Legado Obsidiana and Reino de Sombra
  (`top:legado_obsidiana`, `top:reino_sombrio`, unlock `vault`). A product
  marked available must unlock a look made for the Vault; the server
  refuses anything else.
- **Nothing special is free**, and the cheapest special piece costs more
  than the dearest ordinary exclusive look (a test checks it). Bigger
  impact, higher price: sprays and plates at the bottom, pets, mounts and
  legendary armour at the top.
- **Numbered editions** (500 of each outfit; 250, 200, 100 and 300 of four
  other pieces) are sold under a lock on the product's row; the next free
  number is taken in the same transaction, and a unique index on product
  and number is the last guard. Six buyers racing for three copies get
  exactly three (test). The stock counter shown is the real count.
- **Pieces not usable yet** are sold only while the owner's switch is on
  (Admin → Diseño del sitio → «Bóveda: piezas que aún no se usan», **off**),
  and only after the disclosure (the owner's text, both languages) is shown
  and the buyer ticks the acknowledgment; the server checks both again.
- **Returns (draft terms, for the owner to approve):** until a piece becomes
  usable it can be returned from the inventory at any time for every gem
  paid; its number goes back on sale. Gems, not money: the owner decides
  whether a refund in money is offered if a mode never ships, and what the
  terms say before the switch is turned on.
- **When a mode ships**, the admin sets its products to *Disponible ya* with
  the look they unlock; every owner has it at once, without paying again
  (`ownedItems` reads the Vault).
- **Nothing that helps win.** The owner asked for a hidden pay-to-win
  element; it was not built: it would deceive players, and it contradicts
  the owner's own brief ("never sell competitive advantages").

## Who sees it

The switch is Admin → Diseño del sitio → Yavaya Play (`play.open`, off by
default: `SITE_LOOK_RULES.play`). While it is off, `/play` is a 404 for
everyone except someone who may manage flags, who sees it marked "Vista
previa". The home page has a door to it while it is open. When open, it is open to
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
