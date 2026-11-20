# The candle's film

What it is for: `docs/sanctuary/CANDLE.md`. Made on 20 November 2026 with the owner's tools.

## 1. Blender — the candle (`candle.py`)

Blender 4.5, Cycles on the CPU (Eevee needs a GPU), 720 × 1280, transparent background, 24 samples with
OpenImageDenoise (about 20 s a frame on 4 cores):

    blender -b -P candle.py -- frames            # unlit.png, light_0051…0109.png, loop_0000…0119.png, positions.json
    blender -b -P candle.py -- test test         # two quick stills to look at

The flame flickers by a sum of sines with whole numbers of cycles per 120 frames, so the loop closes and the
lighting runs into it (both use the frame number as the phase). `positions.json` says where the wick falls in
the picture; `descent.html` uses it.

## 2. HyperFrames — the surroundings and the light that comes down

`atmosphere.html` (warm dark, distant candles, a light from above, rising lights; `MODE` 'light' or 'loop') and
`descent.html` (the light that lights the wick). Each is a HyperFrames project's `index.html`:

    npx hyperframes@0.9.72 init atmo-light --example blank --resolution portrait   # likewise atmo-loop, descent
    sed "s/const MODE = 'loop';/const MODE = 'light';/" atmosphere.html > atmo-light/index.html
    cp atmosphere.html atmo-loop/index.html; cp descent.html descent/index.html
    (cd atmo-light && npx hyperframes@0.9.72 check && npx hyperframes@0.9.72 render --output ../atmo-light.mp4 --fps 30)   # and the others

## 3. ffmpeg — joined (`compose.py`)

    python3 compose.py frames <dir with the three renders> out     # out/encender.mp4, out/arde.mp4

Atmosphere behind, the candle over it, a bloom taken from the flame's own light (blurred near and far, screened),
the descending light screened on top, a little grain so the dark does not band once compressed.

## 4. The film to send, the stills, the preview background

`share.html` is a HyperFrames project's `index.html` with `film.mp4` beside it (the lighting and two turns of the
loop: `ffmpeg -f concat …`) and the two site fonts (`public/fonts`); `LINE` and `SITE` replaced per language:

    sed -e 's/>LINE</>Encendí una vela por ti</' -e 's/>SITE</>YAVAYA.LAT · SANTUARIO</' share.html > share-es/index.html
    (cd share-es && npx hyperframes@0.9.72 render --output ../share-es.mp4 --fps 30)
    ffmpeg -i share-es.mp4 -vf scale=720:1280 -c:v libx264 -crf 24 -preset slow -movflags +faststart -an compartir-es.mp4

Stills: the lighting's first frame (`apagada.webp`) and the loop's first (`encendida.webp`), WebP quality 80. The
preview background `og.jpg` (1200 × 630): the lit frame, the candle to the right, darkened to the left for words.
