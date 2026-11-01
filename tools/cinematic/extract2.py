"""Cuts each photograph out of the owner's second home page design (31 October
2026, source/home-design-1536x1024.png: the desktop page on the left, the phone
on the right), rebuilds what the interface covered, and enlarges it 4x.

    ./venv/bin/python extract2.py [--preview] [region ...]

Same method as extract.py: a crop inside the card's border, a mask of whatever
the design drew over the photograph (words, buttons, emblems, arrows, rounded
corners), LaMa under the mask, then Real-ESRGAN x4. `--preview` only writes the
masks over the crops (masters2/<name>-preview.png), to check them by eye first.

Two regions are not photographs behind an interface but marks in their own
right, cut whole and kept whole: the sun of the logo and Santuario's round
emblem. Nothing is rebuilt in them; outside their circle becomes transparent.

Coordinates are the design's pixels.
"""
import sys
from PIL import Image, ImageDraw

HERE = __file__.rsplit('/', 1)[0]
DESIGN = HERE + '/source/home-design-1536x1024.png'
OUT = HERE + '/masters2/'


def box(x0, y0, x1, y1):
    return ('box', (x0, y0, x1, y1))


def circle(cx, cy, r):
    return ('circle', (cx - r, cy - r, cx + r, cy + r))


# name: (crop box, overlays in design pixels, corner radius to rebuild).
# An emblem's circle is drawn wider than the emblem: its ring glows past its edge, and
# a mask that stops at the ring leaves LaMa enough of the glow to paint a ghost disc back.
REGIONS = {
    # The hero and the start of the districts section are one photograph in the design.
    'hero': ((0, 0, 1220, 494), [
        box(64, 6, 298, 60),       # sun and wordmark
        box(68, 62, 282, 96),      # tagline and its rule
        box(320, 12, 550, 55),     # location
        box(598, 20, 848, 48),     # Explorar, Sobre Yavaya, Ayuda
        box(886, 10, 1190, 58),    # search, menu, Entrar, Crear cuenta
        box(66, 98, 460, 254),     # headline
        box(68, 256, 394, 330),    # lead
        box(104, 330, 1134, 396),  # search bar and its glow
        box(72, 402, 300, 423),    # eyebrow
        box(70, 420, 490, 469),    # "Todo lo que necesitas."
        box(72, 466, 377, 493),    # "Siete distritos. Una sola comunidad."
        box(1006, 423, 1183, 479), # "Explorar todos"
    ], 0),
    'district-mercadito': ((79, 501, 444, 636), [circle(119, 598, 45), box(170, 571, 300, 635), circle(413.5, 612, 22)], 6),
    'district-services': ((460, 501, 809, 636), [circle(509, 598, 43), box(553, 571, 696, 635), circle(782.5, 612, 22)], 6),
    'district-work': ((824, 501, 1172, 636), [circle(874, 598, 43), box(919, 576, 1066, 636), circle(1136, 612, 22)], 6),
    # The courier's box carried garbled letters under its sun: rebuilt away.
    'district-yavayago': ((79, 650, 335, 799), [circle(121, 759.5, 44), box(164, 736, 266, 799), circle(310, 774.5, 22), box(250, 732, 281, 744)], 6),
    'district-community': ((351, 650, 623, 799), [circle(399, 759.5, 44), box(444, 739, 569, 789), circle(597.5, 774.5, 22)], 6),
    'district-sanctuary': ((639, 650, 907, 799), [circle(684.5, 762.5, 46), box(728, 736, 819, 799), circle(874.5, 774.5, 22)], 6),
    'district-animals': ((922, 650, 1173, 799), [circle(970, 760.5, 44), box(1011, 736, 1109, 799), circle(1147, 774.5, 22)], 6),
    # The closing section's night valley, its words and buttons rebuilt away.
    'closing': ((0, 808, 1220, 1024), [box(343, 812, 927, 1012), box(280, 812, 946, 827)], 0),
}

# Marks cut whole: (crop box, circle radius around the crop's centre).
MARKS = {
    'sun': ((66, 8, 122, 64), 28),
    'sanctuary-emblem': ((647, 725, 722, 800), 35.5),
}


def corner_mask(w, h, r):
    mask = Image.new('L', (w, h), 0)
    if not r:
        return mask
    draw = ImageDraw.Draw(mask)
    for (x0, y0, x1, y1), (cx, cy) in (((0, 0, r, r), (r, r)), ((w - r, 0, w, r), (w - r, r)), ((0, h - r, r, h), (r, h - r)), ((w - r, h - r, w, h), (w - r, h - r))):
        corner = Image.new('L', (w, h), 0)
        cd = ImageDraw.Draw(corner)
        cd.rectangle((x0, y0, x1, y1), fill=255)
        cd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=0)
        mask.paste(255, mask=corner)
    return mask


def region_mask(name):
    (x0, y0, x1, y1), overlays, radius = REGIONS[name]
    w, h = x1 - x0, y1 - y0
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for kind, (a, b, c, d) in overlays:
        rel = (a - x0, b - y0, c - x0, d - y0)
        if kind == 'box':
            draw.rounded_rectangle(rel, radius=6, fill=255)
        else:
            draw.ellipse(rel, fill=255)
    mask.paste(255, mask=corner_mask(w, h, radius))
    return mask


def preview(design, names):
    for name in names:
        crop = design.crop(REGIONS[name][0])
        mask = region_mask(name)
        tint = Image.new('RGB', crop.size, (255, 0, 160))
        shown = Image.composite(Image.blend(crop, tint, 0.55), crop, mask)
        shown.resize((shown.width * 2, shown.height * 2), Image.LANCZOS).save(OUT + f'{name}-preview.png')
        print('preview', name, crop.size)


def main(args):
    design = Image.open(DESIGN).convert('RGB')
    only_preview = '--preview' in args
    names = [a for a in args if not a.startswith('--')] or list(REGIONS) + list(MARKS)
    regions = [n for n in names if n in REGIONS]
    marks = [n for n in names if n in MARKS]
    if only_preview:
        preview(design, regions)
        return
    sys.path.insert(0, HERE)
    from lama import inpaint
    import sr
    net = sr.load(HERE + '/models/RealESRGAN_x4plus.pth')
    for name in regions:
        crop = design.crop(REGIONS[name][0])
        mask = region_mask(name)
        mask.save(OUT + f'{name}-mask.png')
        clean = inpaint(crop, mask)
        clean.save(OUT + f'{name}-clean.png')
        big = sr.upscale(net, clean)
        big.save(OUT + f'{name}-x4.png')
        print(name, crop.size, '->', big.size, flush=True)
    for name in marks:
        crop_box, radius = MARKS[name]
        crop = design.crop(crop_box)
        crop.save(OUT + f'{name}-clean.png')
        big = sr.upscale(net, crop)
        big.save(OUT + f'{name}-x4.png')
        print(name, crop.size, '->', big.size, flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
