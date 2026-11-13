# Yavaya Play

A small world of original games at `/play`, apart from the rest of the
platform: its own full-screen page, its own code (`src/ui/play/`), and a 3D
library (three.js, MIT) that is downloaded only there.

## State: phase A, a first playable

**Yavaya Rush, course one — "La Calle del Mercado".** A third-person obstacle
run: a street, stepping stones over a fountain, swinging market signs, steps
to the roofs, two moving carts, a wide wall or a narrow golden one, a finish
arch. A timer, twenty coins, four checkpoints, a best time.

What is real: the game, on a phone (left thumb steers, the button jumps) and
with a keyboard (arrows or WASD, space, R to restart). Tuned after the
owner's first runs on a real phone: the stick gives most of the speed at a
small push, a tap on the button is a full jump, a jump keeps the run it
started with, and one thumb can leave the stick to press jump.

What is **not** there yet, and is not pretended:

- The best time is kept on the device only (`localStorage`). Nothing is sent
  to the server, there are no accounts in the game, no rankings.
- The coins are counted in a run and mean nothing else. Play Coins — separate
  from the marketplace's tokens, never bought, never transferred, checked by
  the server — are phase C. `course.ts` already holds the number a server
  needs to refuse an impossible time (`MINIMUM_SECONDS`).
- No multiplayer, no chat, no Plaza, no character choices, no Roxi's House.
- It has been played by a script in an emulated phone, not yet on a real one.

## Who sees it

The switch is Admin → Diseño del sitio → Yavaya Play (`play.open`, off by
default: `SITE_LOOK_RULES.play`). While it is off, `/play` is a 404 for
everyone except someone who may manage flags, who sees it marked "Vista
previa". Nothing on the site links to it yet.

## How it is built

- `course.ts` — the course as plain numbers.
- `character.ts` — the character, built from simple shapes in code.
- Every gap is laid out for a jump at a run (about 5.2 m, 1.7 m high): a
  jump taken anywhere near an edge comes down on the next thing, with the
  thumb still pushing forward. The script checks the whole course that way.
- `game.ts` — drawing, movement, collisions (boxes only), camera, controls,
  sounds. A fixed 120 Hz step, so a slow phone plays the same course as a
  fast one. It lowers its own resolution if frames are slow.
- `loader.tsx` — asks the browser for WebGL, then fetches the game.

## Checking it

`node tests/e2e/play.cjs http://127.0.0.1:3000` plays the course from start
to finish with the keyboard: a fall, a full run, the finish panel, a restart.
A flawless run is about 20 seconds; a first human run should be about a
minute. Whether it is *fun* is for a person to say.
