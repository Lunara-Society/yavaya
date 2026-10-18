# Sound for every cut. One continuous score runs under the whole guide (extended past its ten minutes
# by a single beat-matched jump hidden at a section change); each district video takes its own
# slice of that same score, so it sounds identical on its page and inside the full guide.
# Music ducks under the voice with a smooth envelope and swells in the breaths between lines.
import json, os, subprocess, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
SR = 48000
TL = json.load(open(os.path.join(HERE, "timeline.json")))
from plan import ORDER, SECTIONS

XF = 1.2          # dissolve between sections in the full guide
GAP = 1.3         # picture held after a section's last word before the next one dissolves in

def load(path, channels):
    raw = subprocess.run([FF, "-v", "error", "-i", path, "-f", "f32le", "-ac", str(channels), "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32)
    return a.reshape(-1, channels) if channels > 1 else a

def rms_db(x):
    return 20 * math.log10(max(1e-9, float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))))

def schedule():
    starts, t = {}, 0.0
    cuts = {}
    for i, k in enumerate(ORDER):
        tl = TL[k]
        starts[k] = t
        cut = tl["total"] if k in ("intro", "cierre") else min(tl["total"], tl["vo_offset"] + tl["vo_duration"] + GAP)
        cuts[k] = cut
        t += cut - (XF if i + 1 < len(ORDER) else 0)
    return starts, cuts, t

def onset_env(x, hop=480):
    m = x.mean(axis=1) if x.ndim > 1 else x
    frames = len(m) // hop
    e = np.sqrt(np.mean(m[: frames * hop].reshape(frames, hop) ** 2, axis=1))
    d = np.maximum(0, np.diff(e, prepend=e[0]))
    return d / (d.std() + 1e-9)

