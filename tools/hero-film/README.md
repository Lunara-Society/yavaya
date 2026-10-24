# The living hero — production source

On a phone, the home page's market street comes alive for seven seconds once
the page has loaded: the street moves past, a couple walks on towards the
church, and the shot slows to rest. It plays once, like the opening shot of a
film (`platform/src/ui/site/hero-film.tsx` says when it plays and why only
once). This folder is how the file was made, so it can be re-made.

## Version 1 (24 October 2026)

- **Clip:** Seedance 2.5 through the owner's Higgsfield account, 720p, 3:4,
  5 s, no sound, image-to-video. First frame: market-2560.webp cut to 3:4
  around the street and the church (x 1055–2131 at full height). The brief:

  > Locked-off cinematic shot: the camera holds almost completely still, with
  > only the slightest slow push-in. Golden hour over a colonial Central
  > American market street. The hanging lanterns glow and flicker gently, the
  > fabric awnings and woven textiles sway softly in a light evening breeze, a
  > few shoppers in the distance walk slowly along the cobblestones, the sun
  > glows low beside the volcano and the clouds drift very slowly. Calm, warm,
  > peaceful atmosphere. Keep the composition, the buildings, the yellow
  > church tower and the volcano exactly as in the image. Photorealistic,
  > natural, subtle motion. No people appearing close to the camera, no text,
  > no captions, no logos.

  It was meant to loop. The model moved the camera far more than asked — a
  steady forward tracking shot behind the couple — and a forward move cannot
  loop without the street jumping back, so the film plays once and comes to
  rest instead. A brief that wants a loop should expect the same and be
  re-rolled until the camera really holds.
- **Inspected frame by frame:** no malformed people, no warped stalls, no
  lettering. The clip ends mid-move, which is why the script eases it to rest.
- **`make_film.py`** turns the clip into
  `platform/public/art/market-film-720.mp4` (720×960, H.264, about 1 MB). The
  header of the script says what each step does; the important one is the
  fit. A video model redraws its first frame — this one came back about 1–2%
  smaller and a little darker than the picture it was given — so the film is
  re-cut through a measured fit to exactly the phone still's rectangle and
  given its grade. Without that, the street jumps as the film fades in.

```bash
pip install numpy pillow imageio-ffmpeg     # imageio-ffmpeg brings an ffmpeg with libx264
python3 tools/hero-film/make_film.py <clip.mp4>
```

## The phone still and the film share one rectangle

`RECT` = x 1063–2128, y 8–1428 of `platform/public/art/market-2560.webp`
(3:4). The phone stills `market-tall-640/800.webp` are cut from it with the
house WebP settings:

```bash
cd platform && node -e "
const sharp = require('sharp');
for (const w of [800, 640]) sharp('public/art/market-2560.webp')
  .extract({ left: 1063, top: 8, width: 1065, height: 1420 })
  .resize({ width: w, kernel: 'lanczos3' })
  .webp({ quality: 74, effort: 6, smartSubsample: true })
  .toFile('public/art/market-tall-' + w + '.webp');"
```

Change the rectangle in one place and change it in all three: `RECT` in
`make_film.py`, the command above, and the comment on `MARKET_TALL_WIDTHS` in
`platform/src/ui/site/art.tsx`. Then re-make both.
