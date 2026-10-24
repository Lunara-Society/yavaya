# The home page's living hero: the video model's clip of the market street, made to land exactly on the phone still.
#
#   python3 tools/hero-film/make_film.py <clip.mp4> [crf]
#
# The clip was generated from a 3:4 cut of market-2560.webp as its first frame, but a video model redraws that
# frame: here it came back 0.9% narrower and 1.9% shorter than the picture it was given, shifted by a pixel or two,
# and slightly darker. Faded in over the still as it was, the street visibly jumped. So:
#   1. fit   — match ~120 patches of the clip's first frame (buildings, church, volcano; never the cobbles or the
#              people, which the model re-invents) against the illustration; per-axis scale + offset, least squares;
#   2. cut   — take RECT (the phone still's rectangle, in market-2560 pixels) out of every frame through that fit;
#   3. grade — per-channel gain/offset that makes frame 0 match the still;
#   4. ease  — the motion rises out of the still and settles to rest (cosine ramps on the clip's clock; fractional
#              times blend the two nearest frames, which at these speeds reads as slow motion, not as ghosting);
#   5. encode — H.264 High, BT.709 tagged (the frames are matched in RGB, so the browser must decode with the same
#              matrix), faststart, no sound.
# RECT is also in platform/src/ui/site/art.tsx (MARKET_TALL_WIDTHS) and in the README's command for the stills.
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', '..', 'platform', 'public', 'art')
OUT = os.path.join(ART, 'market-film-720.mp4')
RECT = (1063, 8, 2128, 1428)          # left, top, right, bottom in market-2560.webp: 3:4, the street and the church
W, H, FPS = 720, 960, 24
EASE_IN, EASE_OUT = 0.75, 1.5         # seconds of the clip spent speeding up and slowing down (each takes twice that on screen)


def ffmpeg():
    if os.environ.get('FFMPEG'):
        return os.environ['FFMPEG']
    import imageio_ffmpeg  # pip install imageio-ffmpeg: a static ffmpeg with libx264
    return imageio_ffmpeg.get_ffmpeg_exe()


def decode(ff, clip, pix_fmt):
    probe = subprocess.run([ff, '-hide_banner', '-i', clip], capture_output=True, text=True).stderr
    w, h = next(map(int, tok.split('x')) for line in probe.splitlines() if 'Video:' in line
                for tok in line.replace(',', ' ').split() if tok.count('x') == 1 and tok.replace('x', '').isdigit())
    raw = subprocess.run([ff, '-loglevel', 'error', '-i', clip, '-f', 'rawvideo', '-pix_fmt', pix_fmt, '-'], capture_output=True, check=True).stdout
    channels = 3 if pix_fmt == 'rgb24' else 1
    return np.frombuffer(raw, np.uint8).reshape((-1, h, w, channels) if channels == 3 else (-1, h, w))


def fit(first, src):
    """Where the clip's pixels sit in the illustration: x_src = ax * x + bx, y_src = ay * y + by (x, y in clip pixels)."""
    h, w = first.shape
    # A first guess from the full-height assumption: slide the clip, scaled to the illustration's height, along it.
    s = src.shape[0] / h
    big = np.asarray(Image.fromarray(first).resize((round(w * s), src.shape[0]), Image.LANCZOS), np.float32)
    x0 = min(range(0, src.shape[1] - big.shape[1] + 1, 2), key=lambda x: float(np.mean(np.abs(src[::4, x:x + big.shape[1]:4] - big[::4, ::4]))))
    pts, size, search = [], 64, 20
    for py in range(60, int(big.shape[0] * 0.63), 70):
        for px in range(40, big.shape[1] - size - 40, 70):
            pa = big[py:py + size, px:px + size]
            if pa.std() < 12:
                continue  # flat sky says nothing about position
            pa_n = (pa - pa.mean()) / pa.std()

            def score(dx, dy):
                pb = src[py + dy:py + dy + size, x0 + px + dx:x0 + px + dx + size]
                return float(np.mean(pa_n * (pb - pb.mean()) / (pb.std() + 1e-6))) if pb.shape == pa.shape else -1.0

            # Every second pixel first, then the neighbours of the best.
            best = max((score(dx, dy), dx, dy) for dy in range(-search, search + 1, 2) for dx in range(-search, search + 1, 2))
            best = max((score(best[1] + i, best[2] + j), best[1] + i, best[2] + j) for j in (-1, 0, 1) for i in (-1, 0, 1))
            if best[0] > 0.9:
                c = size / 2
                pts.append((px + c, py + c, x0 + px + c + best[1], py + c + best[2]))
    pts = np.array(pts)
    ax, bx = np.polyfit(pts[:, 0] / s, pts[:, 2], 1)
    ay, by = np.polyfit(pts[:, 1] / s, pts[:, 3], 1)
    rms = math.sqrt(np.mean((pts[:, 2] - (ax * pts[:, 0] / s + bx)) ** 2 + (pts[:, 3] - (ay * pts[:, 1] / s + by)) ** 2))
    print(f'fit on {len(pts)} patches: x = {ax:.5f}·x + {bx:.1f}, y = {ay:.5f}·y + {by:.1f}, residual {rms:.2f}px')
    return ax, bx, ay, by


