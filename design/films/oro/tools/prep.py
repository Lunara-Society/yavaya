"""Prepare the film's images and particle data from Yavaya's own art.

Run from the film folder:  python3 -I tools/prep.py ../../../mobile

- Roxi: her approved full-length image, graded for the black-and-gold look
  (the purple outfit taken to obsidian, its piping to gold), with her matte as alpha; a blurred copy for depth of field.
- Particles: points sampled on her body (more on her silhouette's edge so the
  outline reads early), each with its depth and colour; points sampled on the
  app's eagle emblem, more where it is bright, so it draws itself in light.
- Data is quantised (uint16 positions, uint8 colours) and written as small JS
  files that set window globals: the film loads them with a script tag.
"""
import base64
import colorsys  # noqa: F401  (kept for readers comparing the HSV maths)
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

MOBILE = Path(sys.argv[1] if len(sys.argv) > 1 else "../../../mobile").resolve()
OUT = Path("assets").resolve()
OUT.mkdir(exist_ok=True)
RNG = np.random.default_rng(20261127)

W, H = 720, 1544  # Roxi's working size (the app's own asset size)
ROXI_POINTS = 64000
EAGLE_POINTS = 34000
EAGLE_SIZE = 768


def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1)
    mn = a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.where(m, d, 1), 0)
    gc = np.where(m, (mx - g) / np.where(m, d, 1), 0)
    bc = np.where(m, (mx - b) / np.where(m, d, 1), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2.0 + rc - bc, 4.0 + gc - rc))
    h = (h / 6.0) % 1.0
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    out = np.zeros(h.shape + (3,))
    for k, (r, g, b) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel, 0], out[sel, 1], out[sel, 2] = r[sel], g[sel], b[sel]
    return out


# ---------- Roxi ----------
src = Image.open(MOBILE / "art/roxi/roxi-source.png").convert("RGB").resize((W, H), Image.LANCZOS)
matte = Image.open(MOBILE / "art/roxi/roxi-matte.png").convert("L").resize((W, H), Image.LANCZOS)
depth = Image.open(MOBILE / "assets/roxi/roxi-depth.webp").convert("L").resize((W, H), Image.BILINEAR)

a = np.asarray(src).astype(np.float32) / 255.0
alpha = np.asarray(matte).astype(np.float32) / 255.0
dep = np.asarray(depth).astype(np.float32) / 255.0

h, s, v = rgb_to_hsv(a)
purple = (h > 0.68) & (h < 0.92) & (s > 0.12)
piping = purple & (v > 0.55) & (s > 0.30)
s2 = np.where(purple, s * 0.10, s)
v2 = np.where(purple, v * 0.78, v)
# The piping turns gold: black and gold is Yavaya's look. Her one touch of
# violet is a faint rim of light added in the film, not her clothes.
GOLD_HUE = 0.115
h2 = np.where(piping, GOLD_HUE, h)
s2 = np.where(piping, 0.62, s2)
v2 = np.where(piping, np.minimum(1.0, v * 1.06), v2)
graded = hsv_to_rgb(h2, s2, v2)
# Warm the light toward gold (highlights more than shadows).
lum = graded.mean(-1, keepdims=True)
warm = np.array([1.05, 1.0, 0.90])
graded = np.clip(graded * (1 - lum * 0.35) + graded * warm * (lum * 0.35), 0, 1)

rgba = np.dstack([graded, alpha])
Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(OUT / "roxi.png", optimize=True)
blur = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(9))
blur.save(OUT / "roxi-blur.png", optimize=True)

# Her hands: the lowest skin-coloured pixels on each side of the body.
cols = np.where(alpha.max(0) > 0.5)[0]
left_x, right_x = cols.min(), cols.max()
hand_rows = np.where(alpha[:, : W // 3].max(1) > 0.5)[0]
print(f"roxi bbox x {left_x}-{right_x}, left-third rows {hand_rows.min()}-{hand_rows.max()}")
skin = (h < 0.12) & (s > 0.18) & (s < 0.65) & (v > 0.35) & (alpha > 0.6)
for name, xs in (("viewer-left hand", slice(0, W // 3)), ("viewer-right hand", slice(2 * W // 3, W))):
    ys, xs_ = np.nonzero(skin[H // 3 :, xs])
    if len(ys):
        y = ys.max() + H // 3
        sel = ys + H // 3 > y - 40
        x = xs_[sel].mean() + (xs.start or 0)
        print(f"{name}: u={x / W:.3f} v={y / H:.3f}")

# Sample her points: area-uniform plus extra on the silhouette edge.
edge = np.asarray(matte.filter(ImageFilter.FIND_EDGES)).astype(np.float32) / 255.0
weight = (alpha > 0.55) * (0.65 + 2.4 * np.clip(edge * 3, 0, 1))
p = weight.ravel() / weight.sum()
idx = RNG.choice(W * H, size=ROXI_POINTS, replace=False, p=p)
ys, xs = np.divmod(idx, W)
jx = RNG.random(ROXI_POINTS)
jy = RNG.random(ROXI_POINTS)
u = (xs + jx) / W
vv = (ys + jy) / H
z = dep[ys, xs]
col = graded[ys, xs]


def pack(name, u, v, z, col):
    q = np.empty((len(u), 3), np.uint16)
    q[:, 0] = np.clip(u * 65535, 0, 65535)
    q[:, 1] = np.clip(v * 65535, 0, 65535)
    q[:, 2] = np.clip(z * 65535, 0, 65535)
    c = np.clip(col * 255, 0, 255).astype(np.uint8)
    blob = q.tobytes() + c.tobytes()
    js = f"window.{name}={{count:{len(u)},data:'{base64.b64encode(blob).decode()}'}};\n"
    (OUT / f"{name.lower()}.js").write_text(js)
    print(f"{name}: {len(u)} points, {len(js) // 1024} KB")


pack("ROXI_POINTS", u, vv, z, col)

# ---------- The eagle emblem ----------
icon = Image.open(MOBILE / "assets/icon.png").convert("RGB").resize((EAGLE_SIZE, EAGLE_SIZE), Image.LANCZOS)
icon.save(OUT / "eagle.png", optimize=True)
e = np.asarray(icon).astype(np.float32) / 255.0
eh, es, ev = rgb_to_hsv(e)
gold = (eh > 0.07) & (eh < 0.17) & (ev > 0.45)
ew = 0.08 + ev**2.2 + gold * 0.9
yy, xx = np.mgrid[0:EAGLE_SIZE, 0:EAGLE_SIZE]
r = np.hypot(xx - EAGLE_SIZE / 2, yy - EAGLE_SIZE / 2) / (EAGLE_SIZE / 2)
ew = ew * np.clip(1.25 - r * 0.55, 0, 1)
ep = ew.ravel() / ew.sum()
eidx = RNG.choice(EAGLE_SIZE * EAGLE_SIZE, size=EAGLE_POINTS, replace=False, p=ep)
eys, exs = np.divmod(eidx, EAGLE_SIZE)
pack(
    "EAGLE_POINTS",
    (exs + RNG.random(EAGLE_POINTS)) / EAGLE_SIZE,
    (eys + RNG.random(EAGLE_POINTS)) / EAGLE_SIZE,
    ev[eys, exs],
    e[eys, exs],
)
