"""Cuts each photograph out of the home page mockup, rebuilds what its
interface covered, and enlarges it 4x.

    ./venv/bin/python extract.py [region ...]

For every region: a tight crop inside the card's border, a mask of whatever
the mockup drew over the photograph (words, buttons, badges, the card's
rounded corners), LaMa to rebuild under the mask, then Real-ESRGAN x4.
Writes into masters/ (not committed):
  <name>-mask.png   what was rebuilt (white)
  <name>-clean.png  the mockup's own pixels, overlays rebuilt, at mockup size
  <name>-x4.png     the same, enlarged 4x: the master build.mjs cuts sizes from

Coordinates are the mockup's pixels (source/home-mockup-1024x1536.png).
"""
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from lama import inpaint  # noqa: E402
import sr  # noqa: E402

HERE = __file__.rsplit('/', 1)[0]
MOCKUP = HERE + '/source/home-mockup-1024x1536.png'
OUT = HERE + '/masters/'

# name: (crop box in the mockup, overlays as boxes inside the crop, corner radius to rebuild).
# A district card's text panel covers its lower half; only the top is used (build.mjs).
# The guide's fourth box is a figure the title had half covered: rebuilt whole, not left as a stump.
ROW1 = [(10, 116, 230, 199)]
ROW2 = [(8, 106, 310, 193)]
REGIONS = {
    'hero': ((0, 62, 1024, 500), [(80, 30, 482, 296), (80, 300, 650, 360), (78, 365, 932, 424)], 0),
    'mercadito': ((41, 508, 563, 745), [(14, 10, 134, 50), (422, 6, 513, 34)], 14),
    'guide': ((39, 757, 985, 971), [(856, 8, 934, 39), (28, 112, 432, 205), (794, 140, 935, 202), (310, 84, 378, 208)], 13),
    'district-mercadito': ((31, 1051, 261, 1255), ROW1, 13),
    # The jar at the right edge carried three garbled letters: rebuilt away.
    'district-services': ((274, 1051, 505, 1255), ROW1 + [(201, 95, 227, 113)], 13),
    'district-work': ((519, 1051, 750, 1255), ROW1, 13),
    'district-yavayago': ((764, 1051, 994, 1255), ROW1, 13),
    'district-community': ((31, 1266, 342, 1456), ROW2, 13),
    'district-sanctuary': ((357, 1266, 668, 1456), ROW2, 13),
    'district-animals': ((682, 1266, 994, 1456), ROW2, 13),
}


def corner_mask(w, h, r):
    """The four rounded corners of a card: outside the quarter circle is the page, not the picture."""
    mask = Image.new('L', (w, h), 0)
    if not r:
        return mask
    draw = ImageDraw.Draw(mask)
    # +2: the card's border line runs just inside the curve.
    r2 = r + 2
    for cx, cy, box in ((r2, r2, (0, 0, r2, r2)), (w - r2, r2, (w - r2, 0, w, r2)), (r2, h - r2, (0, h - r2, r2, h)), (w - r2, h - r2, (w - r2, h - r2, w, h))):
        corner = Image.new('L', (w, h), 0)
        cd = ImageDraw.Draw(corner)
        cd.rectangle(box, fill=255)
        cd.ellipse((cx - r2 + 2, cy - r2 + 2, cx + r2 - 2, cy + r2 - 2), fill=0)
        mask.paste(255, mask=corner)
    return mask


def main(names):
    mockup = Image.open(MOCKUP).convert('RGB')
    net = sr.load(HERE + '/models/RealESRGAN_x4plus.pth')
    for name in names:
        box, overlays, radius = REGIONS[name]
        crop = mockup.crop(box)
        w, h = crop.size
        mask = Image.new('L', (w, h), 0)
        draw = ImageDraw.Draw(mask)
        for overlay in overlays:
            draw.rounded_rectangle(overlay, radius=6, fill=255)
        mask.paste(255, mask=corner_mask(w, h, radius))
        mask.save(OUT + f'{name}-mask.png')
        clean = inpaint(crop, mask)
        clean.save(OUT + f'{name}-clean.png')
        big = sr.upscale(net, clean)
        big.save(OUT + f'{name}-x4.png')
        print(name, crop.size, '->', big.size, flush=True)


if __name__ == '__main__':
    main(sys.argv[1:] or list(REGIONS))