def build_music(score, length, starts):
    """Extend the score to `length` seconds with one backward jump at a section boundary."""
    total_score = len(score) / SR
    jump = length - total_score
    if jump <= 0:
        return score[: int(length * SR)], None
    env = onset_env(score)  # 100 frames per second
    best = None
    for k in ORDER[3:-2]:
        a = starts[k] - XF / 2  # under the dissolve into section k
        b = a - jump
        if b < 40: continue
        ia, ib = int(a * 100), int(b * 100)
        # beat alignment: search ±0.6 s around b for the best match of 4 s of onset envelope
        win = env[ia - 200: ia + 200]
        if len(win) < 400 or a > total_score - 8: continue
        scores = []
        for off in range(-60, 61):
            seg = env[ib + off - 200: ib + off + 200]
            if len(seg) == len(win): scores.append((float(np.dot(win, seg)), off))
        if not scores: continue
        corr, off = max(scores)
        lvl = abs(rms_db(score[int((a - 3) * SR): int((a + 3) * SR)]) - rms_db(score[int((b + off / 100 - 3) * SR): int((b + off / 100 + 3) * SR)]))
        cand = (corr - 40 * lvl, a, b + off / 100, k, lvl)
        if best is None or cand[0] > best[0]: best = cand
    _, a, b, k, lvl = best
    fade = 3.0
    ia, ib, nf = int(a * SR), int(b * SR), int(fade * SR)
    head = score[: ia + nf // 2].copy()
    tail = score[ib - nf // 2:].copy()
    w = np.linspace(0, math.pi / 2, nf)[:, None]
    head[-nf:] = head[-nf:] * np.cos(w) + tail[:nf] * np.sin(w)  # equal-power crossfade
    music = np.concatenate([head, tail[nf:]])
    return music[: int(length * SR)], {"at": a, "to": b, "section": k, "level_diff_db": round(lvl, 2)}

def duck_curve(vo, n):
    """1.0 where the voice speaks, 0.0 in silence; fast attack, slow release, then smoothed."""
    hop = 480
    frames = n // hop + 1
    e = np.zeros(frames)
    m = vo[: (len(vo) // hop) * hop].reshape(-1, hop)
    e[: len(m)] = np.sqrt(np.mean(m ** 2, axis=1))
    active = (e > 10 ** (-42 / 20)).astype(np.float64)
    out = np.zeros(frames); g = 0.0
    att, rel = 1 - math.exp(-1 / (0.08 * 100)), 1 - math.exp(-1 / (0.65 * 100))
    for i, a in enumerate(active):
        g += (a - g) * (att if a > g else rel)
        out[i] = g
    curve = np.repeat(out, hop)[:n]
    return curve

def mix(vo_track, music, bed_db=-18.5, duck_db=-12.5):
    n = len(music)
    d = duck_curve(vo_track, n)
    gain = 10 ** ((bed_db + duck_db * d) / 20)
    out = music * gain[:, None] + vo_track[:n, None]
    return out

def loudnorm(inp, out, i=-16.0, tp=-1.5):
    p = subprocess.run([FF, "-hide_banner", "-i", inp, "-af", f"loudnorm=I={i}:TP={tp}:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    js = json.loads(p[p.rindex("{"): p.rindex("}") + 1])
    af = (f"loudnorm=I={i}:TP={tp}:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}"
          f":measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
    subprocess.run([FF, "-v", "error", "-y", "-i", inp, "-af", af + ",aresample=48000", "-c:a", "pcm_s16le", out], check=True)

def write_wav(path, x):
    x = np.clip(x, -1, 1).astype(np.float32)
    subprocess.run([FF, "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "-", "-c:a", "pcm_f32le", path], input=x.tobytes(), check=True)

def vtt_time(s):
    h, rem = divmod(max(0.0, s), 3600); m, sec = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{sec:06.3f}"

def write_vtt(path, cues):
    with open(path, "w") as f:
        f.write("WEBVTT\n\n")
        for i, (s, e, t) in enumerate(cues, 1):
            f.write(f"{i}\n{vtt_time(s)} --> {vtt_time(e + 0.25)}\n{t}\n\n")

if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "audio"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "captions"), exist_ok=True)
    starts, cuts, length = schedule()
    score = load(os.path.join(HERE, "music", "score.mp3"), 2)
    score = score / (10 ** (rms_db(score[int(60 * SR):]) / 20)) * 10 ** (-0 / 20)  # body of the score at 0 dBFS RMS; the bed gain sets the level
    music, jump = build_music(score, length, starts)
    print("guide length", round(length, 1), "s; music jump", jump)

    # voice: each take levelled to the same RMS, placed on the guide timeline
    vos = {}
    for k in ORDER:
        v = load(TL[k]["vo"], 1)
        vos[k] = v / (10 ** (rms_db(v[np.abs(v) > 0.01]) / 20)) * 10 ** (-17 / 20)
    voice = np.zeros(len(music), dtype=np.float32)
    for k in ORDER:
        i0 = int((starts[k] + TL[k]["vo_offset"]) * SR)
        v = vos[k][: len(voice) - i0]
        voice[i0: i0 + len(v)] += v
    full = mix(voice, music)
    # the intro opens on music alone, swelling in from silence
    fin = int(4.0 * SR); full[:fin] *= np.linspace(0, 1, fin)[:, None] ** 1.5
    fout = int(3.0 * SR); full[-fout:] *= np.linspace(1, 0, fout)[:, None]
    write_wav(os.path.join(HERE, "audio", "guia_raw.wav"), full)
    loudnorm(os.path.join(HERE, "audio", "guia_raw.wav"), os.path.join(HERE, "audio", "guia.wav"))

    # each district on its own: the same score slice, faded at both ends
    for k in ORDER[1:-1]:
        tl = TL[k]
        n = int(tl["total"] * SR)
        i0 = int(starts[k] * SR)
        m = music[i0: i0 + n].copy()
        if len(m) < n: m = np.concatenate([m, np.zeros((n - len(m), 2), np.float32)])
        v = np.zeros(n, np.float32)
        j0 = int(tl["vo_offset"] * SR); vv = vos[k][: n - j0]; v[j0: j0 + len(vv)] = vv
        out = mix(v, m)
        a = int(1.0 * SR); out[:a] *= np.linspace(0, 1, a)[:, None]
        b = int(2.6 * SR); out[-b:] *= np.linspace(1, 0, b)[:, None] ** 1.3
        write_wav(os.path.join(HERE, "audio", f"{k}_raw.wav"), out)
        loudnorm(os.path.join(HERE, "audio", f"{k}_raw.wav"), os.path.join(HERE, "audio", f"{k}.wav"))
        write_vtt(os.path.join(HERE, "captions", f"{k}.vtt"), tl["cues"])

    # the full guide: captions on its timeline, and chapters for the player
    allc = []
    for k in ORDER:
        allc += [(starts[k] + s, starts[k] + e, t) for s, e, t in TL[k]["cues"]]
    write_vtt(os.path.join(HERE, "captions", "guia.vtt"), allc)
    with open(os.path.join(HERE, "captions", "guia-chapters.vtt"), "w") as f:
        f.write("WEBVTT\n\n")
        for i, k in enumerate(ORDER):
            end = starts[ORDER[i + 1]] if i + 1 < len(ORDER) else length
            title = SECTIONS[k]["title"] or ("Bienvenida" if k == "intro" else "Bienvenida a casa")
            f.write(f"{i + 1}\n{vtt_time(starts[k])} --> {vtt_time(end)}\n{title}\n\n")
    json.dump({"starts": starts, "cuts": cuts, "length": length, "xfade": XF, "jump": jump}, open(os.path.join(HERE, "schedule.json"), "w"), indent=1)
    print("done")
