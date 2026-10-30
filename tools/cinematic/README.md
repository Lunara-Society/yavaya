# Home page photographs from the owner's design

The owner's design of the home page (30 October 2026,
`source/home-mockup-1024x1536.png`) is one image, 1024×1536, with every
photograph of the page inside it. This turns each of those photographs into
files the site can serve.

The design is the only source: these pictures exist nowhere at a larger size.
Each one is that design's own pixels, with whatever the design drew over it
(words, buttons, badges, the card's rounded corners) rebuilt away, then
enlarged 4× by a neural network. They are **upscaled, not native**: a 4×
enlargement sharpens edges and invents fine texture, but it cannot add detail
the design never had. The widths published stop at what the enlargement holds.

| Region (mockup pixels) | Rebuilt | 4× master | Published as |
| --- | --- | --- | --- |
| Hero street, 1024×438 | headline, search, shortcuts | 4096×1752 | `home-hero-{960,1600,2560,3840}` |
| Mercadito artisan, 522×237 | two badges, corners | 2088×948 | `home-mercadito-{640,960,1280,1920}` |
| Guide panorama, 946×214 | title, time, play button, one half-covered figure | 3784×856 | `home-guide-{960,1600,2560,3784}` |
| Seven district cards, 230–312 wide | their lettering, corners | 920–1248 wide | `home-d-<district>-{400,640,920}` (top of the picture only: the card's text panel covered the rest) |

All in `platform/public/art/`. Phones keep the earlier upright market picture
in the hero (`market-tall`), because its film starts on exactly that frame
(`platform/src/ui/site/hero-film.tsx`).

## Reproducing

```bash
cd tools/cinematic
python3 -m venv venv
./venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
./venv/bin/pip install numpy pillow
mkdir -p models
curl -L -o models/RealESRGAN_x4plus.pth https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
curl -L -o models/big-lama.pt https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt
./venv/bin/python extract.py          # every region → masters/ (about 3 minutes on 4 CPU cores)
cd ../../platform && node ../tools/cinematic/build.mjs
```

SHA-256 of the weights used:

- `RealESRGAN_x4plus.pth` `4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1`
- `big-lama.pt` `7ba7aa7ac37a4d41fdbbeba3a2af7ead18058552997e3a3cd1a3b2210c9e6b4c`

Both run on the CPU, so the same weights give the same pixels: a rerun of a
region was compared with the first and matched exactly.

- `extract.py` holds every region's crop box and what is masked in it.
- `lama.py` is LaMa inpainting; only masked pixels change.
- `sr.py` is Real-ESRGAN x4plus, tiled.
- `build.mjs` cuts the published widths from the masters, never wider than a master.

`models/`, `masters/` and `venv/` are not committed.
