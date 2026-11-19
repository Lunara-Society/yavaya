# Yavaya Genesis

The character every Yavaya game draws: one anatomical adult body whose face
and body change shape through sculpted controls, with hair, eyes, teeth and
clothes fitted to it, so they follow every shape and every move by
construction. It replaces the drawn character (`ui/play/character/build.ts`),
whose head was a sphere with a picture on it and whose hair and beards were
shapes placed by hand (diagnosis of 19 November 2026, the owner's
"Yavaya Genesis" brief; decisions in HANDOFF.md).

## Status (19 November 2026)

Phase B, the foundation, is built and behind a switch that is **off**:

- Admin → Diseño del sitio → "Yavaya Genesis" (`play.genesis`). Off, only
  someone who may change switches sees it, at `/play?genesis=1` while signed
  in; everyone else has the drawn character. On, every player has Genesis.
- Every game (Studio, Plaza, Rush, the trials and their ghosts, the shop)
  makes its character through `ui/play/character/make.ts`, which picks one.

Not done yet (the phases in the diagnosis report): facial hair, scalp
shading under hair, blink and smile checked closely, the Genesis Studio
(presets, sliders, face blending), more hairstyles and clothing, glasses and
accessories, face paint as skin designs, a light body for gameplay, the
developer inspector, and the validation suite. Today's looks are mapped onto
Genesis as well as they can be (`config/genesis-looks.ts`): beards, face
paint, prints, glasses and accessories are not drawn yet.

## Provenance and licence

All shapes, the body, its skeleton and weights, and every part come from
**MakeHuman**'s data, released as **CC0** (public domain) by its copyright
holders in September 2020: the base mesh and targets (originally by Manuel
Bastioni, 2014; Data Collection AB, Joel Palmius, Jonas Hauquier), the
proxies, the clothes and textures (the repository's LICENSE.ASSETS.md). Only
their data files are read; none of MakeHuman's program code (AGPL) is used.

The exact sources are pinned in `scripts/genesis/source.ts` (a repository
commit and the asset pack's SHA-256), and every baked file's entry in
`public/play/genesis/v<n>/manifest.json` carries its source, licence and
commit.

## Making the files

```bash
npx tsx scripts/genesis/source.ts   # once: fetch the pinned CC0 data into .genesis-source/ (~400 MB, git-ignored)
npx tsx scripts/genesis/bake.ts     # writes public/play/genesis/v<n>/ and its manifest
```

The baker (`scripts/genesis/`, Yavaya's own code: `mhdata.ts` reads the
formats, `bake.ts` makes the files):

- **The neutral adult** is MakeHuman's default (25 years, half way between its
  female and male, average muscle and weight). Every control in
  `config/genesis.ts` is a pair of morph targets around it ("-" and "+").
- **The skeleton** keeps the 45 bones the moves and the face need; every other
  bone's weights go to its nearest kept ancestor. Its joints are means of body
  vertices, so they follow the shape: the file carries each joint's offset per
  control, and the runtime moves the bones when the shape changes.
- **Fitted parts** (eyes, brows, lashes, teeth, tongue, hair, shoes) place each
  vertex by three body vertices plus an offset, so they follow every control;
  each carries the same morph targets.
- **Garments** are cut from the fitted suit in the base mesh ("helper-tights")
  along the body's own lines (waist, neckline, limb lengths). The skin they
  cover is flagged on the body's vertices (`_GARMENTS`, one bit each in
  `GENESIS_MASK_BITS`), and the runtime leaves out every body triangle whose
  corners are all covered, so skin never shows through.
- **Skin and hair textures** are stored as shading without colour, so the
  game's own colours (every skin tone, every hair colour) come out true.
- Files are compressed (meshopt, WebP). Positions are quantised with one
  scale per file (`quantizationVolume: 'scene'`): parts sharing a skeleton must
  share it.

## The runtime

`ui/play/genesis/character.ts`, behind the same `Character` interface as the
drawn character. Notes for whoever changes it:

- Files load once per page and are shared; each character has its own bones,
  materials and body triangle list.
- **Bind matrices include each file's dequantisation.** When the shape
  changes, bones move and are rebound as `rest⁻¹ × dequantize`; dropping the
  second factor scatters the meshes.
- **The moves are the drawn character's** (`character/pose.ts`). The rest pose
  has the arms out (an A); each limb segment turns down by its correction
  first, so the same angles give the same motion.
- `ready` settles once the core and worn files are in; the trials wait on it
  to cast shadows and to fade a ghost.

The page's security policy allows WebAssembly compilation and `blob:`
connections on `/play` only (`middleware.ts`), for the decoder and the
textures.

## Rolling back

Turn the switch off. Nothing saved changes: Genesis is worked out from the
look each player already has, and that look is untouched.
