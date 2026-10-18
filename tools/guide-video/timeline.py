# Turns the plan into times. The narration's word timestamps (local Whisper) are aligned to the
# script, so a shot or a callout lands on the exact word it illustrates.
import json, re, unicodedata, difflib, glob, os
from plan import SECTIONS, ORDER

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = {x["key"]: x for x in json.load(open(os.path.join(HERE, "scripts.json")))}
TAKES = json.load(open(os.path.join(HERE, "best_takes.json")))

VO_OFFSET = {"intro": 4.0, "cierre": 0.8}   # districts: 1.4 s of title card before the voice
TAIL = {"intro": 1.4, "cierre": 6.5}        # districts: 4.6 s after the voice (end card in the standalone cut)
LEAD = 0.18                                 # cut a hair before the word, as an editor would
CALLOUT_SECONDS = 3.8

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9ñ]+", s)

def clean_tts(text):
    return re.sub(r"\[[^\]]+\]\s*", "", text)

class Aligned:
    def __init__(self, key):
        self.key = key
        self.vo = os.path.join(HERE, TAKES[key])
        words = json.load(open(self.vo.replace(".mp3", ".words.json")))
        self.asr = words
        self.text = clean_tts(SCRIPTS[key]["tts"])
        self.tokens = norm(self.text)
        hyp = [norm(w["w"]) for w in words]
        flat, owner = [], []
        for i, h in enumerate(hyp):
            for t in h:
                flat.append(t); owner.append(i)
        sm = difflib.SequenceMatcher(a=self.tokens, b=flat, autojunk=False)
        start = [None] * len(self.tokens)
        end = [None] * len(self.tokens)
        for a, b, n in sm.get_matching_blocks():
            for k in range(n):
                w = words[owner[b + k]]
                start[a + k], end[a + k] = w["s"], w["e"]
        # unmatched tokens: interpolate between the nearest matched neighbours
        known = [i for i, v in enumerate(start) if v is not None]
        for i in range(len(start)):
            if start[i] is None:
                lo = max([k for k in known if k < i], default=None)
                hi = min([k for k in known if k > i], default=None)
                if lo is None: start[i] = end[i] = start[hi]
                elif hi is None: start[i] = end[i] = end[lo]
                else:
                    f = (i - lo) / (hi - lo)
                    start[i] = end[lo] + f * (start[hi] - end[lo]); end[i] = start[i]
        self.start, self.end = start, end
        self.duration = words[-1]["e"]
        self.cursor = 0

    def find(self, phrase, ordered=True):
        p = norm(phrase)
        if not p:
            return 0.0
        rng = range(self.cursor if ordered else 0, len(self.tokens) - len(p) + 1)
        for i in rng:
            if self.tokens[i:i + len(p)] == p:
                if ordered: self.cursor = i
                return self.start[i]
        raise KeyError(f"{self.key}: phrase not found after cursor: {phrase!r}")

    def sentences(self):
        """Caption cues: sentence by sentence, long ones split at a comma."""
        parts = re.split(r"(?<=[.!?…])\s+", self.text.strip())
        cues, idx = [], 0
        for part in parts:
            n = len(norm(part))
            if n == 0: continue
            chunks = [part]
            if len(part) > 90:
                chunks, cur = [], ""
                for piece in re.split(r"(?<=[,:;])\s+", part):
                    if cur and len(cur) + len(piece) > 84:
                        chunks.append(cur); cur = piece
                    else:
                        cur = (cur + " " + piece).strip()
                if cur: chunks.append(cur)
            for ch in chunks:
                m = len(norm(ch))
                if m == 0: continue
                s, e = self.start[idx], self.end[idx + m - 1]
                cue = ch.replace("Yavaya Go", "YavayaGo").replace("yavaya punto lat", "yavaya.lat")
                cues.append((s, e, cue))
                idx += m
        return cues

def variants(src):
    base = src[:-1] if src[-1] in "bcd" and not src.startswith("ui:") and glob.glob(os.path.join(HERE, "img", src[:-1] + "__*.png")) else src
    n = len(glob.glob(os.path.join(HERE, "img", base + "__*.png")))
    return [base] + [base + c for c in "bcd"[:max(0, n - 1)]]

