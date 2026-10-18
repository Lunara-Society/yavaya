# Renders a section's picture (no sound) from timeline.json: sub-pixel Ken Burns on every still,
# dissolves between shots, overlays faded and slid in, a light vignette and film grain on top.
# Frames are computed in float-free uint8 where possible and piped straight into ffmpeg.
import json, glob, os, sys, math, hashlib, subprocess
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
W, H, FPS = 1920, 1080, 30
TL = json.load(open(os.path.join(HERE, "timeline.json")))

_img_cache = {}
def source(src):
    if src in _img_cache:
        return _img_cache[src]
    if src.startswith("ui:"):
        path = os.path.join(HERE, "ov", f"ui_{src[3:]}.png")
    else:
        base, var = (src[:-1], "bcd".index(src[-1]) + 1) if src[-1] in "bcd" else (src, 0)
        files = sorted(glob.glob(os.path.join(HERE, "img", base + "__*.png")))
        path = files[min(var, len(files) - 1)]
    im = cv2.imread(path, cv2.IMREAD_COLOR)
    _img_cache[src] = im
    return im

def rng_for(key, i, src):
    h = hashlib.sha1(f"{key}:{i}:{src}".encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))

def motion(key, i, shot):
    """Zoom in or out, drifting a little; UI screens move less so they stay readable."""
    r = rng_for(key, i, shot["src"])
    ui = shot["src"].startswith("ui:")
    zin = (i % 2 == 0) if not ui else True
    lo, hi = (1.0, 1.055) if ui else (1.02, 1.14)
    z0, z1 = (lo, hi) if zin else (hi, lo)
    ang = r.uniform(0, 2 * math.pi)
    drift = 0.0 if ui else r.uniform(0.25, 0.75)
    return {"z0": z0, "z1": z1, "dx": math.cos(ang) * drift, "dy": math.sin(ang) * drift * 0.6, "ui": ui}

def ease(u):
    u = min(1.0, max(0.0, u))
    return 0.7 * u + 0.3 * (0.5 - 0.5 * math.cos(math.pi * u))