def clock(n_src):
    """Output frame -> fractional clip frame: ease in, run at speed, ease out to rest on the last frame."""
    last = (n_src - 1) / FPS
    t_in, t_out, mid = 2 * EASE_IN, 2 * EASE_OUT, last - EASE_IN - EASE_OUT

    def content(t):
        if t < t_in:
            return t / 2 - t_in / (2 * math.pi) * math.sin(math.pi * t / t_in)
        if t - t_in < mid:
            return EASE_IN + t - t_in
        u = min(t - t_in - mid, t_out)
        return EASE_IN + mid + u / 2 + t_out / (2 * math.pi) * math.sin(math.pi * u / t_out)

    n_out = int(round((t_in + mid + t_out) * FPS)) + 1
    return [min(content(n / FPS) * FPS, n_src - 1) for n in range(n_out)]


def main():
    clip, crf = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else '23')
    ff = ffmpeg()
    src = np.asarray(Image.open(os.path.join(ART, 'market-2560.webp')).convert('L'), np.float32)
    frames = decode(ff, clip, 'rgb24')
    ax, bx, ay, by = fit(np.asarray(Image.fromarray(frames[0]).convert('L')), src)
    box = ((RECT[0] - bx) / ax, (RECT[1] - by) / ay, (RECT[2] - bx) / ax, (RECT[3] - by) / ay)
    h, w = frames.shape[1:3]
    assert box[0] >= 0 and box[1] >= 0 and box[2] <= w and box[3] <= h, f'RECT falls outside the clip: {box}'

    def frame(f):
        i = min(int(f), len(frames) - 2)
        k = f - i
        img = frames[i] if k < 1e-3 else frames[i + 1] if k > 1 - 1e-3 else \
            np.clip(frames[i] * (1 - k) + frames[i + 1].astype(np.float32) * k + 0.5, 0, 255).astype(np.uint8)
        return np.asarray(Image.fromarray(img).resize((W, H), Image.LANCZOS, box=box), np.float32)

    still = np.asarray(Image.open(os.path.join(ART, 'market-2560.webp')).convert('RGB').crop(RECT).resize((W, H), Image.LANCZOS), np.float32)
    first = frame(0)
    gain = still.reshape(-1, 3).std(0) / first.reshape(-1, 3).std(0)
    offset = still.reshape(-1, 3).mean(0) - first.reshape(-1, 3).mean(0) * gain
    times = clock(len(frames))
    print(f'{len(frames)} clip frames -> {len(times)} ({(len(times) - 1) / FPS:.2f}s); grade gain {gain.round(3)} offset {offset.round(1)}')

    enc = subprocess.Popen([ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p',
                            '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'film', '-crf', crf, '-profile:v', 'high', '-level', '4.0',
                            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                            '-g', '48', '-movflags', '+faststart', '-an', OUT], stdin=subprocess.PIPE)
    for f in times:
        enc.stdin.write(np.clip(frame(f) * gain + offset + 0.5, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    if enc.wait():
        sys.exit('ffmpeg failed')
    print(f'{OUT}: {os.path.getsize(OUT) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
