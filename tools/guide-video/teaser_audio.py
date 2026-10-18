# Sound for the intro teaser: the guide's own opening (same score, same voice, same ducking),
# cut to the teaser's length, starting where the teaser's picture starts.
import os, json
import numpy as np
import mix as M
from render_v import TEASER_START

HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = 3.5   # end card held after the intro's last frame
if __name__ == "__main__":
    starts, cuts, length = M.schedule()
    score = M.load(os.path.join(HERE, "music", "score.mp3"), 2)
    score = score / (10 ** (M.rms_db(score[int(60 * M.SR):]) / 20))
    music, _ = M.build_music(score, length, starts)
    tl = M.TL["intro"]
    L = tl["total"] + TAIL
    m = music[: int(L * M.SR)].copy()
    v = M.load(tl["vo"], 1)
    v = v / (10 ** (M.rms_db(v[np.abs(v) > 0.01]) / 20)) * 10 ** (-17 / 20)
    voice = np.zeros(len(m), np.float32)
    i0 = int(tl["vo_offset"] * M.SR)
    vv = v[: len(voice) - i0]; voice[i0: i0 + len(vv)] = vv
    out = M.mix(voice, m)[int(TEASER_START * M.SR):]
    a = int(0.25 * M.SR); out[:a] *= np.linspace(0, 1, a)[:, None]
    b = int(2.8 * M.SR); out[-b:] *= np.linspace(1, 0, b)[:, None] ** 1.3
    M.write_wav(os.path.join(HERE, "audio", "teaser_raw.wav"), out)
    M.loudnorm(os.path.join(HERE, "audio", "teaser_raw.wav"), os.path.join(HERE, "audio", "teaser.wav"))
    print("teaser audio", round(len(out) / M.SR, 2), "s")
