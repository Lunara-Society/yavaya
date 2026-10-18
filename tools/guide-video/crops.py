# Where a 9:16 window sits on each 16:9 still: on the faces when they fit, panning from one to the
# other when they don't, on the most salient region when there are none. Overrides win (crops_fix.json).
import json, os, glob, math
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, "timeline.json")))
CW = 1152 * 9 / 16  # crop width at no zoom, on a 2048x1152 still

def path_of(src):
    base, var = (src[:-1], "bcd".index(src[-1]) + 1) if src[-1] in "bcd" else (src, 0)
    files = sorted(glob.glob(os.path.join(HERE, "img", base + "__*.png")))
    return files[min(var, len(files) - 1)]

MODEL = os.path.join(HERE, "..", "models", "yunet.onnx")
DET = cv2.FaceDetectorYN.create(MODEL, "", (1024, 576), 0.62, 0.3, 5000)

def faces(img):
    s = 1024 / img.shape[1]
    small = cv2.resize(img, (1024, 576))
    found = []
    for flip in (False, True):
        im = cv2.flip(small, 1) if flip else small
        _, det = DET.detect(im)
        for d in (det if det is not None else []):
            x, y, w, h = d[:4]
            if w < 14: continue
            if flip: x = 1024 - x - w
            found.append([x / s, y / s, w / s, h / s])
    # merge overlaps
    out = []
    for f in sorted(found, key=lambda f: -f[2]):
        cx, cy = f[0] + f[2] / 2, f[1] + f[3] / 2
        if all(abs(cx - (o[0] + o[2] / 2)) > o[2] * 0.6 or abs(cy - (o[1] + o[3] / 2)) > o[3] * 0.6 for o in out):
            out.append(f)
    return out

def saliency(img):
    g = cv2.cvtColor(cv2.resize(img, (128, 72)), cv2.COLOR_BGR2GRAY).astype(np.float32)
    F = np.fft.fft2(g)
    la = np.log(np.abs(F) + 1e-6)
    sr = la - cv2.blur(la, (3, 3))
    sal = np.abs(np.fft.ifft2(np.exp(sr + 1j * np.angle(F)))) ** 2
    sal = cv2.GaussianBlur(sal, (0, 0), 3)
    col = sal.sum(axis=0)
    col = col / col.sum()
    xs = (np.arange(128) + 0.5) / 128 * 2048
    mean = float((col * xs).sum())
    std = float(math.sqrt((col * (xs - mean) ** 2).sum()))
    return mean, std

def clampx(x):
    return float(min(2048 - CW / 2, max(CW / 2, x)))

def plan(src):
    img = cv2.imread(path_of(src))
    fs = faces(img)
    if fs:
        # the people the picture is about, not the crowd behind them
        big = max(f[2] for f in fs)
        fs = [f for f in fs if f[2] >= 0.5 * big]
        xs = sorted(f[0] + f[2] / 2 for f in fs)
        ys = [f[1] + f[3] / 2 for f in fs]
        if xs[-1] - xs[0] <= CW * 0.72:
            w = [f[2] for f in fs]
            cx = sum(x * ww for x, ww in zip([f[0] + f[2] / 2 for f in fs], w)) / sum(w)
            return {"x0": clampx(cx - 30), "x1": clampx(cx + 30), "y": float(np.mean(ys)), "why": f"faces:{len(fs)}"}
        return {"x0": clampx(xs[0]), "x1": clampx(xs[-1]), "y": float(np.mean(ys)), "why": f"pan:{len(fs)}"}
    m, sd = saliency(img)
    if sd > 520:
        return {"x0": clampx(m - 160), "x1": clampx(m + 160), "y": 520.0, "why": "sal-wide"}
    return {"x0": clampx(m - 40), "x1": clampx(m + 40), "y": 520.0, "why": "sal"}

if __name__ == "__main__":
    srcs = sorted({s["src"] for k in TL for s in TL[k]["shots"] if not s["src"].startswith("ui:")})
    out = {s: plan(s) for s in srcs}
    json.dump(out, open(os.path.join(HERE, "crops_auto.json"), "w"), indent=1)
    from collections import Counter
    print(len(out), Counter(v["why"].split(":")[0] for v in out.values()))
