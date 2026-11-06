"""The owner's new Guardian (uploaded 6 Nov 2026): four layers that put back the cut-out exactly.

Every pixel of the cut-out belongs to exactly one layer, unchanged. A wing or the
tail also carries, underneath the layer above it, the fully opaque pixels next to
its edge, so a wing turning a degree never opens a gap; at rest those pixels are
covered by the identical, opaque pixels of the layer on top. The script checks
that the layers composite back to the cut-out exactly at every published size.
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, zoom

# The owner's originals (src/), the 2480 px working copy and BiRefNet's mask (out/) are kept out
# of git (3840 px, about 30 MB); point OWNER_ART at the folder that holds them.
S = os.environ.get('OWNER_ART', 'owner-art')
OUT = '/home/user/yavaya/platform/public/first-light'
src = np.array(Image.open(f'{S}/out/g2_2480.png').convert('RGB')).astype(np.float32)
alpha = np.array(Image.open(f'{S}/out/mask_raw.png')).astype(np.float32) / 255
# The parts, drawn on the artwork (coordinates in its 1932 px preview): the body is the column
# from the crest to the chest, the tail everything below it between the hanging wing feathers,
# and each wing the rest of its side.
_h, _w = alpha.shape
_y, _x = np.mgrid[0:_h, 0:_w].astype(np.float32) * (1932 / _w)
_half = np.interp(_y, [150, 450, 700, 1000, 1150], [300, 300, 330, 330, 300])
_body = (np.abs(_x - 975) < _half) & (_y < 1130)
_tail = ~_body & (_y >= 1130) & (_x > np.interp(_y, [1130, 1250, 1450], [640, 470, 330])) & (_x < np.interp(_y, [1130, 1300], [1330, 1420]))
labels = np.where(_body, 4, np.where(_tail, 3, np.where(_x < 975, 1, 2))).astype(np.uint8)  # 1 wing-l, 2 wing-r, 3 tail, 4 body
# Premultiplied, so downscaling does not bleed the sky's colour into the edges.
pm = np.dstack([src * alpha[..., None], alpha])
ORDER = [('wing-l', 1), ('wing-r', 2), ('tail', 3), ('body', 4)]

def over(dst, rgb, a):
    return rgb * a[..., None] + dst * (1 - a[..., None])

for w in (1240, 840, 560):
    f = w / pm.shape[1]
    small = np.stack([np.array(Image.fromarray(pm[..., c]).resize((w, w), Image.LANCZOS)) for c in range(4)], -1)
    a = np.clip(small[..., 3], 0, 1)
    rgb = np.where(a[..., None] > 1e-4, small[..., :3] / np.maximum(a[..., None], 1e-4), 0)
    rgb8 = np.clip(np.round(rgb), 0, 255).astype(np.uint8)
    a8 = np.clip(np.round(a * 255), 0, 255).astype(np.uint8)
    lab = np.array(Image.fromarray(labels).resize((w, w), Image.NEAREST))
    opaque = a8 == 255
    reach = max(2, round(w * 0.035))
    above = {1: lab >= 3, 2: lab >= 3, 3: lab == 4, 4: np.zeros_like(opaque)}
    layers = {}
    for name, k in ORDER:
        own = lab == k
        under = binary_dilation(own, iterations=reach) & above[k] & opaque
        la = np.where(own, a8, np.where(under, 255, 0)).astype(np.uint8)
        layers[name] = la
        # Pixels a layer does not show carry no colour, so they cost nothing to store.
        im = Image.fromarray(np.dstack([np.where(la[..., None] > 0, rgb8, 0).astype(np.uint8), la]), 'RGBA')
        # AVIF with full colour resolution (4:4:4): the usual 4:2:0 halves the colour detail and
        # visibly softens the gold against the black feathers. WebP (the fallback) is lossless,
        # because lossy WebP is always 4:2:0.
        im.save(f'{OUT}/guardian2-{name}-{w}.webp', 'WEBP', lossless=True, method=6)
        im.save(f'{OUT}/guardian2-{name}-{w}.avif', 'AVIF', quality=88, speed=4, subsampling='4:4:4')
    # The check: the layers, stacked, are the cut-out (8-bit, before encoding).
    for bgc in ((0, 0, 0), (255, 255, 255), (7, 6, 10)):
        bg = np.zeros((w, w, 3), np.float32) + bgc
        comp = bg.copy()
        for name, _ in ORDER:
            comp = over(comp, rgb8.astype(np.float32), layers[name] / 255)
        ref = over(bg, rgb8.astype(np.float32), a8 / 255)
        d = np.abs(comp - ref).max()
        assert d < 1e-3, (w, bgc, d)
    full = Image.fromarray(np.dstack([rgb8, a8]), 'RGBA')
    full.save(f'{S}/out/guardian2-cut-{w}.png')
    sizes = {n: (os.path.getsize(f'{OUT}/guardian2-{n}-{w}.avif') // 1024, os.path.getsize(f'{OUT}/guardian2-{n}-{w}.webp') // 1024) for n, _ in ORDER}
    print(w, 'exact recomposite OK', sizes, flush=True)
