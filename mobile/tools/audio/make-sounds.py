"""Yavaya's interface sounds, synthesised from scratch (Chapter 07).

No samples and no third-party audio: every sound is built here from sine
partials, filtered noise and envelopes, so Yavaya owns all of it. Each sound is
loudness-matched (RMS target), peak-limited to -3 dBFS, faded at both ends (no
clicks) and encoded to AAC with ffmpeg.

  python3 -I tools/audio/make-sounds.py assets/audio
"""
import subprocess, sys, wave, os
import numpy as np

SR = 44100
OUT = sys.argv[1]
rng = np.random.default_rng(7)  # deterministic: the same sounds every run


def t(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack, release, curve=2.0):
    e = np.ones(n)
    a, r = int(SR * attack), int(SR * release)
    if a: e[:a] = np.linspace(0, 1, a) ** curve
    if r: e[-r:] *= np.linspace(1, 0, r) ** curve
    return e


def tone(freq, sec, phase_mod=0.0):
    x = t(sec)
    f = freq if np.isscalar(freq) else freq
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(f, x.shape)) / SR
    return np.sin(ph + phase_mod * np.sin(2 * np.pi * 5.1 * x))


def glide(f0, f1, sec):
    return tone(np.geomspace(f0, f1, int(SR * sec)), sec)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc; y[i] = acc
    return y


def air(sec, cutoff=3000):
    n = rng.standard_normal(int(SR * sec))
    return n - lowpass(n, cutoff)  # high-passed noise: breath, not hiss


def grains(sec, density0, density1, f_lo, f_hi, size=0.012):
    n = int(SR * sec); y = np.zeros(n)
    times = []
    tt = 0.0
    while tt < sec:
        d = density0 + (density1 - density0) * (tt / sec)
        tt += rng.exponential(1 / max(d, 1)); times.append(tt)
    g = int(SR * size); w = np.hanning(g)
    for s in times:
        i = int(s * SR)
        if i + g >= n: break
        f = rng.uniform(f_lo, f_hi)
        y[i:i + g] += np.sin(2 * np.pi * f * np.arange(g) / SR) * w * rng.uniform(0.3, 1.0)
    return y


def mix(*parts):
    n = max(len(p) for p in parts)
    y = np.zeros(n)
    for p in parts: y[:len(p)] += p
    return y


def pad(x, sec):
    return np.concatenate([np.zeros(int(SR * sec)), x])


def finish(x, rms=0.12):
    x = x - x.mean()
    x *= rms / max(np.sqrt(np.mean(x ** 2)), 1e-9)
    peak = np.max(np.abs(x))
    if peak > 0.707: x *= 0.707 / peak
    x *= env(len(x), 0.004, 0.02, 1.0)
    return x


SOUNDS = {
    # A system waking: sub resonance, harmonic shimmer, air, one clear bell.
    'awaken': lambda: mix(
        tone(55, 2.8) * env(int(SR * 2.8), 1.2, 1.2) * 0.9,
        sum(tone(220 * k * (1 + 0.002 * k), 2.6, 0.3) / k for k in (1, 2, 3, 5)) * env(int(SR * 2.6), 1.4, 1.0) * 0.35,
        lowpass(air(2.4, 2500), 6000) * env(int(SR * 2.4), 1.0, 1.0) * 0.12,
        pad(tone(1760, 1.0) * env(int(SR * 1.0), 0.01, 0.9, 3) * 0.25, 1.7),
    ),
    # A district coming up: a soft fifth that rises, with a precise tick.
    'district-init': lambda: mix(
        glide(330, 495, 0.7) * env(int(SR * 0.7), 0.06, 0.45) * 0.6,
        glide(495, 742, 0.6) * env(int(SR * 0.6), 0.1, 0.4) * 0.25,
        grains(0.05, 400, 400, 3000, 5000, 0.004) * 0.5,
    ),
    # Points of light gathering into a surface.
    'reconstruct': lambda: mix(
        grains(0.9, 40, 420, 2200, 6000) * env(int(SR * 0.9), 0.3, 0.2) * 0.5,
        glide(260, 390, 0.9) * env(int(SR * 0.9), 0.5, 0.25) * 0.4,
    ),
    # A surface releasing into points.
    'dissolve': lambda: mix(
        grains(0.8, 380, 30, 1800, 5000) * env(int(SR * 0.8), 0.02, 0.5) * 0.45,
        lowpass(air(0.8, 1500), 4000) * env(int(SR * 0.8), 0.02, 0.6) * 0.25,
        glide(392, 262, 0.7) * env(int(SR * 0.7), 0.02, 0.5) * 0.3,
    ),
    # A panel of light opening.
    'holo-emerge': lambda: mix(
        sum(tone(523 * k, 0.5) / k ** 1.5 for k in (1, 2, 3, 4)) * env(int(SR * 0.5), 0.18, 0.28) * 0.5,
        lowpass(air(0.45, 4000), 9000) * env(int(SR * 0.45), 0.2, 0.2) * 0.1,
    ),
    # Roxi: a warm, open chord with a slow shimmer.
    'roxi': lambda: mix(
        *(tone(f, 1.3, 0.15) * env(int(SR * 1.3), 0.25, 0.8) * g for f, g in ((220, 0.4), (277.2, 0.3), (329.6, 0.3), (493.9, 0.18), (659.3, 0.08))),
    ),
    # The Guardian: deeper, metallic, inharmonic like struck bronze, never loud.
    'guardian': lambda: mix(
        *(tone(110 * r, 1.5) * env(int(SR * 1.5), 0.01, 1.4, 2.5) * g for r, g in ((1, 0.5), (2.76, 0.22), (5.4, 0.1), (8.93, 0.04))),
        tone(55, 1.5) * env(int(SR * 1.5), 0.2, 1.2) * 0.3,
    ),
    'expand': lambda: glide(600, 900, 0.22) * env(int(SR * 0.22), 0.02, 0.15) * 0.6,
    'confirm': lambda: mix(
        tone(659.3, 0.3) * env(int(SR * 0.3), 0.005, 0.25, 2.5) * 0.5,
        pad(tone(987.8, 0.35) * env(int(SR * 0.35), 0.005, 0.3, 2.5) * 0.45, 0.09),
    ),
    'back': lambda: glide(700, 480, 0.18) * env(int(SR * 0.18), 0.01, 0.13) * 0.55,
    'notify': lambda: mix(
        tone(880, 0.4) * env(int(SR * 0.4), 0.005, 0.35, 2.5) * 0.4,
        pad(tone(1318.5, 0.45) * env(int(SR * 0.45), 0.005, 0.4, 2.5) * 0.35, 0.14),
    ),
    # Error: two low, muted notes; clear but not harsh.
    'error': lambda: mix(
        lowpass(tone(233, 0.2), 1200) * env(int(SR * 0.2), 0.005, 0.12) * 0.6,
        pad(lowpass(tone(220, 0.25), 1200) * env(int(SR * 0.25), 0.005, 0.2) * 0.6, 0.15),
    ),
}

os.makedirs(OUT, exist_ok=True)
for name, make in SOUNDS.items():
    x = finish(make())
    wav = os.path.join(OUT, f'{name}.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    m4a = os.path.join(OUT, f'{name}.m4a')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', m4a], check=True)
    os.remove(wav)
    print(f'{name:14s} {len(x) / SR:4.2f}s  peak {20 * np.log10(np.max(np.abs(x))):5.1f} dBFS  {os.path.getsize(m4a) // 1024} KB')