def warp(img, m, u):
    sh, sw = img.shape[:2]
    p = ease(u)
    z = m["z0"] + (m["z1"] - m["z0"]) * p
    vw, vh = sw / z, sh / z
    # centre drifts within the margin the zoom leaves free
    mx, my = (sw - vw) / 2, (sh - vh) / 2
    cx = sw / 2 + m["dx"] * mx * (2 * p - 1)
    cy = sh / 2 + m["dy"] * my * (2 * p - 1) - (0.18 * my if m["ui"] else 0)
    k = W / vw
    M = np.float32([[k, 0, -k * (cx - vw / 2)], [0, k, -k * (cy - vh / 2)]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)

_ov_cache = {}
def overlay_png(path):
    if path not in _ov_cache:
        im = cv2.imread(os.path.join(HERE, path), cv2.IMREAD_UNCHANGED)
        a = im[:, :, 3]
        ys, xs = np.nonzero(a > 2)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = im[y0:y1, x0:x1]
        rgb = crop[:, :, :3].astype(np.float32)
        al = crop[:, :, 3:4].astype(np.float32) / 255.0
        _ov_cache[path] = (y0, x0, rgb * al, al)
    return _ov_cache[path]

def composite(frame, path, opacity, dy=0):
    y0, x0, pre, al = overlay_png(path)
    y0 = int(y0 + dy)
    h, w = al.shape[:2]
    y0c, y1c = max(0, y0), min(H, y0 + h)
    if y1c <= y0c: return
    sl = slice(y0c - y0, y1c - y0)
    region = frame[y0c:y1c, x0:x0 + w].astype(np.float32)
    a = al[sl] * opacity
    region = region * (1 - a) + pre[sl] * opacity
    frame[y0c:y1c, x0:x0 + w] = np.clip(region, 0, 255).astype(np.uint8)

def env(t, o):
    if t < o["t0"] or t > o["t1"]: return 0.0
    a = 1.0 if o["fi"] <= 0 else min(1.0, (t - o["t0"]) / o["fi"])
    b = 1.0 if o["fo"] <= 0 else min(1.0, (o["t1"] - t) / o["fo"])
    return max(0.0, min(a, b))

def finishing():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    vig = np.clip(1.0 - 0.22 * np.clip(d - 0.55, 0, None) ** 1.6, 0.0, 1.0)
    vig3 = cv2.merge([(vig * 255).astype(np.uint8)] * 3)
    r = np.random.default_rng(7)
    grains = []
    for _ in range(8):
        n = r.normal(0, 2.2, (H // 2, W // 2)).astype(np.float32)
        n = cv2.resize(n, (W, H), interpolation=cv2.INTER_LINEAR)
        pos = np.clip(n, 0, 255).astype(np.uint8); neg = np.clip(-n, 0, 255).astype(np.uint8)
        grains.append((cv2.merge([pos] * 3), cv2.merge([neg] * 3)))
    return vig3, grains

def render(key, out_path):
    tl = TL[key]
    shots, xf, total = tl["shots"], tl["xfade"], tl["total"]
    motions = [motion(key, i, s) for i, s in enumerate(shots)]
    vig3, grains = finishing()
    n_frames = int(round(total * FPS))
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "11", "-pix_fmt", "yuv420p", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(n_frames):
        t = f / FPS
        # which shot(s): a dissolve is centred on each cut
        i = max(0, sum(1 for s in shots if s["start"] <= t) - 1)
        def shot_frame(j):
            s = shots[j]
            a0, a1 = s["start"] - xf / 2, s["end"] + xf / 2
            return warp(source(s["src"]), motions[j], (t - a0) / (a1 - a0))
        frame = shot_frame(i)
        if i + 1 < len(shots) and t > shots[i + 1]["start"] - xf / 2:
            w = (t - (shots[i + 1]["start"] - xf / 2)) / xf
            frame = cv2.addWeighted(frame, 1 - w, shot_frame(i + 1), w, 0)
        elif i > 0 and t < shots[i]["start"] + xf / 2:
            w = (t - (shots[i]["start"] - xf / 2)) / xf
            frame = cv2.addWeighted(shot_frame(i - 1), 1 - w, frame, w, 0)
        frame = cv2.multiply(frame, vig3, scale=1 / 255)
        for o in tl["overlays"]:
            e = env(t, o)
            if e <= 0: continue
            if "list" in o:
                lit = sum(1 for x in o["list"] if t >= x)
                prev_t = max([x for x in o["list"] if t >= x], default=None)
                composite(frame, f"ov/list_{lit}.png", e)
                if prev_t is not None and t - prev_t < 0.3 and lit > 0:
                    # brief cross-fade from the previous state so each name glows on
                    composite(frame, f"ov/list_{lit - 1}.png", e * (1 - (t - prev_t) / 0.3))
            else:
                slide = o.get("slide", 0) * (1 - min(1.0, (t - o["t0"]) / max(0.01, o["fi"]))) if o.get("slide") else 0
                composite(frame, o["png"], e, dy=slide)
        g = grains[f % len(grains)]
        frame = cv2.subtract(cv2.add(frame, g[0]), g[1])
        fi, fo = tl["fades"]["in"], tl["fades"]["out"]
        k = 1.0
        if fi > 0 and t < fi: k = min(k, (t / fi) ** 1.4)
        if fo > 0 and t > total - fo: k = min(k, max(0.0, (total - t) / fo))
        if k < 1.0: frame = (frame.astype(np.float32) * k).astype(np.uint8)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    proc.wait()
    return n_frames

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "core"), exist_ok=True)
    for key in sys.argv[1:]:
        import time
        t0 = time.time()
        n = render(key, os.path.join(HERE, "core", f"{key}.mp4"))
        print(key, n, "frames", f"{time.time() - t0:.0f}s", flush=True)
