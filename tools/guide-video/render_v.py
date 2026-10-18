# The 9:16 picture, from the same timeline as the 16:9 cut: every still re-framed on its subject
# (crops_auto.json + crops_fix.json), panning when two subjects don't fit, real screens as large
# browser cards, vertical overlays and burned-in captions. Sound is added at assembly.
import json, glob, os, sys, math, subprocess, time
import numpy as np, cv2
import captions_v as cap

HERE = os.path.dirname(os.path.abspath(__file__))
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
W, H, FPS = 1080, 1920, 30
TL = json.load(open(os.path.join(HERE, "timeline.json")))
TEASER_START = 3.0
CROPS = json.load(open(os.path.join(HERE, "crops_auto.json")))
CROPS.update(json.load(open(os.path.join(HERE, "crops_fix.json"))))

_img = {}
def source(src):
    if src not in _img:
        if src.startswith("ui:"):
            path = os.path.join(HERE, "ov_v", f"ui_{src[3:]}.png")
        else:
            base, var = (src[:-1], "bcd".index(src[-1]) + 1) if src[-1] in "bcd" else (src, 0)
            files = sorted(glob.glob(os.path.join(HERE, "img", base + "__*.png")))
            path = files[min(var, len(files) - 1)]
        _img[src] = cv2.imread(path, cv2.IMREAD_COLOR)
    return _img[src]

def ease(u):
    u = min(1.0, max(0.0, u))
    return 0.5 - 0.5 * math.cos(math.pi * u)

def warp(img, src, i, u):
    sh, sw = img.shape[:2]
    p = ease(u)
    if src.startswith("ui:"):
        z = 1.0 + 0.04 * p
        vw, vh = sw / z, sh / z
        cx, cy = sw / 2, sh * 0.42 + (sh / 2 - sh * 0.42) / z
    else:
        c = CROPS[src]
        z = (1.0 + 0.06 * p) if i % 2 == 0 else (1.06 - 0.06 * p)
        vh = sh / z
        vw = vh * W / H
        cx = c["x0"] + (c["x1"] - c["x0"]) * p
        cx = min(sw - vw / 2, max(vw / 2, cx))
        slack = (sh - vh) / 2
        cy = sh / 2 + max(-slack, min(slack, (c.get("y", sh / 2) - sh / 2)))
    k = W / vw
    M = np.float32([[k, 0, -k * (cx - vw / 2)], [0, k, -k * (cy - vh / 2)]])
    out = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    if not src.startswith("ui:"):
        # the stills are enlarged ~1.7x for the tall frame: a light unsharp mask restores the edge
        out = cv2.addWeighted(out, 1.32, cv2.GaussianBlur(out, (0, 0), 1.3), -0.32, 0)
    return out

_ov = {}
def overlay_png(path):
    if path not in _ov:
        im = cv2.imread(os.path.join(HERE, path), cv2.IMREAD_UNCHANGED)
        a = im[:, :, 3]
        ys, xs = np.nonzero(a > 2)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = im[y0:y1, x0:x1]
        al = crop[:, :, 3:4].astype(np.float32) / 255.0
        _ov[path] = (y0, x0, crop[:, :, :3].astype(np.float32) * al, al)
    return _ov[path]

def blend(frame, y0, x0, pre, al, opacity):
    h, w = al.shape[:2]
    y0c, y1c = max(0, y0), min(H, y0 + h)
    x0c, x1c = max(0, x0), min(W, x0 + w)
    if y1c <= y0c or x1c <= x0c: return
    sy, sx = slice(y0c - y0, y1c - y0), slice(x0c - x0, x1c - x0)
    region = frame[y0c:y1c, x0c:x1c].astype(np.float32)
    a = al[sy, sx] * opacity
    frame[y0c:y1c, x0c:x1c] = np.clip(region * (1 - a) + pre[sy, sx] * opacity, 0, 255).astype(np.uint8)