def split_long(shots, sec, max_len=6.2):
    """A long hold becomes a second (and third) angle of the same scene: the other variation."""
    out = []
    for s in shots:
        d = s["end"] - s["start"]
        if s["src"].startswith("ui:"):
            if d > 8.5:  # a screen holds long enough to read, then the story moves on
                cut = s["start"] + 6.0
                alt = variants(sec["bg"])
                out += [{"start": s["start"], "end": cut, "src": s["src"]}, {"start": cut, "end": s["end"], "src": alt[-1]}]
            else:
                out.append(s)
            continue
        if d <= max_len:
            out.append(s); continue
        vs = variants(s["src"])
        first = vs.index(s["src"]) if s["src"] in vs else 0
        order = vs[first:] + vs[:first]
        n = min(len(order) + 1, int(d // 4.6) + 1) if len(order) > 1 else 1
        n = max(1, n)
        step = d / n
        for k in range(n):
            out.append({"start": s["start"] + k * step, "end": s["start"] + (k + 1) * step, "src": order[k % len(order)]})
    return out

def build(key):
    sec = SECTIONS[key]
    al = Aligned(key)
    off = VO_OFFSET.get(key, 1.4)
    total = off + al.duration + TAIL.get(key, 4.6)
    xf = sec.get("xfade", 0.7)
    min_shot = sec.get("min_shot", 1.8)

    raw = []
    for phrase, src in sec["shots"]:
        t = 0.0 if phrase == "" else max(0.0, off + al.find(phrase) - LEAD)
        raw.append((t, src))
    shots = []
    for i, (t, src) in enumerate(raw):
        if shots:
            t = max(t, shots[-1]["start"] + min_shot)
            nxt = raw[i + 1][0] if i + 1 < len(raw) else total
            if t > nxt - 0.4 or t > total - 1.0:
                continue  # no room: this picture would flash by
        shots.append({"start": t, "src": src})
    for i, s in enumerate(shots):
        s["end"] = shots[i + 1]["start"] if i + 1 < len(shots) else total
    shots = split_long(shots, sec)

    overlays = []
    if sec["title"]:
        overlays.append({"png": f"ov/title_{key}.png", "t0": 0.35, "t1": off + 2.9, "fi": 0.7, "fo": 0.8, "slide": 0})
    al.cursor = 0
    for i, (phrase, _) in enumerate(sec["callouts"]):
        t = off + al.find(phrase, ordered=False)
        overlays.append({"png": f"ov/call_{key}_{i}.png", "t0": t, "t1": t + CALLOUT_SECONDS, "fi": 0.35, "fo": 0.45, "slide": 16})
    # keep callouts from stacking: each waits for the previous one to leave
    calls = [o for o in overlays if "call_" in o["png"]]
    calls.sort(key=lambda o: o["t0"])
    for a, b in zip(calls, calls[1:]):
        if b["t0"] < a["t1"] + 0.2:
            a["t1"] = max(a["t0"] + 2.2, b["t0"] - 0.2)
            if b["t0"] < a["t1"] + 0.2:
                b["t0"] = a["t1"] + 0.2; b["t1"] = b["t0"] + CALLOUT_SECONDS
    if key == "intro":
        al.cursor = 0
        t_start = off + al.find("Vamos a pasear") - 0.4
        names = ["Mercadito", "Servicios", "Trabajo", "Yavaya Go", "Comunidad", "Espacio Violeta", "Santuario", "Animales", "la confianza"]
        lights = [off + al.find(n) for n in names]
        t_end = off + al.find("Lista") - 0.2
        overlays.append({"list": lights, "t0": t_start, "t1": t_end, "fi": 0.6, "fo": 0.7})
    if key == "cierre":
        overlays.append({"png": "ov/end_final.png", "t0": off + al.duration + 0.4, "t1": total + 1, "fi": 1.0, "fo": 0.0, "slide": 0})

    fades = {"in": 3.6 if key == "intro" else 0.0, "out": 1.6 if key == "cierre" else 0.0}
    cues = [(off + s, off + e, txt) for s, e, txt in al.sentences()]
    return {"key": key, "vo": al.vo, "vo_offset": off, "vo_duration": al.duration, "total": total, "xfade": xf,
            "shots": shots, "overlays": overlays, "fades": fades, "cues": cues}

if __name__ == "__main__":
    import sys
    keys = sys.argv[1:] or ORDER
    out = {}
    for k in keys:
        tl = build(k)
        out[k] = tl
        durs = [round(s["end"] - s["start"], 1) for s in tl["shots"]]
        print(f"{k:10} total={tl['total']:.1f}s shots={len(tl['shots'])}/{len(SECTIONS[k]['shots'])} min={min(durs)} max={max(durs)} overlays={len(tl['overlays'])}")
    json.dump(out, open(os.path.join(HERE, "timeline.json"), "w"), ensure_ascii=False, indent=1)
