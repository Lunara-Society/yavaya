# Burned-in captions for the 9:16 cuts: short phrases of the narration, the word being spoken in gold.
# Social video autoplays muted, so the words have to be on the picture.
import os, re
from functools import lru_cache
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from timeline import Aligned, norm, VO_OFFSET

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "..", "fonts", "jakarta-800.ttf")
SIZE = 64
MAX_W = 860            # px per line; two lines at most
CENTER_X = 520         # a little left of centre, away from the platforms' icon rail
TOP = 1330             # first line's top
WHITE, GOLD = (255, 255, 255, 255), (247, 211, 92, 255)

def words(key):
    """Display words with the time each is spoken, on the section's timeline."""
    al = Aligned(key)
    off = VO_OFFSET.get(key, 1.4)
    out, idx = [], 0
    for w in al.text.split():
        n = len(norm(w))
        if n == 0:
            if out: out[-1][0] += " " + w
            continue
        out.append([w, off + al.start[idx], off + al.end[idx + n - 1]])
        idx += n
    merged = []
    for w in out:
        if merged and merged[-1][0] == "Yavaya" and w[0].startswith("Go"):
            merged[-1] = ["YavayaGo" + w[0][2:], merged[-1][1], w[2]]
        elif len(merged) >= 2 and merged[-2][0] == "yavaya" and merged[-1][0] == "punto" and w[0].startswith("lat"):
            merged[-2:] = [["yavaya.lat" + w[0][3:], merged[-2][1], w[2]]]
        else:
            merged.append(w)
    return merged

FONT_OBJ = ImageFont.truetype(FONT, SIZE)
TIGHT = SIZE * 0.1   # Jakarta spaces punctuation generously; under a thick outline it reads detached

def split_punct(word):
    m = re.match(r"^(.*?)([.,;:!?…»]+)$", word)
    return (m.group(1), m.group(2)) if m and m.group(1) else (word, "")

def word_w(word):
    core, punct = split_punct(word)
    return FONT_OBJ.getlength(core) + (FONT_OBJ.getlength(punct) - TIGHT if punct else 0)

def text_w(s):
    parts = s.split(" ")
    return sum(word_w(w) for w in parts) + FONT_OBJ.getlength(" ") * (len(parts) - 1)

DANGLING = {"el", "la", "los", "las", "un", "una", "de", "del", "al", "a", "en", "y", "o", "que", "con", "por", "para", "su", "sus", "tu", "tus", "se", "lo", "le", "ni", "es", "como", "sin"}

def chunks(key):
    """Phrases of up to two lines, broken at sentence ends, commas and pauses."""
    ws = words(key)
    out, cur = [], []
    def flush():
        if cur: out.append(cur[:]); cur.clear()
    for i, w in enumerate(ws):
        if cur:
            gap = w[1] - cur[-1][2]
            prev = cur[-1][0]
            line_len = text_w(" ".join(x[0] for x in cur + [w]))
            # never strand a little word at the end of a phrase just because the narrator breathed
            dangling = prev.lower() in DANGLING and line_len <= MAX_W * 1.85
            if re.search(r"[.!?…»]$", prev) or (gap > 0.55 and not dangling) or line_len > MAX_W * 1.85 or (re.search(r"[,;:]$", prev) and line_len > MAX_W * 0.9):
                flush()
        cur.append(w)
    flush()
    for j in range(len(out) - 1):
        while len(out[j]) > 1 and out[j][-1][0].lower() in DANGLING and len(out[j + 1]) < 8:
            out[j + 1].insert(0, out[j].pop())
    res = []
    for j, c in enumerate(out):
        t0 = c[0][1] - 0.08
        nxt = out[j + 1][0][1] - 0.08 if j + 1 < len(out) else c[-1][2] + 0.7
        t1 = min(nxt, c[-1][2] + 0.9)
        res.append({"t0": t0, "t1": t1, "words": c})
    return res

def layout(ws):
    """Greedy two-line wrap; returns lines of word indices."""
    lines, cur = [], []
    for i, w in enumerate(ws):
        trial = " ".join(ws[k][0] for k in cur + [i])
        if cur and text_w(trial) > MAX_W:
            lines.append(cur); cur = [i]
        else:
            cur.append(i)
    lines.append(cur)
    return lines

@lru_cache(maxsize=64)
def render_chunk(key, ci, active):
    """RGBA image of a phrase with word `active` in gold, plus its top-left position."""
    ch = CHUNKS[key][ci]
    ws = ch["words"]
    lines = layout(ws)
    lh = int(SIZE * 1.22)
    pad = 30
    wmax = int(max(text_w(" ".join(ws[k][0] for k in ln)) for ln in lines)) + 2 * pad
    hh = lh * len(lines) + 2 * pad
    img = Image.new("RGBA", (wmax, hh), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (wmax, hh), (0, 0, 0, 0))
    d, sd = ImageDraw.Draw(img), ImageDraw.Draw(shadow)
    for li, ln in enumerate(lines):
        lw = text_w(" ".join(ws[k][0] for k in ln))
        x = (wmax - lw) / 2
        y = pad + li * lh
        for k in ln:
            core, punct = split_punct(ws[k][0])
            fill = GOLD if k == active else WHITE
            for piece, px in ((core, x), (punct, x + FONT_OBJ.getlength(core) - TIGHT)):
                if not piece: continue
                sd.text((px, y + 4), piece, font=FONT_OBJ, fill=(0, 0, 0, 230))
                d.text((px, y), piece, font=FONT_OBJ, fill=fill, stroke_width=4, stroke_fill=(10, 14, 24, 235))
            x += word_w(ws[k][0]) + FONT_OBJ.getlength(" ")
    shadow = shadow.filter(ImageFilter.GaussianBlur(9))
    out = Image.alpha_composite(shadow, img)
    a = np.array(out)
    rgb = cv2.cvtColor(a[:, :, :3], cv2.COLOR_RGB2BGR).astype(np.float32)
    al = a[:, :, 3:4].astype(np.float32) / 255.0
    return int(CENTER_X - wmax / 2), TOP - pad, rgb * al, al

CHUNKS = {}
def state(key, t):
    """(chunk index, active word, opacity) at time t, or None."""
    if key not in CHUNKS:
        CHUNKS[key] = chunks(key)
    for ci, ch in enumerate(CHUNKS[key]):
        if ch["t0"] <= t < ch["t1"]:
            ws = ch["words"]
            active = max([i for i, w in enumerate(ws) if w[1] - 0.04 <= t] or [0])
            op = min(1.0, (t - ch["t0"]) / 0.12, (ch["t1"] - t) / 0.12)
            return ci, active, max(0.0, op)
    return None

if __name__ == "__main__":
    import sys
    for key in sys.argv[1:] or ["mercadito"]:
        CHUNKS[key] = chunks(key)
        for c in CHUNKS[key][:12]:
            print(f"{c['t0']:6.2f}-{c['t1']:6.2f}", " ".join(w[0] for w in c["words"]))
        print(key, len(CHUNKS[key]), "phrases")