def composite(frame, path, opacity, dy=0):
    y0, x0, pre, al = overlay_png(path)
    blend(frame, int(y0 + dy), x0, pre, al, opacity)

def env(t, o):
    if t < o["t0"] or t > o["t1"]: return 0.0
    a = 1.0 if o["fi"] <= 0 else min(1.0, (t - o["t0"]) / o["fi"])
    b = 1.0 if o["fo"] <= 0 else min(1.0, (o["t1"] - t) / o["fo"])
    return max(0.0, min(a, b))

def finishing():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    vig = np.clip(1.0 - 0.22 * np.clip(d - 0.6, 0, None) ** 1.6, 0.0, 1.0)
    vig3 = cv2.merge([(vig * 255).astype(np.uint8)] * 3)
    r = np.random.default_rng(7)
    grains = []
    for _ in range(8):
        n = cv2.resize(r.normal(0, 2.2, (H // 2, W // 2)).astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
        grains.append((cv2.merge([np.clip(n, 0, 255).astype(np.uint8)] * 3), cv2.merge([np.clip(-n, 0, 255).astype(np.uint8)] * 3)))
    return vig3, grains

def vpath(p):
    return p.replace("ov/", "ov_v/", 1)

def render(key, out_path, until=None, t_start=0.0, fade_in=None):
    tl = TL[key]
    shots, xf, total = tl["shots"], tl["xfade"], tl["total"]
    vig3, grains = finishing()
    n_frames = int(round(((until or total) - t_start) * FPS))
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(n_frames):
        t = t_start + f / FPS
        i = max(0, sum(1 for s in shots if s["start"] <= t) - 1)
        def shot_frame(j):
            s = shots[j]
            a0, a1 = s["start"] - xf / 2, s["end"] + xf / 2
            return warp(source(s["src"]), s["src"], j, (t - a0) / (a1 - a0))
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
                composite(frame, f"ov_v/list_{lit}.png", e)
                if prev_t is not None and t - prev_t < 0.3 and lit > 0:
                    composite(frame, f"ov_v/list_{lit - 1}.png", e * (1 - (t - prev_t) / 0.3))
            elif "end_final" in o["png"]:
                composite(frame, vpath(o["png"]), e)
            else:
                slide = o.get("slide", 0) * (1 - min(1.0, (t - o["t0"]) / max(0.01, o["fi"]))) if o.get("slide") else 0
                composite(frame, vpath(o["png"]), e, dy=slide)
        st = cap.state(key, t)
        if st:
            ci, active, op = st
            x0, y0, pre, al = cap.render_chunk(key, ci, active)
            blend(frame, y0, x0, pre, al, op)
        g = grains[f % len(grains)]
        frame = cv2.subtract(cv2.add(frame, g[0]), g[1])
        fi, fo = (tl["fades"]["in"] if fade_in is None else fade_in), tl["fades"]["out"]
        k = 1.0
        if fi > 0 and t - t_start < fi: k = min(k, ((t - t_start) / fi) ** 1.4)
        if fo > 0 and t > total - fo: k = min(k, max(0.0, (total - t) / fo))
        if k < 1.0: frame = (frame.astype(np.float32) * k).astype(np.uint8)
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    proc.wait()
    return n_frames

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "core_v"), exist_ok=True)
    args = sys.argv[1:]
    until = None
    if args and args[0].startswith("--until="):
        until = float(args.pop(0).split("=")[1])
    if args and args[0] == "--teaser":
        # the intro on its own for social media: no slow fade from black, in a beat before the first word
        t0 = time.time()
        n = render("intro", os.path.join(HERE, "core_v", "intro-teaser.mp4"), None, TEASER_START, 0.25)
        print("teaser", n, "frames", f"{time.time() - t0:.0f}s", flush=True)
        args = []
    for key in args:
        t0 = time.time()
        n = render(key, os.path.join(HERE, "core_v", f"{key}{'-test' if until else ''}.mp4"), until)
        print(key, n, "frames", f"{time.time() - t0:.0f}s", flush=True)
